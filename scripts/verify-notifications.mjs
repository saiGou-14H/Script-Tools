import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = path.resolve("output/verification/notification-pages");
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
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "consumer@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
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
async function capture(id) {
  await page.screenshot({
    path: path.join(output, id + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(id);
  const metrics = await page.evaluate(() => {
    function bounds(selector) {
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
    }
    const save = document.querySelector(
      ".notification-save-bar > .ant-btn > span",
    );
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      hero: bounds(".notification-hero"),
      list: bounds(".notification-list"),
      webhook: bounds(".webhook-setting"),
      footer: bounds(".notification-save-bar"),
      help: bounds(".sidebar .nav-group:last-child .nav-item"),
      save_color: save ? getComputedStyle(save).color : null,
    };
  });
  report.layouts[id] = metrics;
  assert.equal(metrics.width, 1814);
  assert.equal(metrics.height, 868);
  assert.ok(metrics.help.bottom <= 868);
  if (id === "USER-C17") {
    assert.ok(
      metrics.webhook.bottom <= metrics.footer.y,
      "The fixed footer must leave the Webhook description visible",
    );
    assert.equal(metrics.save_color, "rgb(255, 255, 255)");
  }
}
async function messages(query = "") {
  if (!page.url().startsWith(base) || query) {
    await page.goto(base + "/me/notifications" + query);
  } else {
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "消息中心", exact: true })
      .click();
  }
  await expect(page.locator(".notification-hero strong")).toBeVisible();
}
async function settings() {
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "通知设置", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "保存设置", exact: true }),
  ).toBeVisible();
}
try {
  page = await session();
  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  await messages();
  await expect(page.locator(".notification-list article")).toHaveCount(4);
  await expect(page.locator(".notification-hero strong")).toHaveText("3");
  await capture("USER-C16");
  await settings();
  await capture("USER-C17");
  const menu = await page.locator(".sidebar .nav-item").allTextContents();
  assert.ok(menu.indexOf("我的订单") < menu.indexOf("脚本市场"));
  await expect(page.locator(".breadcrumb")).toContainText("我的首页");
  report.checks.push(
    "the production-built message and notification-setting pages restore their reference regions inside 1814 by 868, retain sidebar access and keep the Webhook card above the fixed footer with legible save-button text",
  );

  await messages();
  await page.getByRole("button", { name: "交易", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("category"), "交易");
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "交易", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.getByRole("checkbox", { name: "仅看未读", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "仅看未读", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".notification-list article")).toHaveCount(3);
  assert.equal(new URL(page.url()).searchParams.get("read"), "unread");
  await page.getByRole("button", { name: "系统", exact: true }).click();
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await page.getByRole("button", { name: "查看结果", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "待核验（1）", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".pending-action-card")).toHaveCount(1);
  assert.equal(new URL(page.url()).searchParams.get("category"), "待核验");
  await page.reload();
  await expect(page.locator(".pending-action-card")).toHaveCount(1);
  report.checks.push(
    "message category and unread filters survive reload in the URL, and the booking notification opens the original pending-verification category through its normal route",
  );

  await messages("?category=系统&read=unread");
  await page.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.getByText("暂无未读消息", { exact: true })).toBeVisible();
  await expect(page.locator(".notification-hero strong")).toHaveText("2");
  await page.getByRole("button", { name: "全部", exact: true }).click();
  for (let index = 0; index < 2; index++)
    await page
      .getByRole("button", { name: "标为已读", exact: true })
      .first()
      .click();
  await expect(page.locator(".notification-hero strong")).toHaveText("0");
  await expect(
    page.locator(".notification-header-badge .ant-badge-dot"),
  ).toHaveCount(0);
  await settings();
  await messages();
  await expect(page.locator(".notification-hero strong")).toHaveText("0");
  await expect(
    page.getByRole("button", { name: "已读", exact: true }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "已读", exact: true }).first(),
  ).toBeDisabled();
  report.checks.push(
    "marking preview messages read updates the list, global unread count and header badge together, removes rows from unread views and persists across route navigation",
  );

  const resultRow = page
    .locator(".notification-list article")
    .filter({ hasText: "表格清洗结果已可领取" });
  await resultRow
    .getByRole("button", { name: "查看结果", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.get("output"), "csv");
  await expect(
    page.locator('.outputs-panel tr[aria-selected="true"]'),
  ).toContainText("cleaned.csv");
  await messages();
  const paymentRow = page
    .locator(".notification-list article")
    .filter({ hasText: "订单付款已确认" });
  await paymentRow
    .getByRole("button", { name: "查看订单", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "订单详情", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".main-content")).toContainText("OD202611130001");
  await messages();
  const refundRow = page
    .locator(".notification-list article")
    .filter({ hasText: "退款¥8.00渠道处理中" });
  await refundRow
    .getByRole("button", { name: "查看退款", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "退款详情", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".main-content")).toContainText("REF018");
  await expect(page.locator(".main-content")).toContainText("渠道退款处理中");
  report.checks.push(
    "result, payment and refund notification actions select their existing output, order and refund records while reading preserves the original pending refund facts",
  );

  await settings();
  await page.getByRole("switch", { name: "支付确认", exact: true }).click();
  await page.getByRole("switch", { name: "待补充", exact: true }).click();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await messages();
  await settings();
  await expect(
    page.getByRole("switch", { name: "支付确认", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "待补充", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("switch", { name: "运行完成", exact: true }).click();
  await messages();
  await settings();
  await expect(
    page.getByRole("switch", { name: "运行完成", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "修改邮箱", exact: true }).click();
  await page.getByRole("button", { name: "保存邮箱", exact: true }).click();
  await expect(page.getByText("请输入邮箱", { exact: true })).toBeVisible();
  await page.getByLabel("通知邮箱", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "保存邮箱", exact: true }).click();
  await expect(
    page.getByText("请输入有效的邮箱地址", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "修改邮箱", exact: true }).click();
  await expect(page.getByLabel("通知邮箱", { exact: true })).toHaveValue("");
  await page
    .getByLabel("通知邮箱", { exact: true })
    .fill("notify-preview@example.invalid");
  await page.getByRole("button", { name: "保存邮箱", exact: true }).click();
  await expect(
    page.getByText("n***@example.invalid", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发送测试", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".notification-save-bar")).not.toContainText(
    "投递成功",
  );
  await expect(
    page.getByText("notify-preview@example.invalid", { exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(mutations, []);
  report.checks.push(
    "preview event settings require an explicit save, cancelled email edits clear their input, new addresses remain masked and unverified, and the preview workflow keeps external mutations separate",
  );

  const live = await session(true);
  await live.goto(base + "/me/notifications");
  await expect(
    live.getByText("站内消息接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(live.locator(".notification-list article")).toHaveCount(0);
  await expect(live.locator(".notification-hero strong")).toHaveText("—");
  await expect(
    live.locator(".notification-header-badge .ant-badge-dot"),
  ).toHaveCount(0);
  await live.goto(base + "/me/settings/notifications");
  await expect(
    live.getByRole("button", { name: "保存设置", exact: true }),
  ).toBeDisabled();
  for (const title of ["支付确认", "运行完成", "待补充", "退款到账"])
    await expect(
      live.getByRole("switch", { name: title, exact: true }),
    ).toBeDisabled();
  await expect(
    live.getByRole("button", { name: "发送测试", exact: true }),
  ).toBeDisabled();
  await live.getByRole("button", { name: "绑定邮箱", exact: true }).click();
  await expect(
    live.getByText("邮箱绑定与收件地址验证接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(live.getByRole("dialog")).toHaveCount(0);
  await expect(live.locator(".notification-settings-page")).not.toContainText(
    "m***@example.com",
  );
  await expect(live.locator(".notification-save-bar")).not.toContainText(
    "投递成功",
  );
  await expect(live.getByText("未绑定", { exact: true })).toBeVisible();
  report.checks.push(
    "live-mode notification views expose pending integration and unknown unread state, keep preview records and success examples isolated, and disable local-only preference saves and unverified test delivery",
  );

  const narrow = await session();
  await narrow.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/me/notifications", "/me/settings/notifications"]) {
    await narrow.goto(base + route);
    await expect(narrow.locator(".page-heading h1")).toBeVisible();
    const width = await narrow.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert.equal(
      width,
      390,
      `${route} must fit the existing narrow-screen layout`,
    );
  }
  report.checks.push(
    "message filtering and notification settings retain usable narrow-screen layouts without horizontal document overflow",
  );
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  for (const context of contexts)
    await context.unrouteAll({ behavior: "wait" });
  await browser.close();
  await server.close();
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
