import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview, createServer } from "vite";

const output = path.resolve("output/verification/consumer-pages");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const root = path.resolve("apps/web");
const server = await preview({
  root,
  configFile: path.join(root, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001" } },
  },
});
const address = server.httpServer.address();
if (!address || typeof address !== "object")
  throw new Error("Preview address is unavailable");
const base = `http://127.0.0.1:${address.port}`;
let providerProbe;
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: {},
  errors: [],
};
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
async function capture(id, route, title) {
  await page.goto(base + route);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  if (["USER-C02", "USER-C03"].includes(id)) {
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      helpBottom: document
        .querySelector(".sidebar .nav-group:last-child .nav-item")
        .getBoundingClientRect().bottom,
    }));
    expect(layout.width).toBe(1814);
    expect(layout.height).toBe(868);
    expect(layout.helpBottom).toBeLessThanOrEqual(868);
    report.layouts[id] = layout;
  }
  await page.screenshot({
    path: path.join(output, `${id}.png`),
    fullPage: true,
  });
  report.screenshots.push(id);
}
try {
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "consumer@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  const catalog = (
    await (await context.request.get(base + "/api/v1/services")).json()
  ).data;
  const tableService = catalog.find(
    (item) => item.input_schema_digest === "schema-table",
  );
  assert(tableService);
  providerProbe = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    plugins: [
      {
        name: "prototype-provider-probe",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "virtual:consumer-provider") return "\0consumer-provider";
          if (id === "./context" && importer?.endsWith("prototype.tsx"))
            return "\0workspace-fixture";
        },
        load(id) {
          if (id === "\0workspace-fixture")
            return 'export const useWorkspace = () => ({ bootstrap: { data_mode: "prototype" } });';
          if (id === "\0consumer-provider")
            return `
        import React from 'react';
        import { renderToString } from 'react-dom/server';
        import { PrototypeProvider, usePrototype } from '/apps/web/src/prototype.tsx';
        export function probe(service) {
          let result;
          function Probe() {
            const { createOrder, cancelUnpaidOrder } = usePrototype();
            const input = { nested: ['original'] };
            const first = createOrder(service, 'same-turn', input);
            input.nested[0] = 'changed';
            const second = createOrder({ ...service, amount_minor: '1' }, 'same-turn', {});
            cancelUnpaidOrder(first.id);
            const closed = createOrder(service, 'same-turn', {});
            const otherOrder = createOrder(service, 'different-key', input);
            result = { same: first === second, first, closed, otherOrder };
            return null;
          }
          renderToString(React.createElement(PrototypeProvider, null, React.createElement(Probe)));
          return result;
        }`;
        },
      },
    ],
  });
  const { probe } = await providerProbe.ssrLoadModule(
    "virtual:consumer-provider",
  );
  const replay = probe(tableService);
  assert(replay.same);
  assert.equal(replay.first.amountMinor, tableService.amount_minor);
  assert.deepEqual(replay.first.input, { nested: ["original"] });
  assert.equal(replay.closed.fulfillment, "CLOSED");
  assert.notEqual(replay.first.id, replay.otherOrder.id);
  report.checks.push(
    "same-turn prototype submissions preserve one cloned snapshot, cancellation replay and separate purchase intents",
  );
  await page.clock.install();
  await capture("USER-C02", "/checkout", "确认订单");
  await page.getByRole("checkbox").uncheck();
  await expect(
    page.getByRole("button", { name: "提交订单", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "提交订单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "收银台", exact: true }),
  ).toBeVisible();
  const cashierPath = new URL(page.url()).pathname;
  expect(cashierPath).toContain("PREVIEW-");
  report.checks.push(
    "confirm terms and submit once creates a prototype order and opens cashier",
  );
  await page.getByRole("button", { name: "查看支付状态", exact: true }).click();
  await expect(
    page.getByText("尚未收到支付确认回执，请等待渠道确认"),
  ).toBeVisible();
  report.checks.push(
    "payment query preserves pending state without a trusted receipt",
  );
  const beforeDeadline = await page.getByRole("timer").textContent();
  await page.clock.fastForward(2000);
  await expect(page.getByRole("timer")).not.toHaveText(beforeDeadline);
  await page.clock.fastForward(600_000);
  await expect(page.getByRole("timer")).toHaveText("支付期限已到00:00");
  await expect(page.locator(".payment-status > .status")).toContainText(
    "等待支付",
  );
  await page.getByRole("button", { name: "查看支付状态", exact: true }).click();
  await expect(
    page.getByText("尚未收到支付确认回执，请等待渠道确认"),
  ).toBeVisible();
  report.checks.push(
    "prototype deadline ticks from an absolute expiry and reaching zero preserves unconfirmed payment facts",
  );
  await page.getByRole("button", { name: "取消订单", exact: true }).click();
  await page.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的订单", exact: true }),
  ).toBeVisible();
  await page
    .locator(".pill-tabs")
    .getByRole("button", { name: "已关闭", exact: true })
    .click();
  await expect(page.locator(".orders-list .ant-table-row")).toHaveCount(1);
  report.checks.push(
    "cancelling unpaid preview order updates order list and closed filter",
  );
  await page
    .getByRole("link", { name: cashierPath.split("/")[2], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "去支付", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await capture("USER-C03", "/checkout/demo/pay", "收银台");
  await expect(page.locator(".refund-rule-highlight")).toHaveText(
    "退款规则待载入",
  );
  await expect(page.locator(".cashier-grid > aside dl")).toContainText(
    "服务类型待载入",
  );
  await page.goto(base + "/checkout/OD202611130001/pay");
  await expect(page.locator(".payment-status > .status")).toContainText(
    "已支付",
  );
  await expect(page.locator(".payment-countdown")).toHaveText("支付已确认");
  await expect(
    page.getByRole("button", { name: "取消订单", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".refund-rule-highlight")).toHaveText(
    "目标未达全退",
  );
  report.checks.push(
    "legacy orders expose missing snapshot fields and paid orders retain their contract with cancellation disabled",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/checkout", "/checkout/demo/pay"]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  report.checks.push(
    "checkout and cashier fit a 390px viewport through their normal routes",
  );
  await capture("USER-C04", "/me/orders", "我的订单");
  await capture("USER-C05", "/me/orders/demo", "订单详情");
  await capture("USER-C06", "/me/services", "已购服务");
  await page
    .locator(".purchased-tabs")
    .getByRole("button", { name: /使用中/ })
    .click();
  await expect(page.locator(".purchased-card")).toHaveCount(1);
  await page.getByRole("button", { name: /查看任务/ }).click();
  await expect(
    page.getByRole("heading", { name: "任务详情", exact: true }),
  ).toBeVisible();
  report.checks.push("purchased entitlement filters and task navigation work");
  await capture("USER-C11", "/me/runs/demo", "运行详情");
  await page.getByRole("tab", { name: "脱敏日志" }).click();
  await expect(page.locator(".run-log-lines>div")).toHaveCount(6);
  await page.getByRole("tab", { name: "产物", exact: true }).click();
  await expect(page.getByText("cleaned.csv", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "通知", exact: true }).click();
  await expect(page.getByText("站内消息", { exact: true })).toBeVisible();
  report.checks.push(
    "run detail keeps logs, outputs and notification states in their own tabs",
  );
  expect(report.errors).toEqual([]);
  report.checks.push("new consumer pages render without browser exceptions");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
  process.exitCode = 1;
} finally {
  await providerProbe?.close();
  await browser.close();
  await server.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
