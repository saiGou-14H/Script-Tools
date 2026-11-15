import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startVerificationApp } from "./verification-app.mjs";

const root = path.resolve("apps/web");
const application = await startVerificationApp("outputs");
const server = await preview({
  root,
  configFile: path.join(root, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    proxy: { "/api": { target: application.url } },
  },
});
const address = server.httpServer.address();
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const output = path.resolve("output/verification/output-pages");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
let sourceServer;
const report = {
  date: new Date().toISOString(),
  data_source: "isolated PGlite, controlled metadata responses and local examples",
  render_source: "production build with separate development-server escaping and icon checks",
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
};
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
async function capture(id) {
  const pageId = id.split("-")[1];
  await expect(page.locator(`.page-${pageId} .page-heading h1`)).toBeVisible();
  await page.screenshot({
    path: path.join(output, `${id}.png`),
    fullPage: true,
  });
  report.screenshots.push(id);
  report.layouts[id] = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  assert.deepEqual(report.layouts[id], { width: 1814, height: 868 });
}
try {
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(base + "/api/v1/outputs")).status()).toBe(
    401,
  );
  await anonymous.close();
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
  const list = await context.request.get(base + "/api/v1/outputs");
  expect(list.status()).toBe(200);
  const envelope = await list.json();
  assert.ok(Array.isArray(envelope.data));
  assert.equal(envelope.next_cursor, null);
  assert.equal(typeof envelope.request_id, "string");
  assert.equal(list.headers()["cache-control"], "no-store");
  for (const query of [
    "owner=other",
    "limit=0",
    "state=UNSUPPORTED",
    "kind[]=file",
    "cursor=invalid",
    "kinds=text,unsupported",
    "kinds=text,",
    "kind=text&kinds=message",
    "kinds[]=text",
  ])
    expect(
      (await context.request.get(base + "/api/v1/outputs?" + query)).status(),
    ).toBe(422);
  expect(
    (await context.request.get(base + "/api/v1/outputs/not-an-id")).status(),
  ).toBe(404);
  expect(
    (
      await context.request.get(
        base + "/api/v1/outputs?kinds=message,text,text",
      )
    ).status(),
  ).toBe(200);
  report.checks.push(
    "the output HTTP API requires a session, returns the standard paginated envelope and rejects unsupported filters and invalid resources",
  );
  await page.goto(base + "/me/outputs");
  await expect(
    page.locator(".outputs-panel .ant-table-tbody tr.ant-table-row"),
  ).toHaveCount(3);
  await capture("USER-C12");
  await page.goto(base + "/me/outputs?output=json");
  await expect(page.locator(".output-row-selected")).toContainText(
    "summary.json",
  );
  await page
    .locator(".outputs-toolbar")
    .getByRole("button", { name: /安全预览/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    '"duplicates_removed": 86',
  );
  await expect(page).toHaveURL(/preview=1/);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(
    '"duplicates_removed": 86',
  );
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.goBack();
  await expect(page.getByRole("dialog")).toContainText(
    '"duplicates_removed": 86',
  );
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = page.waitForEvent("download");
  await page
    .locator(".outputs-toolbar")
    .getByRole("button", { name: /下载/ })
    .click();
  const file = await saved;
  assert.equal(file.suggestedFilename(), "summary.json");
  assert.equal(
    JSON.parse(await readFile(await file.path(), "utf8")).duplicates_removed,
    86,
  );
  await page.reload();
  await expect(page.locator(".output-row-selected")).toContainText(
    "summary.json",
  );
  report.checks.push(
    "home-style output links select the requested record, toolbar preview and download use its content, and selection survives reload",
  );
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.locator(".output-selector")).toContainText("清洗统计.json");
  const jsonDownload = page.waitForEvent("download");
  await page
    .locator(".outputs-toolbar")
    .getByRole("button", { name: /下载/ })
    .click();
  assert.equal((await jsonDownload).suggestedFilename(), "清洗统计.json");
  sourceServer = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    cacheDir: path.resolve(".local/output-verification-vite"),
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      proxy: { "/api": { target: application.url } },
    },
  });
  await sourceServer.listen();
  const sourcePage = await context.newPage();
  await sourcePage.goto(
    `http://127.0.0.1:${sourceServer.httpServer.address().port}/me/outputs?kind=json`,
  );
  await sourcePage.getByRole("tab", { name: "JSON", exact: true }).waitFor();
  const { Icon } = await sourceServer.ssrLoadModule("/src/components/Icon.tsx");
  for (const name of ["constructor", "toString", "__proto__", "unknown-format"])
    assert(
      renderToStaticMarkup(createElement(Icon, { name })).includes(
        'data-icon="file-text"',
      ),
    );
  await sourcePage.evaluate(async () => {
    const loaded = performance
      .getEntriesByType("resource")
      .find((entry) => entry.name.includes("/src/lib/consumer-preview.ts"));
    const module = await import(loaded.name);
    module.inlineOutputFixtures.find(
      (output) => output.kind === "text",
    ).content =
      '<img src="invalid" onerror="window.outputMarkupExecuted=true">';
  });
  await sourcePage.getByRole("tab", { name: "文本", exact: true }).click();
  await expect(sourcePage.locator(".output-text-view pre")).toContainText(
    '<img src="invalid"',
  );
  await expect(sourcePage.locator(".output-text-view img")).toHaveCount(0);
  assert.equal(
    await sourcePage.evaluate(() => window.outputMarkupExecuted),
    undefined,
  );
  await sourcePage.close();
  await sourceServer.close();
  sourceServer = undefined;
  report.checks.push(
    "source-rendered script text escapes markup and arbitrary icon names use a valid fallback, including inherited object keys",
  );
  await page.goto(base + "/me/outputs?kind=text&output=result-message");
  await expect(page.locator(".output-inline-metadata")).toContainText("消息");
  await expect(page.locator(".output-inline-metadata")).toContainText("未触发");
  await expect(page.locator(".output-text-view pre")).toContainText(
    '"title": "表格清洗完成"',
  );
  await page.goto(base + "/me/outputs?kind=files&output=result-message");
  await expect(
    page.getByText("所选产物不属于当前分类", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看所属分类", exact: true }).click();
  await expect(page.locator(".output-inline-metadata")).toContainText("消息");
  report.checks.push(
    "message outputs share the text category with their own delivery facts and a mismatched deep link can recover its actual category",
  );
  await page.goto(base + "/me/outputs?output=pending");
  await expect(
    page.locator(".outputs-toolbar").getByRole("button", { name: /下载/ }),
  ).toBeDisabled();
  await page.goto(base + "/me/outputs?output=missing");
  await expect(
    page.getByText("指定产物不存在或已失效", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".outputs-toolbar").getByRole("button", { name: /下载/ }),
  ).toBeDisabled();
  report.checks.push(
    "JSON and text tabs operate on their own records, render script-provided markup as text and keep unavailable or unknown selection actions disabled",
  );
  await page.goto(base + "/me/outputs?kind=unsupported");
  await expect(
    page.getByText("产物分类无效，请选择有效分类", { exact: true }),
  ).toBeVisible();
  for (const button of await page.locator(".outputs-toolbar button").all())
    await expect(button).toBeDisabled();
  const live = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  expect(
    (
      await live.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "consumer@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
  ).toBe(200);
  await live.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  const livePage = await live.newPage();
  livePage.on("pageerror", (error) => report.errors.push(error.message));
  await livePage.goto(base + "/me/outputs");
  await expect(
    livePage
      .locator(".ant-empty-description")
      .getByText("暂无数据", { exact: true }),
  ).toBeVisible();
  await expect(livePage.getByText("cleaned.csv", { exact: true })).toHaveCount(
    0,
  );
  let fail = true;
  await live.route("**/api/v1/outputs?*", async (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: { message: "验证用暂时不可用" } },
        })
      : route.continue(),
  );
  await livePage.reload();
  await expect(
    livePage.getByText("产物列表暂时无法加载", { exact: true }),
  ).toBeVisible();
  fail = false;
  await livePage.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    livePage
      .locator(".ant-empty-description")
      .getByText("暂无数据", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "live output lists read the real empty API response, keep preview records isolated and recover from a failed request through retry",
  );
  const record = {
    id: "00000000-0000-4000-8000-000000000001",
    revision: "1",
    kind: "file",
    title: "阶段产物",
    file_name: "partial.csv",
    media_type: "text/csv",
    size_bytes: "9223372036854775807",
    status: "READY",
    availability: "READY",
    created_at: "2026-11-13T02:00:00Z",
    updated_at: "2026-11-13T02:00:00Z",
    expires_at: "2026-11-30T00:00:00Z",
    failure_code: null,
    batch_id: "00000000-0000-4000-8000-000000000002",
    batch_key: "second",
    phase: "OUTPUT_HOOK",
    run_id: "00000000-0000-4000-8000-000000000003",
    run_status: "RUNNING",
    task_name: "持续脚本",
    content_access_configured: false,
    deliveries: [
      {
        id: "delivery-1",
        status: "UNKNOWN",
        attempt_count: "2",
        next_attempt_at: null,
      },
    ],
  };
  await live.unroute("**/api/v1/outputs?*");
  let fixtureRecords = [record];
  const groupedRequests = [];
  await live.route("**/api/v1/outputs?*", (route) => {
    const search = new URL(route.request().url()).searchParams;
    const grouped = search.get("kinds");
    if (grouped) groupedRequests.push(grouped);
    const kinds = (grouped || search.get("kind") || "").split(",");
    const matching = fixtureRecords.filter((item) => kinds.includes(item.kind));
    const start = search.has("cursor") ? 1 : 0;
    const paged = grouped ? matching.slice(start, start + 1) : matching;
    return route.fulfill({
      json: {
        data: paged,
        next_cursor:
          grouped && matching.length > start + 1 ? "next-text-page" : null,
        request_id: "verification",
      },
    });
  });
  await livePage.reload();
  const row = livePage
    .locator(".outputs-panel .ant-table-tbody tr")
    .filter({ hasText: "partial.csv" });
  await expect(row).toContainText("产物已就绪");
  await expect(row).toContainText("回执未知");
  await expect(row.getByRole("button", { name: /下载/ })).toBeDisabled();
  await expect(row.getByRole("link")).toHaveAttribute(
    "href",
    `/me/runs/${record.run_id}`,
  );
  await expect(row).toContainText("8589934591.99 GB");
  report.checks.push(
    "live metadata preserves exact large sizes and independent READY output and UNKNOWN delivery states while unavailable content and delivery adapters stay visibly pending",
  );
  fixtureRecords = [
    {
      ...record,
      id: "00000000-0000-4000-8000-000000000004",
      kind: "message",
      file_name: null,
      title: "运行消息",
    },
    {
      ...record,
      id: "00000000-0000-4000-8000-000000000005",
      kind: "text",
      file_name: null,
      title: "输出说明",
      deliveries: [],
    },
  ];
  await livePage.getByRole("tab", { name: "文本", exact: true }).click();
  await expect(livePage.locator(".output-inline-metadata")).toContainText(
    "消息",
  );
  await expect(livePage.locator(".output-inline-metadata")).toContainText(
    "回执未知",
  );
  await livePage.getByRole("button", { name: "加载更多", exact: true }).click();
  await livePage.getByLabel("选择产物", { exact: true }).click();
  await livePage
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: "输出说明" })
    .click();
  await expect(livePage.locator(".output-inline-metadata")).toContainText(
    "文本",
  );
  await expect(livePage.locator(".output-inline-metadata")).toContainText(
    "未触发",
  );
  assert(
    groupedRequests.length >= 2 &&
      groupedRequests.every((value) => value === "text,message"),
  );
  await expect(
    livePage
      .locator(".outputs-toolbar")
      .getByRole("button", { name: "下载", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "production text pages query and paginate both text and message metadata, retain selection and show independent delivery status",
  );
  fixtureRecords = [
    ["guide.pdf", "application/pdf"],
    [
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "book.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ["image.png", "image/png"],
    ["bundle.zip", "application/zip"],
    [
      '<img src=x onerror="window.metadataExecuted=true">.bin',
      "application/octet-stream",
    ],
  ].map(([name, type], index) => ({
    ...record,
    id: `00000000-0000-4000-8000-00000000001${index}`,
    file_name: name,
    media_type: type,
  }));
  await livePage.goto(base + "/me/outputs?kind=files");
  for (const icon of [
    "file-pdf",
    "file-word",
    "file-excel",
    "file-image",
    "file-zip",
    "file-text",
  ])
    await expect(
      livePage.locator(`.outputs-panel svg[data-icon="${icon}"]`),
    ).toHaveCount(1);
  await expect(livePage.locator(".outputs-panel img")).toHaveCount(0);
  assert.equal(
    await livePage.evaluate(() => window.metadataExecuted),
    undefined,
  );
  report.checks.push(
    "production file metadata uses appropriate PDF, Word, spreadsheet, image, archive and generic file icons and escapes file names",
  );
  await livePage.goto(base + "/me/pending");
  await expect(livePage.getByText("待处理事项服务待接入，事项与状态暂不可用。", { exact: true })).toBeVisible();
  await expect(livePage.locator(".pending-action-card")).toHaveCount(0);
  await expect(livePage.getByRole("tab", { name: "全部（—）", exact: true })).toBeVisible();
  report.checks.push("production pending pages show unavailable counters and integration feedback without example records in live mode");
  await live.close();
  await page.goto(base + "/me/pending");
  await expect(page.locator(".pending-action-card")).toHaveCount(2);
  await capture("USER-C13");
  await page.getByRole("tab", { name: "待核验（1）", exact: true }).click();
  await expect(page.locator(".pending-action-card")).toHaveCount(1);
  await page.getByRole("button", { name: "核验原预约", exact: true }).click();
  await expect(page).toHaveURL(/dialog=verify/);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("2026-11-15");
  await expect(page.getByRole("dialog")).not.toContainText("2026-11-20");
  await page.getByRole("button", { name: "再次核验", exact: true }).click();
  await expect(
    page.getByText("官方核验通道尚未配置，原预约保持待核验状态", {
      exact: true,
    }),
  ).toBeVisible();
  report.checks.push(
    "output and pending reference layouts fit the target viewport, and pending filtering and original-booking verification preserve the unresolved result",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/me/outputs",
    "/me/outputs?kind=text&output=result-message",
    "/me/pending",
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
      route,
    );
  }
  report.checks.push(
    "message and file outputs plus pending items fit a 390px viewport, and the booking dialog restores its own snapshot through the URL",
  );
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
  await server.close();
  await sourceServer?.close();
  await application.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
