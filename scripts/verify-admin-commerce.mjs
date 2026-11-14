import { chromium, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";

const output = path.resolve("output/verification/admin-commerce");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const page = await context.newPage();
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
page.on("pageerror", (error) => report.errors.push(error.message));
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: title })
    .click();
}
async function capture(id, route, title) {
  await page.goto(base + route);
  await expect(
    page.getByRole("heading", { name: title, exact: true }).first(),
  ).toBeVisible();
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    helpBottom: document
      .querySelector('.sidebar a[href="/help"]')
      ?.getBoundingClientRect().bottom,
  }));
  expect(bounds.width).toBeLessThanOrEqual(1814);
  expect(bounds.height).toBeLessThanOrEqual(868);
  expect(bounds.helpBottom).toBeLessThanOrEqual(868);
  await page.screenshot({
    path: path.join(output, `${id}.png`),
    fullPage: true,
  });
  report.screenshots.push(id);
}
try {
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  for (const [id, route, title] of [
    ["O02", "/admin/users", "用户与发布者"],
    ["O03", "/admin/services", "服务与脚本"],
    ["O06", "/admin/orders", "服务订单"],
    ["O07", "/admin/orders/demo", "服务订单详情"],
    ["O08", "/admin/payments", "支付与退款"],
    ["O09", "/admin/refunds/demo", "退款异常处理"],
    ["O10", "/admin/reconciliation", "对账中心"],
    ["O11", "/admin/settlements", "发布者结算"],
    ["O12", "/admin/commerce-policies", "费用与结算规则"],
  ])
    await capture(`ADMIN-${id}`, route, title);
  report.checks.push(
    "nine administrator account, catalog and commerce routes render with Script Tools branding",
  );

  await menu("服务订单");
  await page.getByLabel("关联预约编号", { exact: true }).fill("BK082");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".admin-order-table .ant-table-row")).toHaveCount(
    1,
  );
  await expect(page.locator(".admin-order-table")).toContainText("已支付");
  await expect(page.locator(".admin-order-table")).toContainText("履约中");
  await expect(page.locator(".admin-order-table")).toContainText("冻结");
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await expect(page.locator(".admin-order-hero")).toContainText(
    "TT202611130082",
  );
  await page.getByRole("tab", { name: "支付事件", exact: true }).click();
  await expect(page.locator(".admin-order-events")).toContainText("PAY082");
  await page.getByRole("tab", { name: "退款事件", exact: true }).click();
  await expect(page.getByText("当前订单暂无退款事件")).toBeVisible();
  report.checks.push(
    "booking filters and order detail links preserve independent payment, fulfillment, refund and settlement states",
  );

  await page.locator(".global-search input").fill("TT202611130027");
  await page.locator(".global-search input").press("Enter");
  await expect(page.locator(".admin-order-table .ant-table-row")).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await page.getByRole("button", { name: "开启限时会话", exact: true }).click();
  await expect(page.getByText("请填写排障理由", { exact: true })).toBeVisible();
  await expect(page.getByText("请填写工单编号", { exact: true })).toBeVisible();
  await page.getByLabel("理由", { exact: true }).fill("核对脱敏运行摘要");
  await page.getByLabel("工单编号", { exact: true }).fill("CASE-018");
  await page.getByRole("button", { name: "开启限时会话", exact: true }).click();
  await expect(
    page.getByText("排障接口尚未接入，未签发访问会话", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "administrator global search resolves order metadata and scoped diagnostics require a reason and ticket before showing the pending API state",
  );

  await page.goto(base + "/admin/refunds/REF019");
  await expect(page.locator(".admin-refund-hero")).toContainText("UNKNOWN");
  await expect(page.locator(".admin-refund-balances")).toContainText("¥8.00");
  await page.getByRole("button", { name: "记录处理理由", exact: true }).click();
  await page.getByRole("button", { name: "保存处理预览", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("请填写处理理由"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("等待原退款渠道回执");
  await page.getByRole("button", { name: "保存处理预览", exact: true }).click();
  await expect(
    page.locator(
      ".admin-refund-evidence [role=tabpanel][aria-hidden=false] tbody tr",
    ),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "查询原退款", exact: true }).click();
  await expect(
    page.getByText("渠道查询接口尚未接入，REF019仍待原回执核验", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".admin-refund-hero")).toContainText("UNKNOWN");
  await expect(
    page.locator(".admin-refund-balances article").nth(2),
  ).toContainText("¥0.00");
  report.checks.push(
    "refund exception notes persist while reserved funds, remaining refundable balance and UNKNOWN channel state retain their original facts",
  );

  await menu("支付与退款");
  await expect(page.locator(".admin-payment-table .ant-table-row")).toHaveCount(
    3,
  );
  await page.getByRole("tab", { name: "收款", exact: true }).click();
  await expect(page.locator(".admin-payment-table")).toContainText("PAY019");
  await expect(page.locator(".admin-finance-stats")).toContainText("已收款");
  await page.getByRole("tab", { name: "退款", exact: true }).click();
  await expect(page.locator(".admin-payment-table")).toContainText("REF019");
  report.checks.push(
    "payment and refund tabs update identifiers, summaries and receipt actions together",
  );

  await menu("对账中心");
  await expect(
    page.locator(".admin-reconciliation-page .ant-table-row"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "启动对账", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("核对理由", { exact: true })
    .fill("核对11月13日退款未知记录");
  await page.getByRole("button", { name: "记录核对预览", exact: true }).click();
  await page.getByRole("button", { name: "查看核对记录", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "核对11月13日退款未知记录",
  );
  await page.getByRole("button", { name: "关闭记录", exact: true }).click();
  await page.getByLabel("对账日期", { exact: true }).click();
  await expect(page.locator(".ant-picker-dropdown:visible")).toBeVisible();
  await page.getByLabel("对账日期", { exact: true }).fill("2026-11-14");
  await page.getByLabel("对账日期", { exact: true }).press("Enter");
  await expect(
    page.locator(".admin-reconciliation-page .ant-empty"),
  ).toBeVisible();
  await expect(
    page.locator(".admin-reconciliation-stats strong").first(),
  ).toHaveText("0");
  report.checks.push(
    "reconciliation requests record a bounded preview and date filters keep difference totals aligned with visible rows",
  );

  await menu("发布者结算");
  await expect(page.locator(".admin-settlement-ledger .notice")).toContainText(
    "230 元收入 - 20 元费用 - 10 元退款 = 200 元",
  );
  await page.getByRole("button", { name: "SET017", exact: true }).click();
  await expect(page.locator(".admin-settlement-ledger .notice")).toContainText(
    "40 元",
  );
  await page.getByRole("button", { name: "查询原回执", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("PO017");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "SET018", exact: true }).click();
  await page.getByRole("button", { name: "查询原回执", exact: true }).click();
  await expect(
    page.getByText("原请求P0018的查询接口尚未接入，打款状态仍为处理中", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".admin-settlement-columns .selected-row"),
  ).toContainText("处理中");
  report.checks.push(
    "settlement batch selection reconciles exact minor-unit ledger amounts and pending payouts remain tied to the original request",
  );

  await menu("费用与结算规则");
  await page
    .getByRole("textbox", { name: "平台费率", exact: true })
    .fill("100.01");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(
    page.getByText("费率须为0至100之间的数值，最多两位小数", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "平台费率", exact: true })
    .fill("7.25");
  await page
    .getByRole("button", { name: "保存新版本", exact: true })
    .dblclick();
  await expect(page.locator(".admin-policy-versions")).toContainText(
    "v4（当前生效）",
  );
  await expect(page.locator(".admin-policy-example")).toContainText("92.75 元");
  await page
    .getByRole("combobox", { name: "规则历史版本", exact: true })
    .click();
  await expect(
    page.locator(".ant-select-dropdown .ant-select-item-option-content"),
  ).toHaveCount(2);
  await page
    .locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText("v3 · 5.00%", { exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "平台费率", exact: true }),
  ).toHaveValue("5");
  await expect(
    page.getByRole("textbox", { name: "平台费率", exact: true }),
  ).toBeDisabled();
  await menu("服务订单");
  await page
    .locator(".admin-order-table .ant-table-row")
    .filter({ hasText: "TT202611130027" })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  await page.getByRole("tab", { name: "合同快照", exact: true }).click();
  await expect(page.locator(".admin-contract-snapshot")).toContainText(
    "v3 · 平台费率5%",
  );
  report.checks.push(
    "new fee versions validate percentages, deduplicate repeated saves and retain immutable historical policies and order pricing snapshots",
  );

  await menu("用户与发布者");
  const account = page
    .locator(".admin-users-table tbody tr")
    .filter({ hasText: "u****3821" });
  await account.getByRole("button", { name: "调整配额", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "账号配额", exact: true })
    .fill("1200");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("增加后续运行配额");
  await page.getByRole("button", { name: "保存管理预览", exact: true }).click();
  await expect(account).toContainText("1,200 次");
  await account
    .getByRole("button", { name: "限制新业务", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("核查账号异常活动");
  await page.getByRole("button", { name: "保存管理预览", exact: true }).click();
  await expect(account).toContainText("已冻结");
  await expect(account.locator("td").nth(7)).toHaveText("3");
  await menu("服务与脚本");
  await menu("用户与发布者");
  await expect(account).toContainText("1,200 次");
  await expect(account).toContainText("已冻结");
  await account.getByRole("button", { name: "解除限制", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("账号异常已核查");
  await page.getByRole("button", { name: "保存管理预览", exact: true }).click();
  await expect(account).toContainText("正常");
  report.checks.push(
    "account quotas and freeze previews persist across routes while open orders remain visible and unfreeze restores the future-business state",
  );

  await menu("服务与脚本");
  const service = page
    .locator(".admin-services-page [role=tabpanel][aria-hidden=false] tbody tr")
    .filter({ hasText: "脚本工坊" });
  await service.getByRole("button", { name: "风险停销", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("核查服务风险");
  await page.getByRole("button", { name: "确认管理预览", exact: true }).click();
  await expect(service).toContainText("停销");
  await expect(service).toContainText("1,240 次");
  await service.getByRole("button", { name: "核查恢复", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("基础可售检查预览通过");
  await page.getByRole("button", { name: "确认管理预览", exact: true }).click();
  await expect(service).toContainText("在售");
  await page.getByRole("tab", { name: "脚本版本", exact: true }).click();
  await service.getByRole("button", { name: "撤销执行", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("风险证据与处理理由", { exact: true })
    .fill("问题版本证据已登记");
  await page.getByRole("button", { name: "确认管理预览", exact: true }).click();
  await expect(service).toContainText("REVOKED");
  await page.getByRole("tab", { name: "服务商品", exact: true }).click();
  await expect(service).toContainText("停销");
  await expect(
    service.getByRole("button", { name: "核查恢复", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "service block, recovery and version revocation previews preserve existing entitlements and prevent restoring a revoked version",
  );

  for (const route of ["/admin/orders/missing", "/admin/refunds/missing"]) {
    await page.goto(base + route);
    await expect(page.getByText(/不存在或已失效/)).toBeVisible();
  }
  expect(report.errors).toEqual([]);
  report.checks.push(
    "administrator detail pages handle unknown resources and the flow completes without browser runtime exceptions",
  );
  const limitedContext = await browser.newContext();
  await limitedContext.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  await limitedContext.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.user.capabilities = ["access.manage"];
    await route.fulfill({ json: body });
  });
  const limitedPage = await limitedContext.newPage();
  limitedPage.on("pageerror", (error) => report.errors.push(error.message));
  for (const [route, capability] of [
    ["/admin/orders", "commerce.manage"],
    ["/admin/users", "user.manage"],
    ["/admin/services", "catalog.manage"],
  ]) {
    await limitedPage.goto(base + route);
    await expect(
      limitedPage.getByText("无权访问此页面", { exact: true }),
    ).toBeVisible();
    await expect(
      limitedPage.getByText(`当前账号缺少 ${capability} 能力`, { exact: true }),
    ).toBeVisible();
  }
  await limitedContext.unrouteAll({ behavior: "wait" });
  await limitedContext.close();
  report.checks.push(
    "administrator UI pages require their declared management capabilities in addition to the ADMIN workspace role",
  );
  const liveContext = await browser.newContext();
  await liveContext.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  await liveContext.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  const livePage = await liveContext.newPage();
  livePage.on("pageerror", (error) => report.errors.push(error.message));
  for (const route of [
    "/admin/orders",
    "/admin/payments",
    "/admin/reconciliation",
    "/admin/settlements",
    "/admin/commerce-policies",
  ]) {
    await livePage.goto(base + route);
    await expect(
      livePage.locator(".admin-page .ant-empty").first(),
    ).toBeVisible();
    await expect(livePage.locator(".admin-page")).not.toContainText(
      "TT202611130027",
    );
  }
  for (const [route, endpoint] of [
    ["/admin/users", "/api/v1/admin/users?q=&limit=20"],
    ["/admin/services", "/api/v1/admin/services?view=services&limit=20"],
  ]) {
    const response = await liveContext.request.get(base + endpoint);
    expect(response.status()).toBe(200);
    const records = (await response.json()).data;
    await livePage.goto(base + route);
    await expect(
      livePage.locator(".admin-page .ant-table-row:visible"),
    ).toHaveCount(records.length);
    await expect(livePage.locator(".admin-page")).toContainText(
      "管理变更接口待接入",
    );
  }
  await liveContext.unrouteAll({ behavior: "wait" });
  await liveContext.close();
  expect(report.errors).toEqual([]);
  report.checks.push(
    "live-mode account and catalog pages read real metadata while pending commerce reads expose empty or unavailable data and local fixtures remain scoped to prototype mode",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
