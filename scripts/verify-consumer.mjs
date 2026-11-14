import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";

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
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
async function capture(id, route, title) {
  await page.goto(base + route);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
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
  await capture("USER-C03", "/checkout/demo/pay", "收银台");
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
  await browser.close();
  await server.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
