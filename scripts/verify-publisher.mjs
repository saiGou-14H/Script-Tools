import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";

const output = path.resolve("output/verification/publisher-pages");
await mkdir(output, { recursive: true });
const root = path.resolve("apps/web");
let browser, context, server, application, page, base;
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
async function capture(id, route, title) {
  await page.goto(base + route);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, `${id}.png`),
    fullPage: true,
  });
  report.screenshots.push(id);
}
try {
  application = await startVerificationApp("publisher-regression");
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": { target: application.url } },
    },
  });
  base = "http://127.0.0.1:" + server.httpServer.address().port;
  process.env.WEB_ORIGIN = base;
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  await capture("PUBLISHER-S02", "/publisher/scripts", "我的脚本");
  await capture("PUBLISHER-S04", "/publisher/versions/demo", "版本与测试");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("sample.csv");
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  await page.getByRole("checkbox").uncheck();
  await expect(
    page.getByRole("button", { name: "自用启用", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "自用启用", exact: true }).click();
  await expect(page.getByText("自用调度接口尚未接通，未创建Run")).toBeVisible();
  report.checks.push(
    "version self-use form previews publisher-defined fields and requires explicit owner authorization",
  );
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "固定版本", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "影响", exact: true }).click();
  await expect(
    page.getByText(
      "发布新版本后，已有订单继续引用成交时固定的版本与价格快照。",
    ),
  ).toBeVisible();
  report.checks.push(
    "version, self-use and impact tabs switch without mixing published facts and new drafts",
  );

  await capture("PUBLISHER-S05", "/publisher/builds", "构建与测试记录");
  await page.getByRole("combobox", { name: "构建状态", exact: true }).click();
  await page
    .locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText("成功", { exact: true })
    .click();
  await page.getByRole("button", { name: "查询构建记录", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".build-detail")).toContainText("B031");
  await page.getByRole("tab", { name: "试运行记录", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(2);
  report.checks.push(
    "build filters and trial-run tabs update records and the matching selected detail",
  );

  await capture("PUBLISHER-S06", "/publisher/deployments", "部署管理");
  const failed = page
    .locator(".deployments-list .ant-table-tbody tr")
    .filter({ hasText: "文件处理" });
  await expect(
    failed.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await expect(
    failed.getByRole("button", { name: "重试", exact: true }),
  ).toBeEnabled();
  await failed.getByRole("button", { name: "详情", exact: true }).click();
  await expect(
    page
      .locator(".deployments-columns aside")
      .getByText("FAILED", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".deployment-log")).toContainText("部署等待修复");
  await page.getByRole("button", { name: "创建部署", exact: true }).click();
  await page.getByRole("combobox", { name: "运行模式", exact: true }).click();
  await page
    .locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText("QEMU TCG", { exact: true })
    .click();
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(page.getByText("请明确允许TCG执行")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "显式允许TCG执行", exact: true })
    .check();
  await page.getByRole("button", { name: "提交部署", exact: true }).click();
  await expect(
    page.getByText("部署接口尚未接通，配置已通过前端校验"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  report.checks.push(
    "deployment detail respects state-specific actions and requires explicit TCG opt-in",
  );

  await page
    .locator(".sidebar")
    .getByRole("link", { name: "我的脚本", exact: true })
    .click();
  await page.getByRole("button", { name: "新建脚本", exact: true }).click();
  await page.getByLabel("脚本名称", { exact: true }).fill("自定义分析工具");
  await page.getByRole("button", { name: "创建草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "脚本编辑", exact: true }),
  ).toBeVisible();
  const editorPath = new URL(page.url()).pathname;
  await page
    .getByRole("textbox", { name: "脚本代码", exact: true })
    .fill('def run(input):\n    return {"rows": 42}\n');
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "我的脚本", exact: true })
    .click();
  const custom = page
    .locator(".publisher-scripts-list .ant-table-tbody tr")
    .filter({ hasText: "自定义分析工具" });
  await expect(custom).toContainText("DRAFT");
  await custom.getByRole("link", { name: "编辑", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe(editorPath);
  await expect(
    page.getByRole("textbox", { name: "脚本代码", exact: true }),
  ).toContainText('"rows": 42');
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  await page
    .locator(".ant-tree-title")
    .getByText("manifest.json", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "脚本代码", exact: true })
    .fill('{"schema_version":"2.0","input_schema":false,"actions":{}}');
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验失败", { exact: true })).toBeVisible();
  report.checks.push(
    "arbitrary-purpose scripts create drafts, preserve edited files across routes and validate against manifest 2.0",
  );

  await page
    .locator(".sidebar")
    .getByRole("link", { name: "我的脚本", exact: true })
    .click();
  await page
    .locator(".publisher-script-toolbar input[type=file]")
    .setInputFiles({
      name: "custom_report.py",
      mimeType: "text/x-python",
      buffer: Buffer.from('def run(input):\n    return {"rows": 3}\n'),
    });
  await expect(
    page.getByRole("heading", { name: "脚本编辑", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "脚本代码", exact: true }),
  ).toContainText('"rows": 3');
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  report.checks.push(
    "local source-file upload opens the supplied content with a matching generated entrypoint",
  );
  for (const extension of ["js", "mjs", "cjs"]) {
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "我的脚本", exact: true })
      .click();
    const source =
      extension === "mjs"
        ? "export function run(input) { return { rows: 3 }; }\n"
        : "exports.run = (input) => ({ rows: 3 });\n";
    await page
      .locator(".publisher-script-toolbar input[type=file]")
      .setInputFiles({
        name: `custom_report.${extension}`,
        mimeType: "text/javascript",
        buffer: Buffer.from(source),
      });
    const code = page.getByRole("textbox", { name: "脚本代码", exact: true });
    await expect(code).toHaveValue(source);
    await expect(
      page
        .locator(".ant-tree-title")
        .getByText("requirements.txt", { exact: true }),
    ).toHaveCount(0);
    for (const filename of [
      "manifest.json",
      "package.json",
      "package-lock.json",
    ]) {
      await page
        .locator(".ant-tree-title")
        .getByText(filename, { exact: true })
        .click();
      const contents = JSON.parse(await code.inputValue());
      if (filename === "manifest.json") {
        expect(contents.language).toBe("nodejs");
        expect(contents.entrypoint).toBe(`custom_report.${extension}`);
        expect(contents.dependencies_lock).toBe("package-lock.json");
      } else if (filename === "package.json") {
        expect(contents.type).toBe(extension === "mjs" ? "module" : "commonjs");
      } else {
        expect(contents.lockfileVersion).toBe(3);
        expect(contents.packages[""]?.name).toBe(contents.name);
      }
    }
    await page.getByRole("button", { name: "校验", exact: true }).click();
    await expect(page.getByText("清单校验成功", { exact: true })).toBeVisible();
  }
  report.checks.push(
    "JavaScript, ES module and CommonJS uploads retain their source and generate matching Node.js manifests and dependency locks",
  );
  expect(report.errors).toEqual([]);
  report.checks.push(
    "publisher script and execution pages render without browser exceptions",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  await browser?.close();
  await server?.close();
  await application?.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
