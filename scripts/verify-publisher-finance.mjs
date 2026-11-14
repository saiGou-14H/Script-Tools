import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import {
  earningsLedger,
  settlementPreview,
} from "../apps/web/src/lib/publisher-finance-preview.ts";

const output = path.resolve("output/verification/publisher-finance-pages");
await mkdir(output, { recursive: true });
const root = path.resolve("apps/web");
const server = await preview({
  root,
  configFile: path.join(root, "vite.config.ts"),
  preview: {
    host: "127.0.0.1", port: 0, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001" } },
  },
});
const address = server.httpServer.address();
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const contexts = [];
const mutations = [];
const report = {
  date: new Date().toISOString(), checks: [], screenshots: [], errors: [],
  layouts: {}, final_visual_acceptance: "pending",
};
let page;
let developmentServer;
async function session(baseURL = base, live = false) {
  const context = await browser.newContext({ viewport: { width: 1814, height: 868 } });
  contexts.push(context);
  const login = await context.request.post(baseURL + "/api/v1/auth/login", {
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  if (live) {
    await context.route("**/api/v1/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.data_mode = "live";
      await route.fulfill({ response, json: body });
    });
  }
  const current = await context.newPage();
  current.on("pageerror", (error) => report.errors.push(error.message));
  current.on("request", (request) => {
    if (request.url().includes("/api/v1/") &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  return current;
}
async function capture(id, route, selector) {
  await page.goto(base + route);
  await expect(page.locator(selector)).toBeVisible();
  await page.mouse.move(1813, 867);
  await page.screenshot({
    path: path.join(output, id + ".png"), fullPage: true, animations: "disabled",
  });
  report.screenshots.push(id);
  report.layouts[id] = await page.evaluate((selector) => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      main: bounds(document.querySelector(selector)),
      help: bounds([...document.querySelectorAll(".sidebar a")]
        .find((link) => link.textContent.includes("使用帮助"))),
    };
  }, selector);
}
try {
  page = await session();
  await capture("PUBLISHER-S13", "/publisher/earnings", ".earnings-ledger");
  await capture("PUBLISHER-S14", "/publisher/settlements/demo", ".settlement-detail-panel");
  for (const layout of Object.values(report.layouts)) {
    expect(layout.width).toBe(1814);
    expect(layout.height).toBe(868);
    expect(layout.main.bottom).toBeLessThanOrEqual(858);
    expect(layout.help.bottom).toBeLessThanOrEqual(858);
  }
  report.checks.push("earnings and settlement reference regions and sidebar help fit 1814 by 868");

  for (const group of earningsLedger) {
    const net = BigInt(group.income) + BigInt(group.fee) + BigInt(group.refund);
    const allocation = [group.pending, group.available, group.reserved, group.paid, group.frozen]
      .reduce((sum, value) => sum + BigInt(value), 0n);
    assert.equal(net, allocation);
  }
  const settlementNet = settlementPreview.lines.reduce(
    (sum, line) => sum + BigInt(line.income) - BigInt(line.fee) - BigInt(line.refund), 0n,
  );
  assert.equal(settlementNet.toString(), settlementPreview.amountMinor);
  for (const line of settlementPreview.lines) {
    assert.ok(earningsLedger.some((group) => group.id === line.ledgerGroupId));
  }
  for (const group of earningsLedger) {
    const lines = settlementPreview.lines.filter((line) => line.ledgerGroupId === group.id);
    const reserved = lines.reduce(
      (sum, line) => sum + BigInt(line.income) - BigInt(line.fee) - BigInt(line.refund), 0n,
    );
    assert.equal(BigInt(group.reserved), reserved);
  }
  await page.goto(base + "/publisher/earnings");
  await expect(page.locator(".publisher-earnings-summary strong"))
    .toHaveText(["680", "80", "60", "540"]);
  await expect(page.locator(".earnings-distribution article strong"))
    .toHaveText(["300 元", "200 元", "40 元", "0 元"]);
  await expect(page.locator(".earnings-ledger .ant-table-row")).toHaveCount(4);
  report.checks.push("ledger groups reconcile to income, fees, refund reversals and distinct pending, available, reserved and paid allocations");

  await page.getByLabel("待结算金额组成", { exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText("待成熟100元，打款预占200元");
  await page.getByRole("button", { name: "申请打款", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("200.00元");
  await expect(dialog).toContainText("L003");
  await expect(dialog).not.toContainText("L001");
  await expect(dialog).not.toContainText("L002");
  await page.getByRole("button", { name: "提交申请", exact: true }).dblclick();
  await expect(page.getByText("打款接口尚未接入，当前可结算收益保留").first()).toBeVisible();
  await dialog.getByRole("button", { name: "返回", exact: true }).click();
  report.checks.push("pending composition exposes the reserved batch and a new payout preview selects the separate available ledger scope");

  await page.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await expect(page).toHaveURL(/settlements\/SET018$/);
  await expect(page.locator(".settlement-fact-cards article").first()).toContainText("SET018");
  await expect(page.locator(".settlement-detail-panel .ant-table-row")).toHaveCount(2);
  await expect(page.locator(".ant-table-summary .ant-table-cell"))
    .toHaveText(["合计", "230", "10", "20", "200元"]);
  await page.getByRole("link", { name: "TT202611130101", exact: true }).click();
  await expect(page).toHaveURL(/ledger=L001/);
  await page.reload();
  await expect(page.locator(".earnings-ledger")).toContainText("已定位账本分组L001");
  await expect(page.locator(".earnings-ledger .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".earnings-ledger .ant-table-row")).toContainText("182 元");
  await page.getByRole("link", { name: "查看全部账本", exact: true }).click();
  await expect(page.locator(".earnings-ledger .ant-table-row")).toHaveCount(4);
  await page.getByRole("link", { name: "费用配置", exact: true }).click();
  await expect(page).toHaveURL(/pricing\?service=booking$/);
  await expect(page.getByRole("textbox", { name: "服务费", exact: true })).toHaveValue("8.00");
  report.checks.push("settlement lines open their own ledger groups, selection survives reload, and fee configuration opens the booking service");

  await page.goto(base + "/publisher/settlements/SET018");
  await expect(page.locator(".settlement-fact-cards article").nth(1)).toContainText("P0018");
  await expect(page.locator(".settlement-fact-cards article").nth(1)).toContainText("处理中");
  await expect(page.locator(".settlement-steps .ant-steps-item-finish")).toHaveCount(3);
  await page.getByRole("button", { name: "查询原请求", exact: true }).dblclick();
  await expect(page.getByText("原请求P0018的回执查询接口待接入").first()).toBeVisible();
  await expect(page.locator(".settlement-fact-cards article").nth(1)).toContainText("待渠道回执");
  report.checks.push("repeated receipt queries retain the original payout identity and the pending channel state");

  await page.goto(base + "/publisher/settings");
  await page.getByRole("button", { name: "更新收款资料", exact: true }).click();
  await page.getByLabel("收款账户令牌", { exact: true }).fill("preview-payout-account-5678");
  await page.getByRole("button", { name: "保存资料预览", exact: true }).click();
  await expect(page.getByText("********5678", { exact: true })).toBeVisible();
  await page.locator(".sidebar")
    .getByRole("link", { name: "收益与结算", exact: true }).click();
  await expect(page.getByRole("button", { name: "申请打款", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await expect(page.locator(".settlement-fact-cards article").last()).toContainText("****1234");
  await expect(page.locator(".settlement-fact-cards article").last()).not.toContainText("5678");
  report.checks.push("new unverified payout details disable new requests while the historical settlement retains its account snapshot");

  await page.goto(base + "/publisher/earnings?ledger=missing");
  await expect(page.locator(".earnings-ledger")).toContainText("账本分组missing不存在或当前不可用");
  await expect(page.locator(".earnings-ledger .ant-table-row")).toHaveCount(0);
  await page.goto(base + "/publisher/settlements/missing");
  await expect(page.getByText("结算批次不存在或已失效", { exact: true })).toBeVisible();
  const live = await session(base, true);
  await live.goto(base + "/publisher/earnings");
  await expect(live.locator(".publisher-earnings-summary strong"))
    .toHaveText(["—", "—", "—", "—"]);
  await expect(live.locator(".earnings-distribution article strong"))
    .toHaveText(["— 元", "— 元", "— 元", "— 元"]);
  await expect(live.getByRole("button", { name: "申请打款", exact: true })).toBeDisabled();
  await live.goto(base + "/publisher/settlements/SET018");
  await expect(live.getByText("结算服务待接入，批次详情暂不可用", { exact: true })).toBeVisible();
  report.checks.push("unknown ledger and settlement resources keep their identity and live earnings expose unknown monetary values and pending integration");

  developmentServer = await createServer({
    root, configFile: path.join(root, "vite.config.ts"),
    cacheDir: path.resolve(".local/publisher-finance-verification-vite"),
    server: { host: "127.0.0.1", port: 0, strictPort: true,
      proxy: { "/api": { target: "http://127.0.0.1:3001" } } },
  });
  await developmentServer.listen();
  const devAddress = developmentServer.httpServer.address();
  assert.ok(devAddress && typeof devAddress === "object");
  const devBase = `http://127.0.0.1:${devAddress.port}`;
  const precision = await session(devBase);
  await precision.goto(devBase + "/publisher/settlements/SET018");
  await expect(precision.locator(".settlement-fact-cards")).toBeVisible();
  const moduleURL = await precision.evaluate(() => performance.getEntriesByType("resource")
    .find((entry) => entry.name.includes("/src/lib/publisher-finance-preview.ts"))?.name);
  assert.ok(moduleURL);
  await precision.evaluate(async (moduleURL) => {
    const data = await import(moduleURL);
    data.earningsLedger.splice(0, data.earningsLedger.length, {
      id: "L003", income: "9223372036854775807", fee: "0", refund: "-7",
      pending: "0", available: "0", reserved: "9223372036854775800", paid: "0", frozen: "0",
    });
    data.settlementPreview.lines = [{
      id: "TX-large", ledgerGroupId: "L003", income: "9223372036854775807", refund: "7", fee: "0",
    }];
    data.settlementPreview.amountMinor = "9223372036854775800";
  }, moduleURL);
  await precision.locator(".sidebar").getByRole("link", { name: "收益与结算", exact: true }).click();
  await expect(precision.locator(".publisher-earnings-summary strong").first())
    .toHaveText("92233720368547758.07");
  await expect(precision.locator(".publisher-earnings-summary strong").last())
    .toHaveText("92233720368547758");
  await expect(precision.getByRole("button", { name: "申请打款", exact: true })).toBeDisabled();
  await precision.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await expect(precision.locator(".ant-table-summary .ant-table-cell"))
    .toHaveText(["合计", "92233720368547758.07", "0.07", "0", "92233720368547758元"]);
  expect(await precision.evaluate(() => document.documentElement.scrollWidth)).toBe(1814);
  report.checks.push("the normal earnings and settlement entries recompute edited local evidence with exact signed-64-bit monetary values and a matching payout snapshot");

  const mobile = await session();
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/publisher/earnings", "/publisher/settlements/SET018"]) {
    await mobile.goto(base + route);
    await expect(mobile.locator(".page-heading h1")).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  report.checks.push("both financial routes fit 390px with internally scrollable ledger and settlement tables");
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("financial preview actions issue no business mutations and complete without browser exceptions");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  if (developmentServer) await developmentServer.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
