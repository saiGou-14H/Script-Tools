import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { initialEditorFile } from "../apps/web/src/lib/script-editor.ts";

loadEnvFile(path.resolve(process.argv[2] || ".env"));
const output = path.resolve("output/verification/publisher-editor-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(localRoot, "publisher-editors-" + randomUUID());
assert.equal(path.dirname(temporaryData), localRoot);
const keys = [
  "DATABASE_URL",
  "LOCAL_DATA_DIRECTORY",
  "DEV_SEED",
  "NODE_ENV",
  "WEB_ORIGIN",
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
delete process.env.DATABASE_URL;
process.env.LOCAL_DATA_DIRECTORY = temporaryData;
process.env.DEV_SEED = "true";
process.env.NODE_ENV = "development";
const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const cookieParser = require("cookie-parser");
const { AppModule } = require("../apps/control-api/dist/app.module.js");
const {
  EnvelopeInterceptor,
  HttpErrorFilter,
} = require("../apps/control-api/dist/common/http.js");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: {},
  errors: [],
  visual_acceptance: "pending",
  data_source: "isolated development seed",
};
let app, server, browser, page;

async function ready() {
  await expect(page.locator(".main-content h1")).toBeVisible();
  await expect(page.locator(".main-content .ant-skeleton")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(name) {
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(name);
}
async function selectFile(name) {
  await page
    .locator(".ant-tree-title")
    .getByText(name, { exact: true })
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
  assert.equal(
    initialEditorFile({
      "manifest.json": '{"entrypoint":"nested/worker.mjs"}',
      "nested/worker.mjs": "",
    }),
    "nested/worker.mjs",
  );
  for (const manifest of [
    "{",
    "null",
    "false",
    '"main.py"',
    '{"entrypoint":"missing.py"}',
    '{"entrypoint":"toString"}',
  ]) {
    assert.equal(
      initialEditorFile({ "worker.py": "", "manifest.json": manifest }),
      "worker.py",
    );
  }
  assert.equal(initialEditorFile({}), "main.py");
  report.checks.push(
    "Editor entry selection honors an existing declared entrypoint and safely retains malformed or missing manifests",
  );
  await mkdir(output, { recursive: true });
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, "127.0.0.1");
  const root = path.resolve("apps/web");
  server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/api": { target: await app.getUrl() } },
    },
  });
  const base = "http://127.0.0.1:" + server.httpServer.address().port;
  process.env.WEB_ORIGIN = base;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1815, height: 867 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  assert.equal(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "publisher@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
    200,
  );
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base + "/publisher/scripts/demo/edit");
  await ready();
  await expect(page.getByText("草稿待校验", { exact: true })).toBeVisible();
  const code = page.getByRole("textbox", { name: "脚本代码", exact: true });
  const originalCode = await code.inputValue();
  await expect(code).toHaveAttribute("wrap", "off");
  await expect(page.locator(".code-highlight .keyword").first()).toHaveCSS(
    "color",
    "rgb(0, 0, 255)",
  );
  await expect(page.locator(".code-highlight .string").first()).toHaveCSS(
    "color",
    "rgb(208, 0, 0)",
  );
  await expect(page.locator(".code-highlight .number").first()).toHaveCSS(
    "color",
    "rgb(0, 128, 0)",
  );
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  const schema = page.getByRole("region", {
    name: "输入Schema预览",
    exact: true,
  });
  await expect(schema).toContainText('"source_file"');
  await expect(schema).toContainText('"deduplicate_by"');
  const editorLayout = await page
    .locator(".editor-layout")
    .evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      bottom: document
        .querySelector(".editor-validation")
        .getBoundingClientRect().bottom,
      viewport: innerHeight,
    }));
  assert.equal(editorLayout.height, 525);
  assert(
    editorLayout.bottom <= editorLayout.viewport,
    JSON.stringify(editorLayout),
  );
  report.layouts.S03 = editorLayout;
  const configBounds = await page
    .locator(".network-scope")
    .evaluate((element) => ({
      bottom: element.getBoundingClientRect().bottom,
      panelBottom: element.closest(".panel").getBoundingClientRect().bottom,
    }));
  assert(
    configBounds.bottom < configBounds.panelBottom,
    JSON.stringify(configBounds),
  );
  const schemaSize = await schema.evaluate((element) => ({
    client: element.clientHeight,
    scroll: element.scrollHeight,
  }));
  assert(schemaSize.scroll > schemaSize.client && schemaSize.client <= 40);
  await schema.focus();
  await schema.press("PageDown");
  await expect
    .poll(() => schema.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await schema.evaluate((element) => (element.scrollTop = 0));
  await page.locator(".editor-title h2").click();
  await capture("PUBLISHER-S03");
  report.checks.push(
    "Script panels and the validated status fit the reference viewport while complete publisher schemas remain keyboard-scrollable",
  );

  await page.getByRole("button", { name: "新建文件", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").fill("main.py");
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await expect(
    page.getByText("文件已存在，请使用其他文件名", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(code).toHaveValue(originalCode);
  await dialog.locator("input").fill("helper.py");
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const longCode = Array.from(
    { length: 160 },
    (_, index) => `# source line ${index + 1}`,
  ).join("\n");
  await code.fill(longCode);
  await code.press("Control+End");
  await expect
    .poll(async () => code.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      page.locator(".line-numbers").evaluate((element) => element.scrollTop),
    )
    .toBe(await code.evaluate((element) => element.scrollTop));
  await expect
    .poll(() =>
      page.locator(".code-highlight").evaluate((element) => element.scrollTop),
    )
    .toBe(await code.evaluate((element) => element.scrollTop));
  const literal =
    '# <img src=x onerror="window.sourceExecuted=true"> ' +
    "消息 long_column ".repeat(120);
  await code.fill(literal);
  await code.press("Control+End");
  await expect
    .poll(() => code.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator(".code-highlight").evaluate((element) => element.scrollLeft),
    )
    .toBe(await code.evaluate((element) => element.scrollLeft));
  await expect(code).toHaveValue(literal);
  await expect(page.locator(".code-highlight")).toContainText("<img src=x");
  await expect(page.locator(".code-highlight img")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.sourceExecuted), undefined);
  await code.fill(longCode);
  await selectFile("main.py");
  await expect(code).toHaveValue(originalCode);
  assert.equal(
    await page
      .locator(".line-numbers")
      .evaluate((element) => element.scrollTop),
    0,
  );
  report.checks.push(
    "New file creation preserves duplicate names and source content, and line numbers follow long-source scrolling and reset per file",
  );
  report.checks.push(
    "Editable syntax colors match the reference while vertical and horizontal highlights follow source scrolling and uploaded markup remains literal text",
  );

  async function closeTab(file) {
    await page
      .getByRole("tab", { name: file, exact: true })
      .locator("..")
      .getByRole("button", { name: "关闭文件页签", exact: true })
      .click();
  }
  await closeTab("helper.py");
  await expect(code).toHaveValue(originalCode);
  await closeTab("main.py");
  await expect(
    page.getByText("选择文件查看和编辑", { exact: true }),
  ).toBeVisible();
  await expect(code).toHaveCount(0);
  await selectFile("helper.py");
  await expect(code).toHaveValue(longCode);
  await selectFile("main.py");
  await expect(code).toHaveValue(originalCode);
  report.checks.push(
    "File tabs switch and close independently, closing the last tab preserves all source buffers and reopening restores unsaved file content",
  );

  await selectFile("manifest.json");
  const originalManifest = await code.inputValue();
  await code.fill("{broken");
  await choose("运行环境", "Node.js");
  await expect(
    page.getByText("清单JSON无效，请先在manifest.json中修正内容", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(code).toHaveValue("{broken");
  const partial = {
    ...JSON.parse(originalManifest),
    schema_version: "invalid",
    developer_extension: { retained: "custom" },
  };
  await code.fill(JSON.stringify(partial));
  await choose("运行环境", "Node.js");
  await expect
    .poll(async () => JSON.parse(await code.inputValue()).language)
    .toBe("nodejs");
  const updated = JSON.parse(await code.inputValue());
  assert.equal(updated.language, "nodejs");
  assert.deepEqual(updated.actions, partial.actions);
  assert.deepEqual(updated.input_schema, partial.input_schema);
  assert.deepEqual(updated.developer_extension, partial.developer_extension);
  await code.fill(originalManifest);
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, "", "/publisher/scripts/files/edit");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".editor-title h2")).toContainText("文件处理");
  assert.notEqual(await code.inputValue(), originalManifest);
  await expect(page.getByText("草稿待校验", { exact: true })).toBeVisible();
  report.checks.push(
    "Configuration edits preserve malformed JSON and unrelated manifest fields, and script route changes reset file and validation state",
  );

  await page.setViewportSize({ width: 1814, height: 867 });
  await page.goto(base + "/publisher/versions/demo");
  await ready();
  await expect(
    page.getByRole("heading", { name: "最近测试通过", exact: true }),
  ).toBeVisible();
  await page.locator(".ant-typography-copy").click();
  const digest = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert(digest.startsWith("a9f4c2e7b1d8"));
  const versionLayout = await page
    .locator(".version-self-columns")
    .evaluate((element) => ({
      bottom: element.getBoundingClientRect().bottom,
      viewport: innerHeight,
    }));
  assert(
    versionLayout.bottom <= versionLayout.viewport,
    JSON.stringify(versionLayout),
  );
  report.layouts.S04 = versionLayout;
  await capture("PUBLISHER-S04");
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "version");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "固定版本", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "本人自用", exact: true }).click();
  const source = page.getByRole("textbox", { name: /输入文件/ });
  await source.fill("");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(
    page.locator(".ant-form-item-explain-error").first(),
  ).toBeVisible();
  await source.fill("custom.csv");
  await page.getByRole("radio", { name: "指定时间", exact: true }).check();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(
    page.getByText("请选择未来的执行时间", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "立即执行", exact: true }).check();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("custom.csv");
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  await page.getByRole("checkbox").uncheck();
  await expect(
    page.getByRole("button", { name: "自用启用", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    history.pushState(null, "", "/publisher/versions/booking?tab=self");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".version-banner")).toContainText("景点预约");
  await expect(
    page.getByRole("heading", { name: "最近测试通过", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("当前版本尚无已通过的测试记录。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ant-typography-copy")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /输入文件/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".version-self-columns")).not.toContainText(
    "custom.csv",
  );
  report.checks.push(
    "Version tabs retain URL state, copies contain a full digest, RJSF and scheduling validate inputs, and different versions retain their own evidence and form state",
  );

  await page.setViewportSize({ width: 1813, height: 868 });
  await page.goto(base + "/publisher/services/demo/edit");
  await ready();
  await expect(page.locator("#title")).toHaveAttribute("maxlength", "200");
  await expect(page.locator("#description")).toHaveAttribute(
    "maxlength",
    "10000",
  );
  await expect(
    page.getByRole("region", { name: "发布参数预览", exact: true }),
  ).toContainText("输入文件");
  await expect(
    page.getByRole("region", { name: "发布参数预览", exact: true }),
  ).not.toContainText("CSV / 最大10MB");
  const counts = await page
    .locator(".ant-input-textarea-show-count")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        const count = element
          .querySelector(".ant-input-data-count")
          .getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          count_bottom: count.bottom,
          right: bounds.right,
          count_right: count.right,
        };
      }),
    );
  assert(
    counts.every(
      (item) =>
        item.count_bottom <= item.bottom && item.count_right <= item.right,
    ),
    JSON.stringify(counts),
  );
  await capture("PUBLISHER-S08");
  report.checks.push(
    "Product fields retain contract length limits and publisher-defined parameters, with counters contained inside their textareas",
  );

  for (const [id, route, selector] of [
    ["S03", "/publisher/scripts/demo/edit", ".editor-layout"],
    ["S04", "/publisher/versions/demo", ".version-self-columns"],
    ["S08", "/publisher/services/demo/edit", ".product-editor-columns"],
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + route);
    await ready();
    await expect(page.locator(".workspace-button")).toHaveCSS(
      "font-size",
      "0px",
    );
    const layout = await page.locator(selector).evaluate((element) => {
      const main = document.querySelector(".main-content");
      const brand = document
        .querySelector(".brand strong")
        .getBoundingClientRect();
      const workspace = document
        .querySelector(".workspace-button")
        .getBoundingClientRect();
      return {
        width: document.documentElement.scrollWidth,
        main_width: main.clientWidth,
        main_scroll: main.scrollWidth,
        region_width: element.clientWidth,
        region_scroll: element.scrollWidth,
        brand_right: brand.right,
        workspace_left: workspace.left,
        workspace_right: workspace.right,
      };
    });
    assert(
      layout.width <= 390 &&
        layout.main_scroll <= layout.main_width &&
        layout.region_scroll <= layout.region_width + 1 &&
        layout.brand_right <= layout.workspace_left &&
        layout.workspace_right <= 390,
      JSON.stringify({ id, ...layout }),
    );
    report.layouts[id + "-mobile"] = layout;
    await capture("PUBLISHER-" + id + "-mobile");
  }
  report.checks.push(
    "Editor, version and product pages keep their forms, source panels and workspace controls within 390px",
  );
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  for (const [id, route] of [
    ["S03", "/publisher/scripts/demo/edit"],
    ["S04", "/publisher/versions/demo"],
    ["S08", "/publisher/services/demo/edit"],
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".main-content .ant-empty")).toBeVisible();
    await expect(page.locator(".main-content")).toContainText(
      /待接入|不存在或已失效/,
    );
    await expect(page.locator(".main-content")).not.toContainText("1200");
    await capture("PUBLISHER-" + id + "-live-mobile");
  }
  report.checks.push(
    "Live editor and version routes expose unavailable metadata without substituting prototype source, build or test results",
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
  await browser?.close();
  await server?.close();
  await app?.close();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  assert.equal(path.dirname(path.resolve(temporaryData)), localRoot);
  await rm(temporaryData, { recursive: true, force: true });
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      result: report.result,
      checks: report.checks.length,
      error: report.error,
    }),
  );
}
