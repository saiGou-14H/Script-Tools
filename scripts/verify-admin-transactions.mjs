import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import {
  adminOrderFixtures, adminPaymentFixtures, adminRefundFixtures, refundBalance,
} from "../apps/web/src/lib/admin-commerce-preview.ts";

const output = path.resolve("output/verification/admin-transaction-pages");
await mkdir(output, { recursive: true });
const root = path.resolve("apps/web");
const server = await preview({
  root, configFile: path.join(root, "vite.config.ts"),
  preview: { host: "127.0.0.1", port: 0, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001" } } },
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
const routes = [
  ["O06", "/admin/orders", ".admin-order-table"],
  ["O07", "/admin/orders/demo", ".admin-order-detail-grid"],
  ["O08", "/admin/payments", ".admin-payment-table"],
  ["O09", "/admin/refunds/demo", ".admin-refund-evidence"],
];
let page;
let developmentServer;
async function session(baseURL = base, live = false) {
  const context = await browser.newContext({ viewport: { width: 1814, height: 868 } });
  contexts.push(context);
  const login = await context.request.post(baseURL + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  if (live) await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  const current = await context.newPage();
  current.on("pageerror", (error) => report.errors.push(error.message));
  current.on("request", (request) => {
    if (request.url().includes("/api/v1/") &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()))
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return current;
}
async function navigate(current, route) {
  await current.evaluate((route) => {
    history.pushState(null, "", route);
    dispatchEvent(new PopStateEvent("popstate"));
  }, route);
}
try {
  page = await session();
  for (const [id, route, selector] of routes) {
    await page.goto(base + route);
    await expect(page.locator(selector)).toBeVisible();
    await page.mouse.move(1813, 867);
    await page.screenshot({ path: path.join(output, `ADMIN-${id}.png`),
      fullPage: true, animations: "disabled" });
    report.screenshots.push(`ADMIN-${id}`);
    report.layouts[id] = await page.evaluate((selector) => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom };
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
  for (const layout of Object.values(report.layouts)) {
    expect(layout.width).toBe(1814);
    expect(layout.height).toBe(868);
    expect(layout.main.bottom).toBeLessThanOrEqual(858);
    expect(layout.help.bottom).toBeLessThanOrEqual(858);
  }
  report.checks.push("four transaction reference regions and sidebar help fit 1814 by 868");

  const paymentIds = adminPaymentFixtures.map((payment) => payment.id);
  assert.equal(new Set(paymentIds).size, paymentIds.length);
  for (const order of adminOrderFixtures) {
    const payment = adminPaymentFixtures.find((payment) => payment.id === order.paymentId);
    assert.equal(payment?.orderId, order.id);
    assert.equal(payment.amountMinor, order.amountMinor);
  }
  for (const refund of adminRefundFixtures) assert.ok(paymentIds.includes(refund.paymentId));
  assert.deepEqual(refundBalance(adminPaymentFixtures[0], adminRefundFixtures),
    { returned: 0n, reserved: 800n, remaining: 0n });
  assert.equal(refundBalance(undefined, adminRefundFixtures), undefined);
  report.checks.push("orders and refunds reference distinct original payments and the unknown refund retains its reserved balance");

  await page.goto(base + "/admin/orders?source=verification&start=2026-11-12&end=2026-11-14&q=BK082");
  await page.getByLabel("关联预约编号", { exact: true }).fill("BK082");
  await page.getByLabel("用户", { exact: true }).fill("用户B");
  await page.getByLabel("订单号", { exact: true }).fill("TT202611130082");
  await page.getByRole("combobox", { name: "服务", exact: true }).click();
  await page.locator(".ant-select-dropdown .ant-select-item-option-content").getByText("景点预约", { exact: true }).click();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.reload();
  await expect(page.locator(".admin-order-table .ant-table-row")).toHaveCount(1);
  await expect(page.getByLabel("关联预约编号", { exact: true })).toHaveValue("BK082");
  await expect(page.getByLabel("用户", { exact: true })).toHaveValue("用户B");
  await expect(page.getByLabel("订单号", { exact: true })).toHaveValue("TT202611130082");
  expect(new URL(page.url()).searchParams.get("service")).toBe("景点预约");
  await expect(page.getByPlaceholder("开始日期", { exact: true })).toHaveValue("2026-11-12");
  await page.getByRole("button", { name: "清除检索", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("booking")).toBe("BK082");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.locator(".admin-order-table .ant-table-row")).toHaveCount(3);
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await page.goto(base + "/admin/orders?start=2026-11-31&end=2026-11-30");
  await expect(page.getByText("日期筛选无效，请重新选择完整日期范围。")).toBeVisible();
  await expect(page.locator(".admin-order-table .ant-table-row")).toHaveCount(0);
  report.checks.push("applied order, buyer, booking and date filters survive reload, clearing search preserves them, and invalid ranges stay explicit");

  await page.goto(base + "/admin/orders/TT202611130027");
  await page.getByRole("tab", { name: "支付事件", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: "支付事件", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "支付 PAY018", exact: true }).click();
  await expect(page.locator(".admin-payment-table .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".admin-payment-table .ant-table-row")).toContainText("8.00 CNY");
  await page.getByRole("link", { name: "PAY018", exact: true }).click();
  await expect(page.locator(".admin-order-hero")).toContainText("TT202611130027");
  await page.getByRole("tab", { name: "退款事件", exact: true }).click();
  await page.getByRole("link", { name: "查看异常处理", exact: true }).click();
  await expect(page.locator(".admin-refund-hero")).toContainText("REF018");
  await page.getByRole("link", { name: "PAY018", exact: true }).click();
  await expect(page.locator(".admin-payment-table .ant-table-row")).toContainText("PAY018");
  await page.goto(base + "/admin/orders/TT202611130018?tab=payment");
  await expect(page.locator(".admin-order-events")).toContainText("PAY0018");
  await expect(page.locator(".admin-order-events")).toContainText("6.00 CNY");
  report.checks.push("order event tabs and original-payment links retain their own order and refund identity, including the separate six-yuan payment");

  await page.goto(base + "/admin/payments?source=verification");
  await expect(page.locator(".admin-finance-stats strong")).toHaveText(["1", "1", "1"]);
  await page.getByRole("tab", { name: "收款", exact: true }).click();
  await page.reload();
  await expect(page.locator(".admin-payment-table .ant-table-row")).toHaveCount(5);
  await expect(page.locator(".admin-finance-stats strong")).toHaveText(["0", "0", "5"]);
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await page.goto(base + "/admin/payments?tab=refunds&refund=REF019");
  await page.getByRole("link", { name: "REF019", exact: true }).click();
  await page.getByRole("button", { name: "记录处理理由", exact: true }).click();
  await page.getByRole("dialog").getByLabel("处理理由", { exact: true }).fill("等待同一退款的原回执");
  await page.getByRole("button", { name: "保存处理预览", exact: true }).dblclick();
  await expect(page.locator(".admin-refund-evidence [role=tabpanel][aria-hidden=false] .ant-table-row")).toHaveCount(1);
  await page.getByRole("button", { name: "查询原退款", exact: true }).dblclick();
  await expect(page.locator(".admin-refund-hero")).toContainText("UNKNOWN");
  await page.getByRole("button", { name: "记录处理理由", exact: true }).click();
  await page.getByRole("dialog").getByLabel("处理理由", { exact: true }).fill("未提交草稿");
  await navigate(page, "/admin/refunds/REF018?tab=records");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("暂无处理记录", { exact: true })).toBeVisible();
  await navigate(page, "/admin/refunds/REF019?tab=records");
  await expect(page.locator(".admin-refund-evidence")).toContainText("等待同一退款的原回执");
  report.checks.push("payment and refund tabs use their own rows, note submissions deduplicate, and changing refunds clears the open form while preserving resource-scoped notes");

  const live = await session(base, true);
  for (const [, route] of routes) {
    await live.goto(base + route);
    await expect(live.getByText(/待接入/).first()).toBeVisible();
    await expect(live.locator(".admin-page .ant-table-row")).toHaveCount(0);
  }
  await live.goto(base + "/admin/payments");
  await expect(live.locator(".admin-finance-stats strong")).toHaveText(["—", "—", "—"]);
  for (const route of ["/admin/orders/missing", "/admin/refunds/missing", "/admin/payments?payment=missing"]) {
    await page.goto(base + route);
    await expect(page.locator(".ant-empty").first()).toBeVisible();
  }
  await page.goto(base + "/admin/orders/TT202611130027?tab=missing");
  await expect(page.getByRole("tab", { name: "退款事件", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(base + "/admin/refunds/REF019?tab=missing");
  await expect(page.getByRole("tab", { name: "证据材料", exact: true })).toHaveAttribute("aria-selected", "true");
  report.checks.push("live transaction metadata remains unavailable and missing identities retain empty states");

  developmentServer = await createServer({
    root, configFile: path.join(root, "vite.config.ts"),
    cacheDir: path.resolve(".local/admin-transactions-verification-vite"),
    server: { host: "127.0.0.1", port: 0, strictPort: true,
      proxy: { "/api": { target: "http://127.0.0.1:3001" } } },
  });
  await developmentServer.listen();
  const devAddress = developmentServer.httpServer.address();
  assert.ok(devAddress && typeof devAddress === "object");
  const devBase = `http://127.0.0.1:${devAddress.port}`;
  const evidence = await session(devBase);
  await evidence.goto(devBase + "/admin/refunds/REF019");
  await expect(evidence.locator(".admin-refund-balances")).toBeVisible();
  const moduleURL = await evidence.evaluate(() => performance.getEntriesByType("resource")
    .find((entry) => entry.name.includes("/src/lib/admin-commerce-preview.ts"))?.name);
  assert.ok(moduleURL);
  await evidence.evaluate(async (moduleURL) => {
    const data = await import(moduleURL);
    data.adminPaymentFixtures[0].amountMinor = "9223372036854775807";
    data.adminRefundFixtures[0].amountMinor = "7";
    data.adminRefundFixtures.push({
      ...data.adminRefundFixtures[0], id: "REF-partial", amountMinor: "3", status: "SUCCEEDED",
    });
    data.adminOrderFixtures[1].execution = "FINISHED";
  }, moduleURL);
  await navigate(evidence, "/admin/refunds/REF018");
  await navigate(evidence, "/admin/refunds/REF019");
  await expect(evidence.locator(".admin-refund-balances strong"))
    .toHaveText(["¥0.03", "¥0.07", "¥92233720368547757.97"]);
  await expect(evidence.locator(".admin-refund-payment")).toContainText("¥92233720368547758.07");
  await evidence.getByRole("link", { name: "PAY019", exact: true }).click();
  await expect(evidence.locator(".admin-payment-table")).toContainText("92233720368547758.07 CNY");
  await navigate(evidence, "/admin/orders/TT202611130082");
  await expect(evidence.locator(".admin-order-stages article strong"))
    .toHaveText(["已支付", "已结束", "待核验", "无退款"]);
  expect(await evidence.evaluate(() => document.documentElement.scrollWidth)).toBe(1814);
  report.checks.push("normal transaction routes preserve signed-64-bit original payments, partial returned and reserved amounts, and execution completion independently of goal verification");

  assert.equal(refundBalance({ ...adminPaymentFixtures[0], status: "UNKNOWN" }, adminRefundFixtures), undefined);
  assert.equal(refundBalance({ ...adminPaymentFixtures[0], amountMinor: "1" }, adminRefundFixtures), undefined);
  report.checks.push("unconfirmed original payments and over-allocated refund facts leave refundable balances unavailable");

  const mobile = await session();
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const [, route, selector] of routes) {
    await mobile.goto(base + route);
    await expect(mobile.locator(selector)).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  report.checks.push("all four transaction routes fit 390px with internally scrollable tables and stacked forms");
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("transaction previews issue no business mutations and complete without browser exceptions");
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
