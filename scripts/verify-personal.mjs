import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("output/verification/personal-pages");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const base = "http://127.0.0.1:5174";
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
    page.getByRole("heading", { name: title, exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, `${id}.png`),
    fullPage: true,
  });
  report.screenshots.push(id);
}
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link", { name: title, exact: true })
    .click();
}

try {
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "consumer@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  for (const [id, route, title] of [
    ["C13", "/me/pending", "待处理事项"],
    ["C14", "/me/credentials", "凭据管理"],
    ["C15", "/me/travelers", "出行人资料"],
    ["C16", "/me/notifications", "消息中心"],
    ["C17", "/me/settings/notifications", "通知设置"],
    ["C18", "/me/bills", "支付与账单"],
    ["C19", "/me/refunds", "退款与售后"],
    ["C20", "/me/refunds/demo", "退款详情"],
    ["C21", "/me/settings/account", "账户设置"],
    ["C22", "/me/bookings", "预约凭证与票款"],
    ["P04", "/travel", "城市与景点"],
    ["P06", "/help", "使用帮助"],
  ])
    await capture(`USER-${id}`, route, title);
  report.checks.push(
    "consumer personal and public pages render at all 12 routes",
  );

  await menu("凭据管理");
  await page.getByRole("button", { name: "新增凭据", exact: true }).click();
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(page.getByText("请输入新的完整凭据")).toBeVisible();
  await page.getByLabel("名称", { exact: true }).fill("预览凭据");
  await page
    .getByLabel("凭据内容", { exact: true })
    .fill("private-preview-token-5678");
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(page.getByText("••••5678", { exact: true })).toBeVisible();
  await expect(
    page.getByText("private-preview-token-5678", { exact: true }),
  ).toHaveCount(0);
  await menu("我的首页");
  await menu("凭据管理");
  await expect(page.getByText("预览凭据", { exact: true })).toBeVisible();
  const credential = page
    .locator(".ant-table-tbody tr")
    .filter({ hasText: "预览凭据" });
  await credential.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "确认撤销", exact: true }).click();
  await expect(
    credential.getByRole("button", { name: "更新", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "credential required validation, masking, route persistence and revocation work",
  );

  await menu("出行人资料");
  await page.getByLabel("姓名", { exact: true }).fill("赵明");
  await page.getByLabel("手机号", { exact: true }).fill("13800123456");
  await page.getByLabel("证件号码", { exact: true }).fill("330100199001011234");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(page.getByText("赵*", { exact: true })).toBeVisible();
  await expect(page.getByText("138****3456", { exact: true })).toBeVisible();
  await expect(page.getByText("13800123456", { exact: true })).toHaveCount(0);
  await expect(
    page.locator(".traveler-list").getByText("默认联系人", { exact: true }),
  ).toHaveCount(1);
  await menu("我的首页");
  await menu("出行人资料");
  await expect(page.getByText("赵*", { exact: true })).toBeVisible();
  report.checks.push(
    "traveler form stores masked preview and preserves exactly one selected default",
  );

  await menu("消息中心");
  await page
    .getByRole("button", { name: "标为已读", exact: true })
    .first()
    .click();
  await expect(page.locator(".notification-hero strong")).toHaveText("2");
  await menu("通知设置");
  await menu("消息中心");
  await expect(page.locator(".notification-hero strong")).toHaveText("2");
  await menu("通知设置");
  await page.getByRole("switch", { name: "支付确认", exact: true }).click();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await menu("我的首页");
  await menu("通知设置");
  await expect(
    page.getByRole("switch", { name: "支付确认", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "修改邮箱", exact: true }).click();
  await page
    .getByLabel("通知邮箱", { exact: true })
    .fill("preview@example.invalid");
  await page.getByRole("button", { name: "保存邮箱", exact: true }).click();
  await expect(
    page.getByText("p***@example.invalid", { exact: true }),
  ).toBeVisible();
  await menu("我的首页");
  await menu("通知设置");
  await expect(
    page.getByText("p***@example.invalid", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".notification-setting-card")
      .first()
      .getByText("待验证", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "read state, saved event preferences and unverified masked email survive navigation",
  );

  await menu("支付与账单");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本人账单", exact: true }).click();
  const download = await downloadEvent;
  const contents = await readFile(await download.path(), "utf8");
  expect(contents).toContain("WX****3921");
  expect(contents).toContain("已退款");
  await page
    .locator(".ant-table-tbody tr")
    .filter({ hasText: "表格清洗" })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  await expect(page.locator(".bill-detail")).toContainText("TT202611130018");
  report.checks.push(
    "bill selection changes the transaction detail and exports masked CSV",
  );

  await menu("退款与售后");
  await page.getByRole("button", { name: "提交退款", exact: true }).click();
  await page.getByRole("button", { name: "记录申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "退款详情", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("申请已记录（预览）", { exact: true }),
  ).toBeVisible();
  const refundPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "查询进度", exact: true }).click();
  await expect(
    page.getByText("退款渠道尚未接通，当前进度保持不变"),
  ).toBeVisible();
  await menu("退款与售后");
  await expect(page.locator(".refunds-list .ant-table-tbody tr")).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "提交退款", exact: true }).click();
  await page.getByRole("button", { name: "记录申请", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe(refundPath);
  report.checks.push(
    "refund preview records one application per original order without advancing channel state",
  );

  await menu("预约凭证与票款");
  const pendingBooking = page
    .locator(".ant-table-tbody tr")
    .filter({ hasText: "博物馆" });
  await expect(
    pendingBooking.getByRole("button", { name: "查看凭证", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "查看凭证", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("BK•••582");
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  report.checks.push(
    "pending booking keeps voucher disabled and verified voucher opens masked detail",
  );

  await menu("城市与景点");
  await page.getByRole("button", { name: "北京", exact: true }).click();
  await expect(page.locator(".attraction-grid > section")).toHaveCount(1);
  await page.getByPlaceholder("搜索景点名称").fill("不存在");
  await expect(page.getByText("暂无匹配的景点")).toBeVisible();
  await menu("使用帮助");
  await page
    .getByPlaceholder("搜索帮助内容，如“退款规则”、“服务费”")
    .fill("未达成");
  await expect(page.locator(".ant-collapse-item")).toHaveCount(1);
  await expect(page.locator(".help-answer")).toContainText(
    "以购买前展示并固定的发布者规则为准。",
  );
  report.checks.push(
    "attraction city and text filters and searchable help work",
  );

  for (const route of ["/me/refunds/missing", "/me/orders/missing"]) {
    await page.goto(base + route);
    await expect(page.getByText(/不存在或已失效/)).toBeVisible();
  }
  report.checks.push("unknown order and refund IDs render unavailable state");
  expect(report.errors).toEqual([]);
  report.checks.push(
    "new personal pages complete checks without browser exceptions",
  );
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
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
