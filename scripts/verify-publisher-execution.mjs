import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = path.resolve("output/verification/publisher-execution-pages");
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
const mutations = [];
async function session(live = false) {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
    permissions: ["clipboard-read", "clipboard-write"],
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
    ) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return current;
}
async function choose(name, text) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText(text, { exact: true })
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
  const layout = await page.evaluate((selector) => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      main: bounds(document.querySelector(selector)),
      help: bounds([...document.querySelectorAll(".sidebar a")].find((link) => link.textContent.includes("使用帮助"))),
    };
  }, selector);
  report.layouts[id] = layout;
  expect(layout.width).toBe(1814);
  expect(layout.height).toBe(868);
  expect(layout.main.bottom).toBeLessThanOrEqual(858);
  expect(layout.help.bottom).toBeLessThanOrEqual(858);
}
try {
  page = await session();
  await capture("PUBLISHER-S05", "/publisher/builds", ".builds-columns");
  await capture("PUBLISHER-S06", "/publisher/deployments", ".deployments-columns");
  report.checks.push("build and deployment reference regions and sidebar help fit 1814 by 868");

  await page.goto(base + "/publisher/builds");
  await choose("构建状态", "成功");
  await page.getByRole("button", { name: "查询构建记录", exact: true }).click();
  await expect(page).toHaveURL(/status=SUCCEEDED/);
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".build-detail")).toContainText("B031");
  await page.getByRole("button", { name: "查看B031", exact: true }).click();
  await page.reload();
  await expect(page).toHaveURL(/record=B031/);
  await expect(page.locator(".build-detail")).toContainText("固定制品构建成功");
  await page.goto(base + "/publisher/builds?status=FAILED&record=B031");
  await expect(page.locator(".build-detail")).toContainText("记录 B031 不存在或不在当前筛选范围内");
  await page.goto(base + "/publisher/builds?script=missing");
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(0);
  await expect(page.locator(".build-detail")).toContainText("当前筛选无记录");
  await page.goto(base + "/publisher/builds");
  await choose("构建脚本", "文件处理");
  await choose("构建版本", "v0.4");
  await choose("构建状态", "失败");
  await page.getByRole("button", { name: "查询构建记录", exact: true }).click();
  await page.reload();
  const applied = new URL(page.url()).searchParams;
  expect(applied.get("script")).toBe("文件处理");
  expect(applied.get("version")).toBe("v0.4");
  expect(applied.get("status")).toBe("FAILED");
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".build-detail")).toContainText("B032");
  report.checks.push("applied build filters and selection survive reload while unavailable or filtered selections retain their own identity");

  await page.goto(base + "/publisher/builds?status=FAILED");
  await page.getByRole("tab", { name: "试运行记录", exact: true }).click();
  await expect(page).toHaveURL(/tab=trial/);
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(2);
  await page.getByRole("button", { name: "查看TEST082", exact: true }).click();
  await page.reload();
  await expect(page.locator(".build-detail")).toContainText("TEST082");
  await expect(page.locator(".build-detail")).toContainText("等待可用的开发配额");
  await expect(page.locator(".build-detail")).not.toContainText("去重86条");
  await page.getByRole("button", { name: "取消TEST082", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("TEST082 的取消作业接口待接入");
  await page.getByRole("button", { name: "了解", exact: true }).click();
  await expect(page.locator(".selected-build")).toContainText("排队中");
  report.checks.push("trial records have their own URL selection and queued detail, and cancellation exposes its pending integration state");

  await page.goto(base + "/publisher/builds?record=B032");
  await expect(page.locator(".build-detail")).toContainText("依赖锁缺失");
  await page.getByRole("button", { name: "重新构建", exact: true }).click();
  await expect(page.getByText("B032 的构建服务待接入", { exact: true })).toBeVisible();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(3);
  report.checks.push("failed build diagnostics and retry feedback reference the selected build and retain the recorded result");

  await page.goto(base + "/publisher/deployments");
  const failed = page.locator(".deployments-list .ant-table-row").filter({ hasText: "文件处理" });
  await failed.getByRole("button", { name: "详情", exact: true }).click();
  await expect(page).toHaveURL(/deployment=files/);
  await page.reload();
  await expect(page.locator(".deployments-columns aside")).toContainText("文件处理 v0.4");
  await expect(page.locator(".deployment-log")).toContainText("部署等待修复");
  await expect(failed.getByRole("button", { name: "停用", exact: true })).toBeDisabled();
  await failed.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("文件处理 v0.4 的部署重试接口待接入", { exact: true })).toBeVisible();
  await page.goto(base + "/publisher/deployments?deployment=missing");
  await expect(page.locator(".deployments-columns aside")).toContainText("部署 missing 不存在或已失效");
  await expect(page.locator(".deployment-log")).not.toContainText("服务已就绪");
  report.checks.push("deployment selection persists with state-specific diagnostics and actions, and an unknown deployment remains unavailable");

  await page.goto(base + "/publisher/deployments?deployment=booking");
  const booking = page.locator(".deployments-list .ant-table-row").filter({ hasText: "景点预约 v1.0" });
  const digest = await booking.locator(".ant-typography").getAttribute("title");
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  await booking.locator(".ant-typography-copy").click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(digest);
  await expect(booking.getByRole("link", { name: "景点预约 v1.0", exact: true })).toHaveAttribute("href", "/publisher/versions/booking");
  await expect(booking.getByRole("link", { name: "免费景点预约", exact: true })).toHaveAttribute("href", "/publisher/services/booking/edit");
  await booking.getByRole("button", { name: "停用", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("景点预约 v1.0");
  await expect(page.getByRole("dialog")).toContainText("权益数量待计算");
  await page.getByRole("button", { name: "了解影响", exact: true }).click();
  await expect(booking).toContainText("READY");
  report.checks.push("deployment copy returns the complete local example digest, related links use its own version and service, and stop impact stays pending calculation");

  await page.getByRole("button", { name: "创建部署", exact: true }).click();
  await choose("固定版本", "景点预约 v1.0");
  await choose("运行模式", "QEMU KVM");
  await page.getByRole("spinbutton", { name: "CPU核数", exact: true }).fill("4");
  await page.getByRole("spinbutton", { name: "内存（MB）", exact: true }).fill("8192");
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  const configuration = page.locator(".deployment-configuration-preview pre");
  await expect(configuration).toBeVisible();
  assert.deepEqual(JSON.parse(await configuration.textContent()), {
    script: "景点预约", version: "v1.0", artifact_digest: digest,
    execution_mode: "qemu_kvm", cpu: 4, memory_mb: 8192, allow_tcg: false,
  });
  await page.getByRole("spinbutton", { name: "CPU核数", exact: true }).clear();
  await expect(configuration).toHaveCount(0);
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(page.locator(".ant-form-item-explain-error")).toBeVisible();
  await expect(configuration).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "CPU核数", exact: true }).fill("1.5");
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(configuration).toContainText('"cpu": 1.5');
  report.checks.push("deployment configuration previews its selected ready version, complete digest and resource values, and editing clears stale validation evidence");

  await choose("运行模式", "QEMU TCG");
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(page.getByText("请明确允许TCG执行", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "显式允许TCG执行", exact: true }).check();
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(configuration).toContainText('"allow_tcg": true');
  await choose("运行模式", "Docker");
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(configuration).toContainText('"execution_mode": "docker"');
  await expect(configuration).toContainText('"allow_tcg": false');
  await choose("运行模式", "QEMU TCG");
  await expect(page.getByRole("checkbox", { name: "显式允许TCG执行", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(page.getByText("请明确允许TCG执行", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click();
  report.checks.push("Docker, KVM and TCG remain separate execution modes and TCG requires explicit consent after switching away and back");

  const live = await session(true);
  await live.goto(base + "/publisher/builds?record=B032");
  await expect(live.locator(".build-records .ant-table-row")).toHaveCount(0);
  await expect(live.locator(".build-detail")).toContainText("构建详情待接入");
  await expect(live.getByRole("button", { name: "查询构建记录", exact: true })).toBeDisabled();
  await live.goto(base + "/publisher/deployments?deployment=table");
  await expect(live.getByRole("button", { name: "创建部署", exact: true })).toBeDisabled();
  await expect(live.locator(".deployments-list .ant-table-row")).toHaveCount(0);
  await expect(live.locator(".deployments-columns aside")).toContainText("部署详情待接入");
  await expect(live.locator(".deployments-columns aside")).not.toContainText("3 CPU");
  await expect(live.locator(".deployments-columns aside")).not.toContainText("0 CPU");
  report.checks.push("live build and deployment views expose pending integration with unavailable details and unknown resource quotas");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/publisher/builds", "/publisher/deployments"]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBe(390);
  }
  expect(mutations).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push("both routes fit 390px with internally scrollable tables and preview actions issue no business mutations or browser exceptions");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  }
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
