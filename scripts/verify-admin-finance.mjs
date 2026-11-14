import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { earningsLedger, settlementPreview } from "../apps/web/src/lib/publisher-finance-preview.ts";

const output = path.resolve("output/verification/admin-finance-pages");
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
  ["O10", "/admin/reconciliation", ".admin-reconciliation-page > .panel"],
  ["O11", "/admin/settlements", ".admin-settlement-columns"],
  ["O12", "/admin/commerce-policies", ".admin-policy-columns"],
];
let page;
let developmentServer;
async function session(baseURL = base, live = false, publisher = false) {
  const context = await browser.newContext({ viewport: { width: 1814, height: 868 } });
  contexts.push(context);
  const login = await context.request.post(baseURL + "/api/v1/auth/login", {
    data: { email: publisher ? "publisher@example.invalid" : "admin@example.invalid", password: "TravelTools2026!" },
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
async function choose(current, label, value) {
  await current.getByRole("combobox", { name: label, exact: true }).click();
  await current.locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText(value, { exact: true }).click();
}
try {
  page = await session();
  for (const [id, route, selector] of routes) {
    await page.goto(base + route);
    await expect(page.locator(selector)).toBeVisible();
    await page.mouse.move(1813, 867);
    await page.screenshot({ path: path.join(output, `ADMIN-${id}.png`), fullPage: true, animations: "disabled" });
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
        help: bounds([...document.querySelectorAll(".sidebar a")].find((link) => link.textContent.includes("使用帮助"))),
      };
    }, selector);
  }
  for (const layout of Object.values(report.layouts)) {
    expect(layout.width).toBe(1814);
    expect(layout.height).toBe(868);
    expect(layout.main.bottom).toBeLessThanOrEqual(860);
    expect(layout.help.bottom).toBeLessThanOrEqual(858);
  }
  report.checks.push("reconciliation, settlement and policy reference regions and sidebar help fit 1814 by 868");

  await page.goto(base + "/admin/reconciliation?source=verification");
  await expect(page.locator(".admin-reconciliation-stats strong")).toHaveText(["2", "1", "0"]);
  await choose(page, "对账渠道", "全部渠道");
  await expect(page).toHaveURL(/channel=ALL/);
  await page.getByLabel("对账日期", { exact: true }).click();
  await expect(page.locator(".ant-picker-dropdown:visible")).toBeVisible();
  await expect(page.locator(".ant-picker-dropdown:visible .ant-picker-month-btn")).toHaveText("11月");
  await page.getByLabel("对账日期", { exact: true }).fill("2026-11-14");
  await page.getByLabel("对账日期", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/date=2026-11-14/);
  await page.reload();
  await expect(page.getByLabel("对账日期", { exact: true })).toHaveValue("2026-11-14");
  await expect(page.locator(".admin-reconciliation-stats strong")).toHaveText(["0", "0", "0"]);
  await expect(page.getByRole("button", { name: "查询原退款", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "查询原退款", exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await navigate(page, "/admin/reconciliation?date=all&channel=ALL");
  await expect(page.locator(".admin-reconciliation-page .ant-table-row")).toHaveCount(3);
  await navigate(page, "/admin/reconciliation?date=2026-11-31");
  await expect(page.getByText("对账日期无效，请重新选择。")).toBeVisible();
  await expect(page.getByRole("button", { name: "启动对账", exact: true })).toBeDisabled();
  report.checks.push("date and channel filters persist in the URL, all-date selection is explicit, and unavailable refunds expose a disabled button without a link");

  await navigate(page, "/admin/reconciliation?date=2026-11-13&channel=A");
  await page.getByRole("button", { name: "启动对账", exact: true }).click();
  await page.getByRole("dialog").getByLabel("核对理由", { exact: true }).fill("13日渠道A原回执核对");
  await page.getByRole("button", { name: "记录核对预览", exact: true }).dblclick();
  await page.getByRole("button", { name: "查看核对记录", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("13日渠道A原回执核对");
  await page.getByRole("button", { name: "关闭记录", exact: true }).click();
  await navigate(page, "/admin/reconciliation?date=2026-11-14&channel=A");
  await page.getByRole("button", { name: "查看核对记录", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭记录", exact: true }).click();
  await page.getByRole("button", { name: "启动对账", exact: true }).click();
  await navigate(page, "/admin/reconciliation?date=2026-11-13&channel=A");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "查询原退款", exact: true }).click();
  await expect(page.locator(".admin-refund-hero")).toContainText("REF019");
  await expect(page.locator(".admin-refund-hero")).toContainText("UNKNOWN");
  report.checks.push("local reconciliation notes deduplicate within a captured date/channel scope and filter changes close the form without resolving the original unknown refund");

  await page.goto(base + "/admin/settlements?source=verification");
  await expect(page.locator(".admin-settlement-columns .selected-row")).toContainText("P0018");
  await expect(page.locator(".admin-settlement-ledger .notice").first()).toContainText("230 元收入 - 20 元费用 - 10 元退款 = 200 元");
  await page.getByRole("button", { name: "SET017", exact: true }).click();
  await page.reload();
  await expect(page.locator(".admin-settlement-columns .selected-row")).toContainText("PO017");
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await page.getByRole("button", { name: "查询原回执", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("PO017");
  await expect(page.getByRole("dialog")).toContainText("****1234");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "SET018", exact: true }).click();
  await page.goBack();
  await expect(page.locator(".admin-settlement-columns .selected-row")).toContainText("PO017");
  await page.goForward();
  await expect(page.locator(".admin-settlement-columns .selected-row")).toContainText("P0018");
  await page.getByRole("button", { name: "查看账本", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText("TT202611130101");
  await expect(page.getByRole("dialog")).toContainText("L002");
  await expect(page.getByRole("dialog")).toContainText("P0018");
  await page.getByRole("button", { name: "关闭账本", exact: true }).click();
  await page.getByRole("button", { name: "查询原回执", exact: true }).dblclick();
  await expect(page.locator(".admin-settlement-columns .selected-row")).toContainText("处理中");
  report.checks.push("settlement selection survives reload and opens its own immutable payout receipt, ledger lines and canonical P0018 request");

  await page.getByLabel("待结算金额组成", { exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText("待成熟100元，打款预占200元");
  await page.getByRole("button", { name: "生成批次", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("200.00 CNY");
  await expect(page.getByRole("dialog")).toContainText("L003");
  await expect(page.getByRole("dialog")).not.toContainText("L001");
  await expect(page.getByRole("dialog")).not.toContainText("L002");
  await expect(page.getByRole("dialog")).toContainText("当前收款资料待载入");
  await page.getByRole("button", { name: "提交生成", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("请选择结算期间", { exact: true })).toBeVisible();
  const period = page.getByRole("dialog");
  await period.getByPlaceholder("开始日期", { exact: true }).fill("2026-11-01");
  await period.getByPlaceholder("结束日期", { exact: true }).fill("2026-11-13");
  await period.getByPlaceholder("结束日期", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "提交生成", exact: true }).dblclick();
  await expect(page.getByText("结算批次接口尚未接入，可结算范围保留").first()).toBeVisible();
  await period.getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.locator(".admin-settlement-columns").first().locator(".ant-table-row")).toHaveCount(5);
  assert.equal(settlementPreview.payoutId, "P0018");
  assert.equal(earningsLedger.filter((group) => BigInt(group.available) > 0n).map((group) => group.id).join(","), "L003");
  const publisher = await session(base, false, true);
  await publisher.goto(base + "/publisher/settlements/SET018");
  await expect(publisher.locator(".settlement-fact-cards")).toContainText("P0018");
  report.checks.push("batch generation previews the separate available L003 scope, retains funds while integration is pending, and shares SET018 with the publisher view");

  await page.goto(base + "/admin/commerce-policies?version=3&source=verification");
  await expect(page.getByRole("textbox", { name: "平台费率", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "平台费率", exact: true })).toHaveValue("5");
  await page.locator(".admin-policy-versions button").nth(1).click();
  await page.getByRole("radio", { name: "由用户承担", exact: true }).check();
  await expect(page.locator(".admin-policy-example article").first()).toContainText("待渠道报价");
  await expect(page.locator(".admin-policy-example article").last()).toContainText("95.00 元");
  await page.getByRole("radio", { name: "由发布者承担", exact: true }).check();
  await expect(page.locator(".admin-policy-example article").first()).toContainText("100.00 元");
  await expect(page.locator(".admin-policy-example article").last()).toContainText("待渠道报价");
  await page.getByRole("radio", { name: "由平台承担", exact: true }).check();
  await page.getByRole("textbox", { name: "平台费率", exact: true }).fill("100");
  await expect(page.locator(".admin-policy-example article").last()).toContainText("0.00 元");
  await page.getByRole("textbox", { name: "平台费率", exact: true }).fill("0");
  await expect(page.locator(".admin-policy-example article").last()).toContainText("100.00 元");
  report.checks.push("policy URI selection restores the saved version and channel-cost previews leave unknown consumer totals or publisher net proceeds pending the channel quote");

  await page.getByRole("textbox", { name: "平台费率", exact: true }).fill("101");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByText("费率须为0至100之间的数值，最多两位小数", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "平台费率", exact: true }).fill("7.50");
  await page.getByRole("button", { name: "保存新版本", exact: true }).dblclick();
  await expect(page.locator(".admin-policy-form")).toContainText("规则配置（v4）");
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await choose(page, "规则历史版本", "v3 · 5.00%");
  await expect(page.getByRole("textbox", { name: "平台费率", exact: true })).toHaveValue("5");
  await expect(page.locator(".admin-policy-versions button").first()).toHaveAttribute("aria-pressed", "false");
  await navigate(page, "/admin/orders/TT202611130027?tab=contract");
  await expect(page.locator(".admin-contract-snapshot")).toContainText("v3 · 平台费率5%");
  await navigate(page, "/admin/commerce-policies?version=999");
  await expect(page.getByText("费用规则版本999不存在或已失效")).toBeVisible();
  await expect(page.locator(".admin-policy-form")).toHaveCount(0);
  await navigate(page, "/admin/settlements?batch=missing");
  await expect(page.getByText("结算批次missing不存在或已失效")).toBeVisible();
  await expect(page.locator(".admin-settlement-hero strong")).toHaveText(["— 元", "— 元", "— 元"]);
  await expect(page.getByRole("button", { name: "生成批次", exact: true })).toBeDisabled();
  report.checks.push("duplicate policy saves retain one new version, historical selection stays distinct from the active version, and unknown policies or batches retain their own identity");

  const live = await session(base, true);
  for (const [, route] of routes) {
    await live.goto(base + route);
    await expect(live.getByText(/待接入|尚未接入/).first()).toBeVisible();
    await expect(live.locator(".admin-page .ant-table-row")).toHaveCount(0);
  }
  await live.goto(base + "/admin/reconciliation");
  await expect(live.locator(".admin-reconciliation-stats strong")).toHaveText(["—", "—", "—"]);
  await live.goto(base + "/admin/settlements");
  await expect(live.locator(".admin-settlement-hero strong")).toHaveText(["— 元", "— 元", "— 元"]);
  await expect(live.locator(".admin-settlement-hero")).not.toContainText("SET018");
  report.checks.push("live reconciliation and settlement counters remain unavailable and live policy records expose their integration state");

  developmentServer = await createServer({
    root, configFile: path.join(root, "vite.config.ts"),
    cacheDir: path.resolve(".local/admin-finance-verification-vite"),
    server: { host: "127.0.0.1", port: 0, strictPort: true,
      proxy: { "/api": { target: "http://127.0.0.1:3001" } } },
  });
  await developmentServer.listen();
  const devAddress = developmentServer.httpServer.address();
  assert.ok(devAddress && typeof devAddress === "object");
  const devBase = `http://127.0.0.1:${devAddress.port}`;
  const precision = await session(devBase);
  await precision.goto(devBase + "/admin/settlements");
  await expect(precision.locator(".admin-settlement-ledger")).toBeVisible();
  const modules = await precision.evaluate(() => ({
    shared: performance.getEntriesByType("resource").find((entry) => entry.name.includes("/src/lib/publisher-finance-preview.ts"))?.name,
    admin: performance.getEntriesByType("resource").find((entry) => entry.name.includes("/src/lib/admin-finance-preview.ts"))?.name,
  }));
  assert.ok(modules.shared && modules.admin);
  await precision.evaluate(async (modules) => {
    const shared = await import(modules.shared);
    const admin = await import(modules.admin);
    shared.settlementPreview.lines = [{
      id: "TRACE-large", ledgerGroupId: "L001", income: "9223372036854775807", fee: "7", refund: "3",
    }];
    shared.settlementPreview.amountMinor = "9223372036854775797";
    shared.settlementPreview.status = "UNKNOWN";
    shared.earningsLedger.splice(0, shared.earningsLedger.length, {
      id: "L001", income: "9223372036854775807", fee: "-7", refund: "-3", pending: "0",
      available: "0", reserved: "9223372036854775797", paid: "0", frozen: "0",
    });
    admin.reconciliationRows.push({
      id: "P0018", date: "2026-11-13", channel: "A", description: "原打款回执未知",
      result: "待查询", resolved: false, kind: "payout",
    });
  }, modules);
  await navigate(precision, "/admin/reconciliation");
  await expect(precision.locator(".admin-reconciliation-stats strong")).toHaveText(["2", "1", "1"]);
  await navigate(precision, "/admin/settlements?batch=SET018");
  await expect(precision.locator(".admin-settlement-ledger .notice").first()).toContainText("92233720368547757.97 元");
  await expect(precision.locator(".admin-settlement-columns .selected-row")).toContainText("待核对");
  await expect(precision.getByRole("button", { name: "生成批次", exact: true })).toBeDisabled();
  await precision.getByRole("button", { name: "查询原回执", exact: true }).dblclick();
  await expect(precision.getByText("原请求P0018的查询接口尚未接入，打款状态仍为待核对").first()).toBeVisible();
  expect(await precision.evaluate(() => document.documentElement.scrollWidth)).toBe(1814);
  report.checks.push("normal administrator routes aggregate payout differences and signed-64-bit ledger evidence while preserving the original unknown payout and zero available scope");

  const status = await session(devBase, false, true);
  await status.goto(devBase + "/publisher/settlements/SET018");
  await expect(status.locator(".settlement-detail-panel")).toBeVisible();
  const publisherModule = await status.evaluate(() => performance.getEntriesByType("resource")
    .find((entry) => entry.name.includes("/src/lib/publisher-finance-preview.ts"))?.name);
  assert.ok(publisherModule);
  for (const [state, label, steps] of [["UNKNOWN", "待核对", 2], ["SUCCEEDED", "已到账", 4]]) {
    await status.evaluate(async ({ moduleURL, state }) => { (await import(moduleURL)).settlementPreview.status = state; }, { moduleURL: publisherModule, state });
    await navigate(status, "/publisher/earnings");
    await expect(status.locator(".earnings-ledger")).toBeVisible();
    await status.getByRole("button", { name: "查看结算详情", exact: true }).click();
    await expect(status.locator(".settlement-fact-cards article").nth(1)).toContainText(label);
    await expect(status.locator(".settlement-steps .ant-steps-item-finish")).toHaveCount(steps);
  }
  await status.evaluate(async (moduleURL) => { (await import(moduleURL)).settlementPreview.amountMinor = "20001"; }, publisherModule);
  await navigate(status, "/publisher/earnings");
  await expect(status.locator(".earnings-ledger")).toBeVisible();
  await status.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await expect(status.getByText("批次净额与原打款金额待核对。")).toBeVisible();
  report.checks.push("publisher payout status and confirmation steps read the same stored status for unknown and confirmed receipts");

  const mobile = await session();
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const [, route, selector] of routes) {
    await mobile.goto(base + route);
    await expect(mobile.locator(selector)).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  report.checks.push("all three financial routes fit 390px with internally scrollable ledgers and stacked policy controls");
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("financial previews issue no business mutations and finish without browser exceptions");
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
