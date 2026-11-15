import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = path.resolve("output/verification/consumer-purchase-pages");
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
async function session({ live = false, transform } = {}) {
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
  if (transform)
    await context.route("**/api/v1/services", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = body.data.map((service) => transform(service));
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
async function selectIn(current, label, value) {
  await current.getByLabel(label, { exact: true }).click();
  await current
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: value })
    .click();
}
async function validInput(current) {
  await current.locator('input[type="file"]').setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(125 * 1024, "a"),
  });
  await expect(
    current.locator(".upload-widget .ant-upload-list"),
  ).toContainText("sample.csv");
  await selectIn(current, "去重字段", "邮箱");
  await selectIn(current, "输出格式", "CSV");
}
async function capture(id, route, title, ready) {
  await page.goto(base + route);
  await expect(page.locator(".page-heading h1")).toHaveText(title);
  await expect(page.locator(ready).first()).toBeVisible();
  if (id === "USER-C07") await validInput(page);
  await page.locator(".page-heading h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
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
        ".orders-list,.order-related-grid,.purchased-grid,.configure-columns",
      ),
      help: bounds(".sidebar .nav-group:last-child .nav-item"),
    };
  });
  report.layouts[id] = layout;
  assert.equal(layout.width, 1814);
  assert.equal(layout.height, 868);
  assert.ok(layout.main.bottom <= 868);
  assert.ok(layout.help.bottom <= 868);
}
try {
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
    ["USER-C04", "/me/orders", "我的订单", ".orders-list .ant-table-row"],
    [
      "USER-C05",
      "/me/orders/OD202611130001",
      "订单详情",
      ".order-detail-banner",
    ],
    ["USER-C06", "/me/services", "已购服务", ".purchase-clean"],
    [
      "USER-C07",
      "/me/services/clean/use",
      "配置与使用服务",
      ".service-summary",
    ],
  ])
    await capture(...args);
  report.checks.push(
    "four order and entitlement routes restore their reference regions and keep sidebar help inside 1814 by 868",
  );

  await menu("我的订单");
  await page
    .locator(".pill-tabs")
    .getByRole("button", { name: "待支付", exact: true })
    .click();
  await expect(page).toHaveURL(/status=unpaid/);
  await page.reload();
  await expect(page.locator(".orders-list .ant-table-row")).toHaveCount(1);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "保留订单", exact: true }).click();
  await expect(page.locator(".orders-list")).toContainText("OD202611130003");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(page.locator(".orders-list .ant-table-row")).toHaveCount(0);
  await page
    .locator(".pill-tabs")
    .getByRole("button", { name: "已关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await expect(page.locator(".order-detail-banner")).toContainText(
    "OD202611130003",
  );
  await expect(
    page.getByRole("button", { name: "去支付", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".order-status-grid")).toContainText("权益已关闭");
  report.checks.push(
    "order filters persist in the URL and cancellation preserves the selected order across confirmation and closed detail",
  );

  await menu("已购服务");
  await page
    .getByRole("button", { name: "免费景点预约更多操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "查看订单", exact: true }).click();
  await expect(page).toHaveURL(/\/me\/orders\/OD202611130002$/);
  await expect(page.locator(".order-detail-banner")).toContainText(
    "景点预约与时段锁定",
  );
  await expect(page.locator(".order-status-grid")).toContainText("权益已占用");
  await expect(page.locator(".order-status-grid")).toContainText("执行中");
  await expect(
    page.getByRole("button", { name: "配置使用", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".order-action-stack")
    .getByRole("button", { name: "查看任务", exact: true })
    .click();
  await expect(page).toHaveURL(/\/me\/tasks\/booking$/);
  await expect(
    page.getByRole("link", { name: "OD202611130002", exact: true }),
  ).toHaveAttribute("href", "/me/orders/OD202611130002");
  await menu("已购服务");
  await page
    .getByRole("button", { name: "表格清洗更多操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "查看订单", exact: true }).click();
  await expect(page).toHaveURL(/\/me\/orders\/OD202611130001$/);
  await expect(page.locator(".order-related-grid").first()).not.toContainText(
    "TASK202611130001",
  );
  await page.getByRole("button", { name: "配置使用", exact: true }).click();
  await expect(page).toHaveURL(/\/me\/services\/clean\/use$/);
  report.checks.push(
    "purchased services open their own order, reserved booking opens its task and available entitlement opens its own configuration",
  );

  await page.keyboard.press("Control+k");
  await menu("已购服务");
  await page.keyboard.press("Control+k");
  await expect(page.locator(".global-search input")).toBeFocused();
  await page
    .getByRole("button", { name: "文件处理更多操作", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "订单资料待载入", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "再次购买", exact: true }).click();
  await expect(page.locator(".checkout-service h2")).toContainText(
    "文件批量处理",
  );
  await page.goto(base + "/me/runs/booking");
  await page
    .locator(".run-order-snapshot")
    .getByRole("link", { name: "OD202611130002", exact: true })
    .click();
  await expect(page).toHaveURL(/\/me\/orders\/OD202611130002$/);
  await page.goto(base + "/me/runs/demo");
  await page
    .locator(".run-order-snapshot")
    .getByRole("link", { name: "TT202611130018", exact: true })
    .click();
  await expect(page.locator(".bill-detail")).toContainText("TT202611130018");
  report.checks.push(
    "purchased-page keyboard search works and missing historical order data stays unavailable while repurchase selects the file service",
  );

  await menu("我的订单");
  await page
    .locator(".orders-list .ant-table-row")
    .filter({ hasText: "OD202611130001" })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  await page.getByRole("button", { name: "取消并退款", exact: true }).click();
  await expect(page).toHaveURL(/order_id=OD202611130001/);
  await expect(page.locator(".refund-application")).toContainText(
    "OD202611130001 · 可退金额待核对",
  );
  await expect(
    page.getByRole("button", { name: "提交退款", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".refund-application")).not.toContainText("8.00");
  report.checks.push(
    "refund entry retains the original order and waits for its amount and policy",
  );

  await menu("已购服务");
  await page.getByRole("button", { name: "配置使用", exact: true }).click();
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(
    page.locator(".ant-form-item-explain-error").first(),
  ).toBeVisible();
  await validInput(page);
  await page.getByRole("radio", { name: "指定时间", exact: true }).check();
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "请选择执行时间" }),
  ).toBeVisible();
  for (const [value, error] of [
    ["2026-11-12 10:00:00", "执行时间须晚于当前时间"],
    ["2026-11-21 10:00:00", "执行时间须在本单可启动期限内"],
  ]) {
    await page.getByLabel("执行时间", { exact: true }).fill(value);
    await page.getByLabel("执行时间", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "预览配置", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: error }),
    ).toBeVisible();
  }
  const future =
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
      new Date(Date.now() + 86400000),
    ) + " 10:00:00";
  await page.getByLabel("执行时间", { exact: true }).fill(future);
  await page.getByLabel("执行时间", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(future);
  await expect(page.getByRole("dialog")).toContainText(
    "clean · OD202611130001",
  );
  await expect(page.getByRole("dialog")).toContainText("sample.csv");
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  await page.getByRole("radio", { name: "立即执行", exact: true }).check();
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(future);
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  await page.getByRole("button", { name: "开始使用", exact: true }).click();
  await expect(
    page.getByText("执行模块正在接入，配置已通过前端校验", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "configuration requires publisher fields, validates the scheduled time and previews its selected time, original order and input",
  );

  const changed = await session({
    transform: (service) =>
      service.input_schema_digest === "schema-table"
        ? { ...service, script_version: "9.0" }
        : service,
  });
  await changed.goto(base + "/me/services/clean/use");
  await expect(
    changed.getByText("已购服务版本暂未载入", { exact: true }),
  ).toBeVisible();
  const custom = await session({
    transform: (service) =>
      service.input_schema_digest === "schema-table"
        ? {
            ...service,
            input_schema: {
              type: "object",
              properties: {
                custom_value: { type: "string", title: "发布者自定义必填项" },
              },
              required: ["custom_value"],
              additionalProperties: false,
            },
            input_ui_schema: {},
          }
        : service,
  });
  await custom.goto(base + "/me/services/clean/use");
  await custom.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(custom.locator(".ant-form-item-explain-error")).toBeVisible();
  await custom
    .getByLabel("发布者自定义必填项", { exact: true })
    .fill("自定义输入");
  await custom.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(custom.getByRole("dialog")).toContainText(
    '"custom_value": "自定义输入"',
  );
  await expect(custom.getByRole("dialog")).not.toContainText("source_file");
  report.checks.push(
    "configuration requires the purchased version and follows publisher-required fields from JSON Schema",
  );

  let catalogChanged = false;
  const frozen = await session({
    transform: (service) =>
      service.input_schema_digest === "schema-table"
        ? {
            ...service,
            amount_minor: catalogChanged ? "1" : "9223372036854775807",
            max_service_seconds: "864000",
            refund_policy: {
              summary: catalogChanged ? "新发布规则" : "成交快照退款规则",
            },
          }
        : service,
  });
  await frozen.goto(base + "/checkout");
  await frozen.getByRole("button", { name: "提交订单", exact: true }).click();
  await expect(frozen.locator(".page-heading h1")).toHaveText("收银台");
  const orderId = new URL(frozen.url()).pathname.split("/")[2];
  await expect(frozen.locator(".refund-rule-highlight")).toHaveText(
    "成交快照退款规则",
  );
  await expect(frozen.locator(".cashier-order-strip")).toContainText(
    "92233720368547758.07",
  );
  catalogChanged = true;
  await frozen
    .locator(".sidebar")
    .getByRole("link", { name: "脚本市场", exact: true })
    .click();
  await expect(frozen.locator(".consumer-market-card").first()).toBeVisible();
  await expect(
    frozen.locator(".consumer-market-card").filter({ hasText: "表格清洗" }),
  ).toContainText("0.01");
  await frozen
    .locator(".sidebar")
    .getByRole("link", { name: "我的订单", exact: true })
    .click();
  await frozen.getByRole("link", { name: orderId, exact: true }).click();
  await expect(frozen.locator(".order-detail-banner")).toContainText(
    "92233720368547758.07",
  );
  await expect(frozen.locator(".contract-definition")).toContainText(
    "成交快照退款规则",
  );
  await expect(frozen.locator(".contract-definition")).toContainText("10天");
  await frozen.getByRole("button", { name: "去支付", exact: true }).click();
  await expect(frozen.locator(".refund-rule-highlight")).toHaveText(
    "成交快照退款规则",
  );
  await expect(frozen.locator(".cashier-order-strip")).toContainText(
    "92233720368547758.07",
  );
  report.checks.push(
    "new preview orders preserve their purchased service contract and BIGINT amount across later catalog changes",
  );

  for (const route of [
    "/me/services/booking/use",
    "/me/services/files/use",
    "/me/services/missing/use",
  ]) {
    await page.goto(base + route);
    await expect(
      page.getByRole("button", { name: "开始使用", exact: true }),
    ).toHaveCount(0);
  }
  const live = await session({ live: true });
  for (const route of [
    "/me/orders",
    "/me/services",
    "/me/services/clean/use",
  ]) {
    await live.goto(base + route);
    await expect(
      live.getByText(/服务待接入/, { exact: false }).first(),
    ).toBeVisible();
    await expect(
      live.locator(
        ".orders-list .ant-table-row,.purchased-card,.selected-service",
      ),
    ).toHaveCount(0);
  }
  report.checks.push(
    "reserved, used and unknown entitlements cannot configure and live mode keeps business records and ownership claims unavailable",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/me/orders",
    "/me/orders/OD202611130001",
    "/me/services",
    "/me/services/clean/use",
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
      route,
    );
  }
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push(
    "all four routes fit a 390px viewport with internally scrollable tables and preview actions issue no business mutations",
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
