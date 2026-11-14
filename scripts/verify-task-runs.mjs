import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = path.resolve("output/verification/execution-pages");
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
async function capture(id, route, title, selector) {
  await page.goto(base + route);
  await expect(page.locator(".page-heading h1")).toHaveText(title);
  await expect(page.locator(selector).first()).toBeVisible();
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
        ".task-list-panel,.task-history-panel,.record-table,.run-detail-columns",
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
async function choose(label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: option })
    .click();
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
    ["USER-C08", "/me/tasks", "我的任务", ".task-table .ant-table-row"],
    [
      "USER-C09",
      "/me/tasks/demo",
      "任务详情",
      ".task-history-panel .ant-table-row",
    ],
    ["USER-C10", "/me/runs", "运行记录", ".record-table .ant-table-row"],
    ["USER-C11", "/me/runs/demo", "运行详情", ".run-log-lines > div"],
  ])
    await capture(...args);
  report.checks.push(
    "the task, task-detail, run-list and run-detail reference regions fit 1814 by 868 with visible help navigation",
  );

  await menu("我的任务");
  await page.getByText("本人自用", { exact: true }).click();
  await expect(page).toHaveURL(/scope=self/);
  await expect(page.locator(".task-table .ant-table-row")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("本人自用", { exact: true })).toBeVisible();
  await expect(page.locator(".task-table .ant-table-row")).toHaveCount(0);
  await page.getByText("付费服务", { exact: true }).click();
  await expect(page.locator(".task-table .ant-table-row")).toHaveCount(3);
  await page.keyboard.press("Control+k");
  await expect(page.locator(".global-search input")).toBeFocused();
  await page.getByRole("button", { name: "暂停后续", exact: true }).click();
  await page.getByRole("button", { name: "确认暂停", exact: true }).click();
  await expect(
    page.getByText("任务调度接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".task-table .ant-table-row").filter({ hasText: "博物馆" }),
  ).toContainText("本次进行中");
  report.checks.push(
    "task scope persists across reload and the pause preview exposes its integration status while the active task remains inspectable",
  );

  await page
    .locator(".task-table .ant-table-row")
    .filter({ hasText: "博物馆" })
    .getByRole("button", { name: "查看", exact: true })
    .click();
  await expect(page.locator(".task-summary-title")).toContainText(
    "免费景点预约",
  );
  await expect(
    page.getByRole("link", { name: "OD202611130002", exact: true }),
  ).toHaveAttribute("href", "/me/orders/OD202611130002");
  await page.getByRole("button", { name: "配置快照", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    '"visit_date": "2026-11-15"',
  );
  await expect(page.getByRole("dialog")).not.toContainText("source_file");
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "复制配置", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "新的使用权益与访问授权",
  );
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("link", { name: "查看全部运行", exact: true }).click();
  await expect(page).toHaveURL(/task=booking/);
  await expect(page.locator(".record-table .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".record-table")).toContainText("RUN082");
  report.checks.push(
    "task detail uses its own order and input snapshot, exposes configuration-copy requirements and filters its run history",
  );

  await menu("运行记录");
  await choose("运行状态筛选", "执行中");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".record-table .ant-table-row")).toHaveCount(1);
  await expect(page).toHaveURL(/status=RUNNING/);
  await page.reload();
  await expect(page.locator(".record-table .ant-table-row")).toHaveCount(1);
  await choose("服务筛选", "景点预约");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".record-table")).toContainText("RUN082");
  await page.getByPlaceholder("开始日期", { exact: true }).click();
  const selectedDay = page.locator(
    '.ant-picker-dropdown:visible .ant-picker-cell-in-view[title="2026-11-14"] .ant-picker-cell-inner',
  );
  await selectedDay.click();
  await selectedDay.click();
  await expect(page.getByPlaceholder("开始日期", { exact: true })).toHaveValue(
    "2026-11-14",
  );
  await expect(page.getByPlaceholder("结束日期", { exact: true })).toHaveValue(
    "2026-11-14",
  );
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".record-table .ant-table-row")).toHaveCount(0);
  await expect(page).toHaveURL(/from=2026-11-14/);
  await page.goto(base + "/me/runs?from=bad&to=2026-11-13");
  await expect(
    page.getByText("日期范围无效，请重新选择完整的起止日期。"),
  ).toBeVisible();
  await expect(page.locator(".record-table .ant-table-row")).toHaveCount(0);
  report.checks.push(
    "service, state and actual date controls filter records and preserve applied filters in the URL, including invalid and empty ranges",
  );

  await page.goto(base + "/me/runs/RUN082");
  await expect(page.locator(".run-header")).toContainText("执行中");
  await expect(page.locator(".run-header")).toContainText("目标待确认");
  await expect(page.locator(".run-steps .step-current")).toHaveCount(2);
  await expect(page.locator(".run-order-snapshot")).toContainText("2小时");
  await expect(page.locator(".run-result-grid")).toContainText("已提交批次2");
  await expect(page.locator(".run-result-grid")).toContainText("2 项");
  await page.getByRole("tab", { name: "产物", exact: true }).click();
  await expect(page).toHaveURL(/tab=outputs/);
  await expect(page.locator(".run-output-panel .ant-table-row")).toHaveCount(3);
  await expect(
    page
      .locator(".run-output-panel .ant-table-row")
      .filter({ hasText: "batch02.csv" })
      .getByRole("button", { name: "生成中", exact: true }),
  ).toBeDisabled();
  await page.reload();
  for (const batch of [1, 2]) {
    await page
      .locator(".run-output-panel .ant-table-row")
      .filter({ hasText: `预约进度-${batch}.json` })
      .getByRole("link", { name: "预览与下载", exact: true })
      .click();
    await expect(page.locator(".output-selector")).toContainText(
      `预约进度-${batch}.json`,
    );
    await expect(page.locator(".output-text-view")).toContainText(
      `"batch": ${batch}`,
    );
    await expect(page.locator(".output-text-view")).toContainText(
      '"execution_status": "RUNNING"',
    );
    await page.goBack();
    await expect(page.locator(".run-header")).toContainText("执行中");
  }
  report.checks.push(
    "a continuous run exposes two independently committed ready batches through their own output links and retains its pending business goal",
  );

  await page.getByRole("tab", { name: "通知", exact: true }).click();
  await expect(page.locator(".run-detail-columns")).toContainText("未触发");
  await expect(page.locator(".run-detail-columns")).not.toContainText("已通知");
  await page.getByRole("tab", { name: "脱敏日志", exact: true }).click();
  await expect(page.locator(".run-log-lines")).toContainText(
    "进度产物批次02已提交",
  );
  await expect(page.locator(".run-log-lines")).not.toContainText("行数为1200");
  const logDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出日志", exact: true }).click();
  const log = await logDownload;
  assert.equal(log.suggestedFilename(), "RUN082-脱敏日志-示例.txt");
  assert.ok(
    (await readFile(await log.path(), "utf8")).includes("继续本次运行"),
  );
  await page.getByRole("button", { name: "停止运行", exact: true }).click();
  await page.getByRole("button", { name: "请求停止", exact: true }).click();
  await expect(page.getByText("停止接口待接入", { exact: true })).toBeVisible();
  await expect(page.locator(".run-header")).toContainText("执行中");
  report.checks.push(
    "continuous-run logs, notification delivery and controlled-stop preview each expose their own state and the log export uses the selected run",
  );

  await page.goto(base + "/me/runs/RUN081");
  await expect(page.locator(".run-result-grid")).toContainText("86");
  await expect(page.locator(".run-log-lines > div")).toHaveCount(6);
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载文件", exact: true }).click();
  const csv = await csvEvent;
  assert.equal(csv.suggestedFilename(), "cleaned.csv");
  assert.ok((await readFile(await csv.path(), "utf8")).includes("name,email"));
  await page.getByRole("tab", { name: "产物", exact: true }).click();
  await page
    .locator(".run-output-panel .ant-table-row")
    .filter({ hasText: "summary.json" })
    .getByRole("link", { name: "预览与下载", exact: true })
    .click();
  const jsonEvent = page.waitForEvent("download");
  await page
    .locator(".outputs-toolbar")
    .getByRole("button", { name: /下载/ })
    .click();
  const jsonFile = await jsonEvent;
  assert.equal(
    JSON.parse(await readFile(await jsonFile.path(), "utf8"))
      .duplicates_removed,
    86,
  );
  report.checks.push(
    "the completed result, log evidence and downloaded JSON agree on the duplicate count and the overview file download returns its actual preview content",
  );

  await page.goto(base + "/me/runs/RUN083");
  await expect(page.locator(".run-header")).toContainText("待补充");
  await expect(page.locator(".run-result-panel")).toContainText("单次执行");
  await expect(
    page.getByRole("button", { name: "下载文件", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "查看待补充事项", exact: true }).click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.locator(".pending-action-card")).toHaveCount(1);
  await page.goto(base + "/me/tasks/data");
  await expect(page.locator(".task-timeline")).toContainText("脚本待执行");
  await expect(page.locator(".task-timeline")).not.toContainText("脚本运行中");
  report.checks.push(
    "a waiting run presents its own pending-input log and routes to the matching pending category",
  );

  const live = await session(true);
  for (const route of [
    "/me/tasks",
    "/me/tasks/demo",
    "/me/runs",
    "/me/runs/demo",
  ]) {
    await live.goto(base + route);
    await expect(live.getByText(/服务待接入/).first()).toBeVisible();
    await expect(
      live.locator(
        ".task-table .ant-table-row,.record-table .ant-table-row,.task-summary-hero,.run-header",
      ),
    ).toHaveCount(0);
  }
  for (const route of ["/me/tasks/missing", "/me/runs/missing"]) {
    await page.goto(base + route);
    await expect(page.getByText(/不存在或已失效/)).toBeVisible();
  }
  report.checks.push(
    "live task and run pages expose pending integration and unknown resources render their unavailable state",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/me/tasks",
    "/me/tasks/booking",
    "/me/runs",
    "/me/runs/RUN081",
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
    "all four routes fit 390px with internally scrollable tables and local preview actions use no business mutations",
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
