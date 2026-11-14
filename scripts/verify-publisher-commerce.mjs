import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const output = path.resolve("output/verification/publisher-commerce");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const root = path.resolve("apps/web");
const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  cacheDir: path.resolve(".local/publisher-commerce-verification-vite"),
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001" } },
  },
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address !== "object")
  throw new Error("Verification address is unavailable");
const base = `http://127.0.0.1:${address.port}`;
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
const page = await context.newPage();
// This suite exercises local commerce previews. The profile's real persistence
// and access rules are covered separately by verify-publisher-profile.mjs.
let profile = {
  id: "preview-publisher-profile",
  public_name: "林间工具",
  description: "提供实用脚本服务。",
  terms_version: "V3.0",
  enabled: true,
  revision: "1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
await context.route("**/api/v1/me/publisher-profile", async (route) => {
  if (route.request().method() === "POST") {
    const values = route.request().postDataJSON();
    profile = {
      ...profile,
      public_name: values.public_name,
      description: values.description,
      revision: String(BigInt(profile.revision) + 1n),
    };
    await route.fulfill({ json: { data: profile } });
  } else {
    await route.fulfill({
      json: {
        data: {
          profile,
          terms: { version: "V3.0", paragraphs: ["本地资料表单预览。"] },
        },
      },
    });
  }
});
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
    .getByRole("link")
    .filter({ hasText: title })
    .click();
}
async function choose(label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText(value, { exact: true })
    .click();
}
try {
  expect(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "publisher@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
  ).toBe(200);
  for (const [id, route, title] of [
    ["S07", "/publisher/services", "服务商品"],
    ["S08", "/publisher/services/demo/edit", "编辑与上架服务"],
    ["S09", "/publisher/pricing", "价格方案"],
    ["S10", "/publisher/orders", "销售订单"],
    ["S11", "/publisher/metrics", "使用统计"],
    ["S12", "/publisher/diagnostics", "故障诊断"],
    ["S13", "/publisher/earnings", "收益与结算"],
    ["S14", "/publisher/settlements/demo", "结算详情"],
    ["S15", "/publisher/settings", "发布者设置"],
    ["S16", "/publisher/imports", "来源与同步"],
  ])
    await capture(`PUBLISHER-${id}`, route, title);
  report.checks.push(
    "all ten publisher commerce, quality, finance and settings routes render",
  );

  await menu("服务商品");
  await page.getByRole("tab", { name: "草稿（1）", exact: true }).click();
  await expect(page.locator(".product-list .ant-table-row")).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "预览草稿", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("未定价");
  await page.getByRole("button", { name: "关闭预览", exact: true }).click();
  await page.getByRole("tab", { name: "在售（2）", exact: true }).click();
  await page
    .locator(".product-list .ant-table-row")
    .filter({ hasText: "表格清洗" })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel("服务名称", { exact: true }).fill("表格清洗改进版");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "服务商品", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".product-list .ant-table-tbody"),
  ).not.toContainText("表格清洗改进版");
  await page
    .locator(".product-list .ant-table-row")
    .filter({ hasText: "表格清洗" })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expect(page.getByLabel("服务名称", { exact: true })).toHaveValue(
    "表格清洗改进版",
  );
  report.checks.push(
    "product filters and draft previews work, and saving a draft preserves the current sale snapshot",
  );

  await menu("价格方案");
  await page.getByRole("textbox", { name: "服务费", exact: true }).fill("0");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByText("金额须大于0并在系统金额范围内")).toBeVisible();
  await page.getByRole("textbox", { name: "服务费", exact: true }).fill("7.50");
  await page
    .getByRole("button", { name: "保存新版本", exact: true })
    .dblclick();
  await expect(page.locator(".pricing-history article")).toHaveCount(2);
  await expect(page.locator(".pricing-history")).toContainText("v3");
  await expect(page.locator(".pricing-history")).toContainText("6元/次");
  await expect(page.locator(".pricing-history")).toContainText("7.50元/次");
  await menu("服务商品");
  const product = page
    .locator(".product-list .ant-table-row")
    .filter({ hasText: "表格清洗" });
  await expect(product).toContainText("6 元/次");
  await product.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "发布上架", exact: true }).click();
  await page.getByRole("button", { name: "确认发布预览", exact: true }).click();
  const published = page
    .locator(".product-list .ant-table-row")
    .filter({ hasText: "表格清洗改进版" });
  await expect(published).toContainText("7.50");
  await published.getByRole("button", { name: "停销", exact: true }).click();
  await page.getByRole("button", { name: "确认停销预览", exact: true }).click();
  await page.getByRole("tab", { name: "停销（1）", exact: true }).click();
  await expect(page.locator(".product-list .ant-table-row")).toHaveCount(
    1,
  );
  report.checks.push(
    "price versions retain old prices, duplicate saves reuse one intent, and publish and pause previews update the service list",
  );

  await menu("销售订单");
  await choose("销售服务", "景点预约");
  await expect(page.locator(".sales-list .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".sales-summary")).toContainText("8");
  await expect(page.locator(".sales-list")).toContainText("李**");
  report.checks.push(
    "sales filters update masked buyer and fulfillment summaries",
  );
  await menu("使用统计");
  await choose("统计服务", "表格清洗");
  await choose("统计版本", "v1.1");
  await expect(
    page.locator(".publisher-metric-stats .metric-blue strong"),
  ).toHaveText("16");
  await expect(
    page
      .locator(".publisher-metric-tables .ant-table")
      .first()
      .locator(".ant-table-row"),
  ).toHaveCount(1);
  await expect(page.locator(".publisher-metric-charts svg")).toHaveCount(2);
  report.checks.push(
    "service and version filters keep metric totals, quality rows and charts aligned",
  );

  await menu("故障诊断");
  await page
    .getByRole("button", { name: /创建修复版本/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "脚本编辑", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".editor-title")).toContainText("v0.5");
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  report.checks.push(
    "diagnostics opens an editable repair draft with a matching next-version manifest",
  );

  await menu("收益与结算");
  await expect(
    page.locator(".publisher-earnings-summary .panel").last(),
  ).toContainText("540");
  await page.getByRole("button", { name: "申请打款", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("200.00元");
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(
    page.getByText("打款接口尚未接入，当前可结算收益保留"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "返回", exact: true })
    .click();
  await page.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await page.getByRole("button", { name: "查询原请求", exact: true }).click();
  await expect(
    page.getByText("原请求P0018的回执查询接口待接入"),
  ).toBeVisible();
  report.checks.push(
    "earnings and settlement totals reconcile and payout requests preserve pending channel state",
  );

  await menu("发布者设置");
  await page.getByLabel("公开昵称", { exact: true }).fill("新工具工作室");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(
    page.getByText("发布者资料已保存", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "更新收款资料", exact: true }).click();
  await page
    .getByLabel("收款账户令牌", { exact: true })
    .fill("new-private-payout-token-5678");
  await page.getByRole("button", { name: "保存资料预览", exact: true }).click();
  await expect(page.getByText("********5678", { exact: true })).toBeVisible();
  await expect(
    page.getByText("new-private-payout-token-5678", { exact: true }),
  ).toHaveCount(0);
  await menu("收益与结算");
  await expect(
    page.getByRole("button", { name: "申请打款", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "查看结算详情", exact: true }).click();
  await expect(page.getByText("****1234", { exact: true })).toBeVisible();
  await menu("发布者设置");
  await expect(page.getByLabel("公开昵称", { exact: true })).toHaveValue(
    "新工具工作室",
  );
  report.checks.push(
    "profile changes persist, payout secrets are masked and cleared, and historical settlement account snapshots remain fixed",
  );

  await menu("来源与同步");
  await page.getByRole("tab", { name: "Git来源", exact: true }).click();
  await expect(
    page.locator(".publisher-imports-list .ant-table-tbody tr"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "生成草稿", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "查看差异", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "P1 source tabs filter example snapshots while disabled remote operations remain unavailable",
  );

  const exactAmount = await page.evaluate(async () =>
    (await import("/src/lib/money.ts")).formatMinorUnits("9223372036854775807"),
  );
  expect(exactAmount).toBe("92233720368547758.07");
  report.checks.push(
    "BIGINT minor-unit formatting retains the full signed 64-bit amount precision",
  );
  for (const route of [
    "/publisher/services/missing/edit",
    "/publisher/settlements/missing",
  ]) {
    await page.goto(base + route);
    await expect(page.getByText(/不存在或已失效/)).toBeVisible();
  }
  expect(report.errors).toEqual([]);
  report.checks.push(
    "new publisher pages handle unknown IDs and complete checks without browser exceptions",
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
  await server.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
