import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { formatMinorUnits } from "../apps/web/src/lib/money.ts";

const output = path.resolve("output/verification/consumer-finance-pages");
await mkdir(output, { recursive: true });
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
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const contexts = [];
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
  final_visual_acceptance: "pending",
};
let page;
async function session(live = false) {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  contexts.push(context);
  expect(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "consumer@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
  ).toBe(200);
  if (live)
    await context.route("**/api/v1/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.data_mode = "live";
      await route.fulfill({ response, json: body });
    });
  const current = await context.newPage();
  current.on("pageerror", (error) =>
    report.errors.push(error.stack || error.message),
  );
  return current;
}
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toHaveText(title);
}
async function capture(id, route, title, selector, count) {
  await page.goto(base + route);
  await expect(page.locator(".page-heading h1")).toHaveText(title);
  await expect(page.locator(selector)).toHaveCount(count);
  await page.mouse.move(1813, 867);
  await page.screenshot({
    path: path.join(output, id + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(id);
  const layout = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
          }
        : null;
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      main: bounds(
        ".bill-list,.refunds-list,.refund-progress-panel,.bookings-list",
      ),
      detail: bounds(
        ".bill-detail,.refund-application,.refund-progress-panel,.bookings-list",
      ),
      editor: bounds(".refund-application textarea"),
      help: bounds(".sidebar .nav-group:last-child .nav-item"),
    };
  });
  report.layouts[id] = layout;
  assert.equal(layout.width, 1814);
  assert.equal(layout.height, 868);
  assert.ok(layout.help.bottom <= 868);
  assert.ok(layout.detail.bottom <= 868);
  if (id === "USER-C19") assert.ok(layout.editor.height >= 114);
}
async function choose(label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: option })
    .click();
}
function row(text) {
  return page.locator(".ant-table-row").filter({ hasText: text });
}
try {
  assert.equal(formatMinorUnits("9223372036854775807"), "92233720368547758.07");
  assert.equal(
    formatMinorUnits(-9223372036854775807n),
    "-92233720368547758.07",
  );
  assert.equal(formatMinorUnits("1"), "0.01");
  assert.equal(formatMinorUnits("0"), "0.00");
  report.checks.push(
    "minor-unit formatting preserves BIGINT boundaries and cent precision",
  );
  page = await session();
  const mutations = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/") &&
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())
    )
      mutations.push(request.url());
  });
  for (const args of [
    ["USER-C18", "/me/bills", "支付与账单", ".bill-list .ant-table-row", 3],
    [
      "USER-C19",
      "/me/refunds",
      "退款与售后",
      ".refunds-list .ant-table-row",
      2,
    ],
    ["USER-C20", "/me/refunds/REF018", "退款详情", ".refund-facts", 2],
    [
      "USER-C22",
      "/me/bookings",
      "预约凭证与票款",
      ".bookings-list .ant-table-row",
      2,
    ],
  ])
    await capture(...args);
  report.checks.push(
    "four finance and booking routes fit the reference viewport with visible help navigation",
  );

  await menu("支付与账单");
  await expect(page.locator(".bill-summary strong")).toHaveText([
    "17.00",
    "3.00",
    "8.00",
  ]);
  await expect(row("景点预约")).toContainText("退款处理中");
  await expect(row("文件处理")).toContainText("已退款");
  await expect(page.locator(".bill-fees")).toContainText(/退服务费\s*0\.00 元/);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本人账单", exact: true }).click();
  const download = await downloadEvent;
  const csv = await readFile(await download.path(), "utf8");
  assert.ok(csv.includes("8.00,示例渠道A,WX****3921,已支付,退款处理中"));
  assert.ok(csv.includes("3.00,示例渠道B,WX****6607,已支付,已退款"));
  report.checks.push(
    "billing summaries, masked CSV and settled refunds share decimal-string monetary values and refund state",
  );

  await row("表格清洗")
    .getByRole("button", { name: "详情", exact: true })
    .click();
  await expect(page).toHaveURL(/order_id=TT202611130018/);
  await page.reload();
  await expect(page.locator(".bill-detail")).toContainText("TT202611130018");
  await choose("账单时间筛选", "2026-11-12");
  await expect(page.locator(".bill-summary strong")).toHaveText([
    "3.00",
    "3.00",
    "0.00",
  ]);
  await expect(page.locator(".bill-detail")).toContainText("TT202611130025");
  await page.goto(base + "/me/bills?order_id=missing");
  await expect(page.locator(".bill-detail")).toContainText(
    "该订单的账单尚未载入或不在所选日期范围内",
  );
  await expect(page.locator(".bill-detail")).not.toContainText(
    "TT202611130027",
  );
  report.checks.push(
    "bill selection survives reload, date filters reconcile totals and unknown order IDs keep an unavailable detail",
  );

  await menu("退款与售后");
  await row("TT202611130027")
    .getByRole("link", { name: "查看详情 ›", exact: true })
    .click();
  await page
    .getByRole("link", { name: "TT202611130027 景点预约", exact: true })
    .click();
  await expect(page.locator(".bill-detail")).toContainText("TT202611130027");
  await page
    .locator(".bill-detail")
    .getByRole("link", { name: /查看退款/ })
    .click();
  await expect(page).toHaveURL(/\/me\/refunds\/REF018$/);
  await expect(page.locator(".refund-step-marker.is-finished")).toHaveCount(3);
  await expect(page.locator(".refund-step-marker.is-current")).toHaveCount(1);
  await page.getByRole("button", { name: "查询进度", exact: true }).click();
  await expect(
    page.getByText("退款渠道尚未接通，当前进度保持不变", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".refund-step-marker.is-finished")).toHaveCount(3);
  await menu("退款与售后");
  await row("TT202611130025")
    .getByRole("link", { name: "查看详情 ›", exact: true })
    .click();
  await expect(page.locator(".refund-facts").first()).toContainText(
    "未使用服务费全退",
  );
  await expect(page.locator(".refund-facts").first()).toContainText(
    "服务未使用",
  );
  report.checks.push(
    "refund detail links to its matching bill, keeps channel progress and reads the stored rule and execution snapshot",
  );

  await menu("退款与售后");
  await choose("退款原因", "其他");
  await page
    .getByLabel("补充说明（可选）", { exact: true })
    .fill("  需要核对退款说明\n<script>example</script>  ");
  await page.getByRole("button", { name: "提交退款", exact: true }).click();
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(page.locator(".refunds-list .ant-table-row")).toHaveCount(2);
  await page.getByRole("button", { name: "提交退款", exact: true }).click();
  await page.getByRole("button", { name: "记录申请", exact: true }).click();
  await expect(
    page.getByText("申请已记录（预览）", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".refund-description p")).toHaveText(
    "需要核对退款说明\n<script>example</script>",
  );
  await expect(page.locator(".refund-description script")).toHaveCount(0);
  await expect(page.locator(".refund-facts").first()).toContainText(
    "执行已结束 / 目标未达成",
  );
  const requestedPath = new URL(page.url()).pathname;
  await expect(page.locator(".refund-step-marker.is-finished")).toHaveCount(0);
  await menu("退款与售后");
  await expect(page.locator(".refunds-list .ant-table-row")).toHaveCount(3);
  await page.getByRole("button", { name: "提交退款", exact: true }).click();
  await page.getByRole("button", { name: "记录申请", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe(requestedPath);
  await expect(page.locator(".refund-description p")).toContainText(
    "需要核对退款说明",
  );
  report.checks.push(
    "refund confirmation preserves escaped supplementary text and the original outcome and deduplicates repeated applications",
  );

  await menu("预约凭证与票款");
  const pending = row("博物馆");
  await expect(
    pending.getByRole("button", { name: "查看凭证", exact: true }),
  ).toBeDisabled();
  await pending
    .getByRole("button", { name: "核验原预约", exact: true })
    .click();
  await expect(pending).toContainText("结果待核验");
  await row("城市展览馆")
    .getByRole("button", { name: "查看凭证", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("BK•••582");
  await expect(page.getByRole("dialog")).toContainText(
    "TT202611130081 · 已支付¥8",
  );
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  report.checks.push(
    "pending booking retains its verification state and the verified voucher includes the correct masked code and service order",
  );

  const live = await session(true);
  await live.goto(base + "/me/bills");
  await expect(live.locator(".bill-summary strong")).toHaveText([
    "—",
    "—",
    "—",
  ]);
  await expect(
    live.getByRole("button", { name: "导出本人账单", exact: true }),
  ).toBeDisabled();
  await live.goto(base + "/me/refunds");
  await expect(
    live.getByRole("button", { name: "提交退款", exact: true }),
  ).toBeDisabled();
  await expect(live.locator(".refund-application")).not.toContainText("8.00");
  await expect(live.locator(".refund-application")).not.toContainText(
    "目标未达成全退服务费",
  );
  await live.goto(base + "/me/bookings");
  await expect(live.locator(".bookings-page")).toContainText(
    "官方票款、预约状态和凭证暂不可用",
  );
  await expect(live.locator(".bookings-list")).not.toContainText("无需支付");
  report.checks.push(
    "live mode shows unavailable finance totals, disables local actions and keeps ticket amounts and refund rules unknown",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/me/bills",
    "/me/refunds",
    "/me/refunds/REF018",
    "/me/bookings",
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert.equal(width, 390, `${route} overflows the narrow viewport`);
  }
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push(
    "all four routes keep tables internally scrollable at 390px and preview actions issue no business mutations",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  await server.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
