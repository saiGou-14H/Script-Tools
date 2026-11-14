import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { metricFacts } from "../apps/web/src/lib/publisher-quality-preview.ts";

const output = path.resolve("output/verification/publisher-quality-pages");
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
const mutations = [];
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
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  if (live) {
    await context.route("**/api/v1/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.data_mode = "live";
      await route.fulfill({ response, json: body });
    });
  }
  const current = await context.newPage();
  current.on("pageerror", (error) => report.errors.push(error.message));
  current.on("request", (request) => {
    if (
      request.url().includes("/api/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    ) {
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  return current;
}
async function choose(name, label) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText(label, { exact: true })
    .click();
}
async function capture(id, route, selector) {
  await page.goto(base + route);
  await expect(page.locator(selector)).toBeVisible();
  await page.mouse.move(1813, 867);
  await page.screenshot({
    path: path.join(output, id + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(id);
  report.layouts[id] = await page.evaluate((selector) => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      main: bounds(document.querySelector(selector)),
      help: bounds([...document.querySelectorAll(".sidebar a")].find(
        (link) => link.textContent.includes("使用帮助"),
      )),
    };
  }, selector);
}
try {
  page = await session();
  await capture("PUBLISHER-S11", "/publisher/metrics", ".publisher-metric-tables");
  await capture("PUBLISHER-S12", "/publisher/diagnostics", ".diagnostic-bottom-grid");
  for (const layout of Object.values(report.layouts)) {
    expect(layout.width).toBe(1814);
    expect(layout.height).toBe(868);
    expect(layout.main.bottom).toBeLessThanOrEqual(858);
    expect(layout.help.bottom).toBeLessThanOrEqual(858);
  }
  report.checks.push("publisher metrics and diagnostic reference regions and sidebar help fit 1814 by 868");

  await page.goto(base + "/publisher/metrics");
  await expect(page.locator(".metric-blue strong")).toHaveText("128");
  await expect(page.locator(".metric-green")).toContainText("96.9% (124/128)");
  await expect(page.locator(".metric-purple")).toContainText("82.0% (105/128)");
  await expect(page.locator(".metric-orange strong")).toHaveText("4");
  await expect(page.locator(".publisher-trend-chart .chart-point-label"))
    .toHaveText(["12", "16", "18", "20", "24", "22", "16"]);
  await expect(page.locator(".publisher-metric-tables .ant-table-row")).toHaveCount(6);
  await expect(page.locator(".ant-table-summary")).toContainText("150.00");
  report.checks.push("default usage, independent delivery and goal evidence, daily trend and refund totals reconcile with the reference aggregates");

  for (const fact of metricFacts) {
    assert.equal(fact.dailyUses.length, 7);
    assert.ok(fact.dailyUses.every((count) => Number.isInteger(count) && count >= 0));
    const uses = fact.dailyUses.reduce((sum, count) => sum + count, 0);
    const query = new URLSearchParams({ service: fact.service, version: fact.version });
    await page.goto(base + "/publisher/metrics?" + query);
    await expect(page.locator(".metric-blue strong")).toHaveText(String(uses));
    await expect(page.locator(".metric-green strong"))
      .toHaveText(`${((fact.delivered / uses) * 100).toFixed(1)}%`);
    await expect(page.locator(".metric-purple strong"))
      .toHaveText(`${((fact.achieved / uses) * 100).toFixed(1)}%`);
    await expect(page.locator(".publisher-trend-chart .chart-point-label"))
      .toHaveText(fact.dailyUses.map(String));
    const refundTable = page.locator(".publisher-metric-tables > .panel").last();
    await expect(refundTable.locator(".ant-table-row")).toHaveCount(1);
    await expect(refundTable.locator(".ant-table-row"))
      .toContainText((Number(fact.refundAmountMinor) / 100).toFixed(2));
  }
  report.checks.push("all nine service-version combinations use their own daily counts, delivered and achieved facts, and stored refund amount");

  await page.goto(base + "/publisher/metrics");
  await choose("统计服务", "表格清洗");
  await choose("统计版本", "v1.2");
  await page.reload();
  const filters = new URL(page.url()).searchParams;
  expect(filters.get("service")).toBe("表格清洗");
  expect(filters.get("version")).toBe("v1.2");
  await expect(page.locator(".metric-green strong")).toHaveText("95.0%");
  await expect(page.locator(".metric-purple strong")).toHaveText("82.5%");
  await expect(page.locator(".ant-table-summary")).toContainText("55.00");
  await choose("统计版本", "v1.1");
  await expect(page.locator(".metric-blue strong")).toHaveText("16");
  await page.goBack();
  await expect(page.locator(".metric-blue strong")).toHaveText("40");
  report.checks.push("interactive filters persist across reload and browser history, retaining independent delivery, goal and variable refund evidence");

  await page.goto(base + "/publisher/metrics?period=30");
  await expect(page.getByText("该时间范围的统计数据暂不可用，请选择7天示例。", { exact: true })).toBeVisible();
  await expect(page.locator(".publisher-metric-stats strong"))
    .toHaveText(["—", "—", "—", "—"]);
  await expect(page.locator(".publisher-trend-chart, .publisher-failure-chart")).toHaveCount(0);
  await page.goto(base + "/publisher/metrics?service=missing");
  await expect(page.locator(".metric-blue strong")).toHaveText("0");
  await expect(page.locator(".publisher-metric-tables .ant-table-row")).toHaveCount(0);
  await expect(page.locator(".publisher-trend-chart, .publisher-failure-chart")).toHaveCount(0);
  report.checks.push("unsupported time windows remain unavailable and an unmatched preview filter returns a coherent empty result");

  await page.goto(base + "/publisher/diagnostics");
  await expect(page.locator(".diagnostic-owner-logs")).toContainText("文件处理 v0.4");
  await expect(page.locator(".diagnostic-log")).toContainText("构建 B032");
  const dependency = page.locator(".diagnostic-issues .ant-table-row")
    .filter({ hasText: "文件工具依赖缺失" });
  await dependency.getByRole("button", { name: "查看构建", exact: true }).click();
  const buildQuery = new URL(page.url()).searchParams;
  expect(buildQuery.get("script")).toBe("文件处理");
  expect(buildQuery.get("version")).toBe("v0.4");
  expect(buildQuery.get("record")).toBe("B032");
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".build-detail")).toContainText("B032");
  await expect(page.locator(".build-detail")).toContainText("依赖锁缺失");
  await page.goBack();
  await page.getByRole("button", { name: "查看执行超时诊断", exact: true }).click();
  await page.reload();
  await expect(page).toHaveURL(/issue=timeout/);
  await expect(page.locator(".diagnostic-log")).toContainText("构建 B031");
  await expect(page.locator(".diagnostic-log")).toContainText("固定制品构建成功");
  await expect(page.locator(".diagnostic-log")).not.toContainText("file-utils");
  report.checks.push("diagnostic build links select the matching script name, version and build, while issue selection scopes owner logs and survives reload");

  await page.goto(base + "/publisher/diagnostics");
  await dependency.getByRole("button", { name: "创建修复版本", exact: true }).click();
  await expect(page.locator(".editor-title")).toContainText("v0.5");
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  await page.goto(base + "/publisher/diagnostics");
  await expect(page.locator(".diagnostic-owner-logs")).toContainText("文件处理 v0.4");
  report.checks.push("repair entry creates the matching editable local draft and preserves the original diagnostic version evidence");

  await page.getByRole("button", { name: "查看预约结果待核验诊断", exact: true }).click();
  await expect(page).toHaveURL(/issue=verification/);
  await expect(page.locator(".diagnostic-log")).toContainText("该版本构建日志待载入");
  await expect(page.locator(".diagnostic-log")).not.toContainText("B032");
  const pending = page.locator(".diagnostic-issues .ant-table-row")
    .filter({ hasText: "原预约结果未知" });
  await expect(pending.getByRole("button", { name: "查看构建", exact: true })).toBeDisabled();
  await expect(pending).toContainText("待核验");
  await expect(pending).toContainText("5 次");
  await page.goto(base + "/publisher/diagnostics?issue=missing");
  await expect(page.locator(".diagnostic-log")).toContainText("诊断 missing 不存在或已失效");
  report.checks.push("unknown external results retain verification classification, missing owner-build evidence stays unavailable, and unknown diagnostics preserve their identity");

  const live = await session(true);
  await live.goto(base + "/publisher/metrics");
  await expect(live.locator(".publisher-metric-stats strong"))
    .toHaveText(["—", "—", "—", "—"]);
  await expect(live.locator(".publisher-metric-tables .ant-table-row")).toHaveCount(0);
  await expect(live.locator(".publisher-trend-chart, .publisher-failure-chart")).toHaveCount(0);
  await expect(live.getByRole("combobox", { name: "统计服务", exact: true })).toBeDisabled();
  await expect(live.locator(".ant-table-summary")).toContainText("—");
  await live.goto(base + "/publisher/diagnostics");
  await expect(live.locator(".diagnostic-issues .ant-table-row")).toHaveCount(0);
  await expect(live.locator(".diagnostic-log")).toContainText("本人构建日志待接入");
  await expect(live.locator(".diagnostic-log")).not.toContainText("file-utils");
  report.checks.push("live statistics, refunds and diagnostics expose pending integration with unknown counters and unavailable owner evidence");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/publisher/metrics", "/publisher/diagnostics"]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("both routes fit 390px with internal table scrolling and preview actions issue no business mutations or browser exceptions");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
