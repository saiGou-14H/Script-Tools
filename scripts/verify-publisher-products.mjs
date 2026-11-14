import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { parameterExamples } from "../apps/web/src/lib/schema-parameters.ts";
import { captureProductRelease } from "../apps/web/src/lib/publisher-product-preview.ts";

const output = path.resolve("output/verification/publisher-product-pages");
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
  ["S07", "/publisher/services", ".product-list"],
  ["S08", "/publisher/services/demo/edit", ".product-editor-columns"],
  ["S09", "/publisher/pricing", ".pricing-columns"],
  ["S10", "/publisher/orders", ".sales-list"],
];
let page;
let developmentServer;
async function session(baseURL = base, live = false) {
  const context = await browser.newContext({ viewport: { width: 1814, height: 868 } });
  contexts.push(context);
  const login = await context.request.post(baseURL + "/api/v1/auth/login", {
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
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
async function menu(current, name) {
  await current.locator(".sidebar").getByRole("link", { name, exact: true }).click();
}
async function choose(current, label, value) {
  await current.getByRole("combobox", { name: label, exact: true }).click();
  await current.locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText(value, { exact: true }).click();
}
async function changeRoute(current, route) {
  await current.evaluate((route) => {
    history.pushState(null, "", route);
    dispatchEvent(new PopStateEvent("popstate"));
  }, route);
  await expect(current).toHaveURL(new RegExp(route.replace(/[?]/g, "\\?")));
}
try {
  page = await session();
  for (const [id, route, selector] of routes) {
    await page.goto(base + route);
    await expect(page.locator(selector)).toBeVisible();
    await page.mouse.move(1813, 867);
    await page.screenshot({ path: path.join(output, `PUBLISHER-${id}.png`),
      fullPage: true, animations: "disabled" });
    report.screenshots.push(`PUBLISHER-${id}`);
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
  report.checks.push("all four reference regions and sidebar help fit 1814 by 868");

  await page.goto(base + "/publisher/services?status=DRAFT&source=verification");
  await expect(page.locator(".product-list .ant-table-row")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("tab", { name: "草稿（1）", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "全部（3）", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  expect(new URL(page.url()).searchParams.has("status")).toBe(false);
  report.checks.push("product status selection survives reload and preserves unrelated URL parameters");

  const table = page.locator(".product-list .ant-table-row").filter({ hasText: "表格清洗" });
  await table.getByRole("button", { name: "查看消费者页面", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("表格清洗");
  await expect(dialog).toContainText("v1.2");
  await expect(dialog).toContainText("固定价格版本v3");
  await expect(dialog.locator(".product-release-schema")).toContainText("deduplicate_by");
  await expect(dialog.locator(".product-release-schema")).not.toContainText("visit_date");
  await dialog.getByRole("button", { name: "关闭预览", exact: true }).click();
  await menu(page, "价格方案");
  await page.getByRole("textbox", { name: "服务费", exact: true }).fill("7.50");
  await page.getByRole("button", { name: "保存新版本", exact: true }).dblclick();
  await expect(page.locator(".pricing-history article")).toHaveCount(2);
  await menu(page, "服务商品");
  await table.getByRole("button", { name: "查看消费者页面", exact: true }).click();
  await expect(dialog).toContainText("固定价格版本v3");
  await expect(dialog).toContainText("6.00 元/次");
  await dialog.getByRole("button", { name: "关闭预览", exact: true }).click();
  await table.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".product-input-preview > div")).toHaveCount(2);
  await expect(page.locator(".product-input-preview")).not.toContainText("10MB");
  await expect(page.locator(".product-input-preview")).not.toContainText("输出格式");
  await page.getByLabel("服务名称", { exact: true }).fill("所选表格商品");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(table).not.toContainText("所选表格商品");
  await table.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "发布上架", exact: true }).click();
  await page.getByRole("button", { name: "确认发布预览", exact: true }).click();
  const released = page.locator(".product-list .ant-table-row").filter({ hasText: "所选表格商品" });
  await released.getByRole("button", { name: "查看消费者页面", exact: true }).click();
  await expect(dialog).toContainText("所选表格商品");
  await expect(dialog).toContainText("固定价格版本v4");
  await expect(dialog).toContainText("7.50 元/次");
  expect(page.context().pages()).toHaveLength(1);
  await dialog.getByRole("button", { name: "关闭预览", exact: true }).click();
  report.checks.push("selected consumer preview uses its own schema and immutable release, draft and price edits preserve the sale until explicit publication");

  await changeRoute(page, "/publisher/pricing?service=table");
  await expect(page.getByRole("textbox", { name: "服务费", exact: true })).toHaveValue("7.50");
  await page.getByRole("textbox", { name: "服务费", exact: true }).fill("9.99");
  await changeRoute(page, "/publisher/pricing?service=booking");
  await expect(page.getByRole("textbox", { name: "服务费", exact: true })).toHaveValue("8.00");
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "服务费", exact: true })).toHaveValue("7.50");
  await changeRoute(page, "/publisher/services/table/edit");
  await page.getByLabel("服务名称", { exact: true }).fill("临时未保存名称");
  await changeRoute(page, "/publisher/services/booking/edit");
  await expect(page.getByLabel("服务名称", { exact: true })).toHaveValue("景点预约");
  await expect(page.locator(".product-input-preview")).toContainText("预约日期");
  report.checks.push("editor and price forms reset to the selected resource across SPA routing and browser history");

  await page.goto(base + "/publisher/services/new/edit");
  await choose(page, "绑定脚本", "文件处理 v0.4");
  await expect(page.locator(".product-input-preview")).toContainText("输出格式");
  await page.getByLabel("服务名称", { exact: true }).fill("自定义文件商品");
  await page.getByRole("button", { name: "发布上架", exact: true }).click();
  await expect(page.getByText("请先完成发布检查清单").first()).toBeVisible();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const created = page.locator(".product-list .ant-table-row").filter({ hasText: "自定义文件商品" });
  await expect(created).toContainText("未定价");
  await created.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".product-input-preview")).toContainText("输出格式");
  await page.getByRole("link").filter({ hasText: "价格方案待配置" }).click();
  await page.getByRole("textbox", { name: "服务费", exact: true }).fill("2.30");
  await page.getByRole("button", { name: "保存新版本", exact: true }).dblclick();
  await expect(page.locator(".pricing-history article")).toHaveCount(1);
  report.checks.push("new products bind the chosen owner script and retain its schema, while publication requires an explicit price and readiness checks");

  await page.goto(base + "/publisher/orders?source=verification");
  await expect(page.locator(".sales-summary strong")).toHaveText(["2", "14 元", "8 元"]);
  await choose(page, "销售服务", "景点预约");
  await choose(page, "销售日期", "2026-11-13");
  await choose(page, "销售履约状态", "目标未达");
  await page.reload();
  await expect(page.locator(".sales-list .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".sales-summary strong")).toHaveText(["1", "8 元", "8 元"]);
  expect(new URL(page.url()).searchParams.get("source")).toBe("verification");
  await expect(page.locator(".sales-list")).toContainText("李**");
  report.checks.push("sales service, date and fulfillment filters survive reload and recompute the same masked-owner records");

  const schema = { type: "object", required: ["zero"], properties: {
    zero: { type: "number", default: 0 },
    flag: { type: "boolean", const: false },
    nested: { type: "object", examples: [{ count: 2 }] },
    file: { type: "string" },
  } };
  const fields = parameterExamples(schema, ["flag", "zero"]);
  assert.deepEqual(fields.map((field) => field.example), ["false", "0", '{"count":2}', "由使用者填写"]);
  assert.equal(fields[1].required, true);
  assert.equal(fields[0].required, false);
  const script = { id: "own-script", version: "1.0", inputSchema: schema };
  const plan = { id: "own-plan", version: 3, amountMinor: "600", refundRule: "FULL_IF_UNMET",
    maxServiceSeconds: 300, validityDays: 7, goal: "已交付", verificationHours: 1 };
  const snapshot = captureProductRelease(script, plan);
  schema.properties.zero.default = 9;
  plan.amountMinor = "750";
  assert.equal(snapshot.inputSchema.properties.zero.default, 0);
  assert.equal(snapshot.amountMinor, "600");
  assert.equal(snapshot.pricePlanId, "own-plan");
  report.checks.push("schema examples preserve zero, false, nested values and publisher-required fields, and release capture clones the source schema and price facts");

  const live = await session(base, true);
  for (const [, route] of routes) {
    await live.goto(base + route);
    await expect(live.getByText(/待接入/).first()).toBeVisible();
    await expect(live.locator(".ant-table-row")).toHaveCount(0);
  }
  await live.goto(base + "/publisher/services");
  await expect(live.getByRole("button", { name: "创建服务", exact: true })).toBeDisabled();
  await expect(live.getByRole("tab", { name: "全部（—）", exact: true })).toBeVisible();
  await page.goto(base + "/publisher/services/unavailable/edit");
  await expect(page.getByText("服务或关联脚本不存在或已失效")).toBeVisible();
  await page.goto(base + "/publisher/pricing?service=unavailable");
  await expect(page.getByText("请先保存服务商品草稿，再配置价格")).toBeVisible();
  report.checks.push("live metadata stays unavailable on all four routes and missing product identities show their own empty state");

  developmentServer = await createServer({
    root, configFile: path.join(root, "vite.config.ts"),
    cacheDir: path.resolve(".local/publisher-products-verification-vite"),
    server: { host: "127.0.0.1", port: 0, strictPort: true,
      proxy: { "/api": { target: "http://127.0.0.1:3001" } } },
  });
  await developmentServer.listen();
  const devAddress = developmentServer.httpServer.address();
  assert.ok(devAddress && typeof devAddress === "object");
  const devBase = `http://127.0.0.1:${devAddress.port}`;
  const precision = await session(devBase);
  await precision.goto(devBase + "/publisher/orders");
  await expect(precision.locator(".sales-list .ant-table-row")).toHaveCount(2);
  const moduleURL = await precision.evaluate(() => performance.getEntriesByType("resource")
    .find((entry) => entry.name.includes("/src/lib/publisher-sales-preview.ts"))?.name);
  assert.ok(moduleURL);
  await precision.evaluate(async (moduleURL) => {
    const data = await import(moduleURL);
    data.publisherSales[0].amountMinor = "9223372036854775807";
    data.publisherSales[0].refundProcessingMinor = "7";
  }, moduleURL);
  await choose(precision, "销售服务", "表格清洗");
  await expect(precision.locator(".sales-summary strong"))
    .toHaveText(["1", "92233720368547758.07 元", "0.07 元"]);
  expect(await precision.evaluate(() => document.documentElement.scrollWidth)).toBe(1814);
  report.checks.push("sales summaries retain signed-64-bit precision and use the explicit partial-refund amount independently of the payment");

  const mobile = await session();
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const [, route, selector] of routes) {
    await mobile.goto(base + route);
    await expect(mobile.locator(selector)).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  report.checks.push("all four routes fit 390px with internal horizontal table scrolling and stacked editor forms");
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("product, pricing and sales preview actions complete without business mutations or browser exceptions");
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
