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
  layouts: {},
  visual_acceptance: "pending",
};
const homeWidths = [
  ...new Set([
    ...Array.from({ length: 41 }, (_, index) => 390 + index * 37),
    700,
    701,
    900,
    901,
    1000,
    1001,
    1300,
    1301,
    1450,
    1451,
    1700,
    1701,
    1814,
    1870,
  ]),
].sort((a, b) => a - b);
async function homeLayout(target) {
  return target.evaluate(() => {
    const rect = (selector) =>
      document.querySelector(selector).getBoundingClientRect();
    const brand = rect(".brand"),
      actions = rect(".topbar-actions"),
      search = rect(".global-search");
    const art = rect(".publisher-hero-art");
    const heroOverlap =
      art.width > 0 &&
      [".publisher-banner h1", ".publisher-banner p"].some((selector) => {
        const content = rect(selector);
        return (
          content.right > art.left &&
          content.top < art.bottom &&
          content.bottom > art.top
        );
      });
    const selectors = [
      ".publisher-banner",
      ".publisher-banner h1",
      ".publisher-banner p",
      ".publisher-stats",
      ".publisher-stats > div",
      ".publisher-workflow > a > div",
      ".publisher-service-controls",
      ".publisher-alert",
      ".publisher-alert > div",
      ".publisher-refund",
      ".publisher-refund > div",
      ".publisher-income",
      ".publisher-income > div",
      ".publisher-income-row",
      ".panel-heading",
    ];
    return {
      width: innerWidth,
      document_width: document.documentElement.scrollWidth,
      hero_overlap: heroOverlap,
      header_overlap: brand.right > actions.left,
      search_overlap:
        search.width > 0 &&
        (brand.right > search.left || search.right > actions.left),
      clipped: [...document.querySelectorAll(selectors.join(","))]
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.className),
    };
  });
}
async function checkHomeWidths(target, name) {
  report.layouts[name] = [];
  for (const width of homeWidths) {
    await target.setViewportSize({ width, height: 868 });
    const layout = await homeLayout(target);
    expect(layout.document_width).toBe(width);
    expect(layout.header_overlap).toBe(false);
    expect(layout.hero_overlap).toBe(false);
    expect(layout.search_overlap).toBe(false);
    expect(layout.clipped, JSON.stringify(layout)).toEqual([]);
    report.layouts[name].push(layout);
  }
  await target.setViewportSize({ width: 1814, height: 868 });
}
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
  await capture("PUBLISHER-S01", "/publisher", "发布者工作台");
  const referenceRegions = {
    ".publisher-banner": { x: 221, y: 134, width: 1120, height: 132 },
    ".publisher-stats": { x: 221, y: 282, width: 1120, height: 77 },
    ".publisher-workflow-panel": { x: 221, y: 371, width: 1122, height: 130 },
    ".publisher-services": { x: 221, y: 517, width: 1124, height: 342 },
    ".publisher-alerts-panel": { x: 1357, y: 134, width: 445, height: 169 },
    ".publisher-refunds-panel": { x: 1357, y: 319, width: 445, height: 207 },
    ".publisher-income-panel": { x: 1357, y: 541, width: 445, height: 310 },
  };
  const actual = await page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [
            selector,
            { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ];
        }),
      ),
    Object.keys(referenceRegions),
  );
  for (const [selector, fields] of Object.entries(referenceRegions)) {
    for (const [axis, value] of Object.entries(fields)) {
      expect(
        Math.abs(actual[selector][axis] - value),
        selector + " " + axis,
      ).toBeLessThanOrEqual(3);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    868,
  );
  const expectedNavigation = [
    117, 191.5, 225, 258, 328, 360.5, 393, 462.5, 495, 563, 595.5, 662, 726.5,
    790,
  ];
  const actualNavigation = await page
    .locator(".sidebar nav .nav-item")
    .evaluateAll((links) =>
      links.map((link) => {
        const bounds = link.getBoundingClientRect();
        return {
          title: link.textContent,
          center_y: bounds.y + bounds.height / 2,
        };
      }),
    );
  expect(actualNavigation).toHaveLength(expectedNavigation.length);
  actualNavigation.forEach((item, index) =>
    expect(
      Math.abs(item.center_y - expectedNavigation[index]),
      item.title,
    ).toBeLessThanOrEqual(3),
  );
  report.layouts.home_navigation_reference = {
    tolerance_px: 3,
    expected_center_y: expectedNavigation,
    actual: actualNavigation,
  };
  report.layouts.home_reference = {
    tolerance_px: 3,
    expected: referenceRegions,
    actual,
  };
  report.checks.push(
    "publisher home calibrates seven principal regions against the reference within three pixels and retains its explicitly labeled six-service development data",
  );
  await checkHomeWidths(page, "home_responsive");
  await page.setViewportSize({ width: 390, height: 868 });
  const table = page.locator(".publisher-services .ant-table-content");
  await table.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const action = await page
    .locator(".publisher-services .row-actions a")
    .first()
    .evaluate((link) => {
      const bounds = link.getBoundingClientRect(),
        viewport = link.closest(".ant-table-content").getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        start: viewport.left,
        end: viewport.right,
      };
    });
  expect(action.left).toBeGreaterThanOrEqual(action.start - 1);
  expect(action.right).toBeLessThanOrEqual(action.end + 1);
  await table.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.screenshot({
    path: path.join(output, "PUBLISHER-S01-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("PUBLISHER-S01-mobile");
  await page.setViewportSize({ width: 1814, height: 868 });
  report.checks.push(
    "publisher home keeps header controls separate, reflows workflow and summary regions and exposes table actions through internal scrolling across 54 distinct widths",
  );

  await page
    .getByRole("textbox", { name: "搜索工作台服务", exact: true })
    .fill("  航班  ");
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    1,
  );
  await page.getByRole("tab", { name: "在售(4)", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "搜索工作台服务", exact: true }),
  ).toHaveValue("  航班  ");
  await expect(
    page.getByRole("tab", { name: "在售(4)", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "已下架(1)", exact: true }).click();
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    0,
  );
  await page
    .locator(".publisher-service-controls .ant-input-clear-icon")
    .click();
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    1,
  );
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "在售(4)", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    1,
  );
  report.checks.push(
    "service name search, sale status, empty intersections, clear and browser history preserve their URL state and matching fixture rows through reload",
  );

  await page.goto(base + "/publisher");
  await expect(page.locator(".publisher-workflow > a")).toHaveCount(4);
  expect(
    await page
      .locator(".publisher-workflow > a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([
    "/publisher/scripts",
    "/publisher/builds",
    "/publisher/deployments",
    "/publisher/services",
  ]);
  await page.getByRole("button", { name: "上传脚本", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的脚本", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/publisher");
  await page
    .getByRole("button", { name: "创建服务", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "编辑与上架服务", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/publisher");
  await page.locator(".publisher-services .row-actions a").nth(1).click();
  await expect(
    page.getByRole("heading", { name: "部署管理", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "normal upload and creation buttons and prototype workflow and row controls reach their script, build, deployment and service management modules",
  );

  await page.goto(base + "/publisher");
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    6,
  );
  const longTitle = "发布者自定义脚本服务名称".repeat(12);
  const longText = "publisher-defined-source-name-".repeat(16);
  await page.evaluate(
    ({ longTitle, longText }) => {
      document.querySelector(".publisher-banner h1").textContent = longTitle;
      document.querySelector(".publisher-banner p").textContent = longText;
      document
        .querySelectorAll(".publisher-stats strong")
        .forEach((element) => {
          element.textContent = "9223372036854775807";
        });
      document
        .querySelectorAll(".publisher-workflow small")
        .forEach((element) => {
          element.textContent = longText;
        });
      document
        .querySelectorAll(".publisher-service-name b")
        .forEach((element) => {
          element.textContent = longTitle;
          element.title = longTitle;
        });
      document
        .querySelectorAll(
          ".publisher-services tbody .ant-table-row td:nth-child(2)",
        )
        .forEach((element) => {
          element.textContent = longText + ".py";
        });
      document.querySelectorAll(".publisher-alert b").forEach((element) => {
        element.textContent = longTitle;
      });
      document
        .querySelectorAll(".publisher-refund > div b")
        .forEach((element) => {
          element.textContent = longText;
        });
      document
        .querySelectorAll(
          ".publisher-refund > b,.publisher-income strong,.publisher-income-row > b",
        )
        .forEach((element) => {
          element.textContent = "¥92233720368547758.07";
        });
    },
    { longTitle, longText },
  );
  await checkHomeWidths(page, "home_dom_long_content");
  await page.screenshot({
    path: path.join(output, "PUBLISHER-S01-long-content.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("PUBLISHER-S01-long-content");
  report.checks.push(
    "controlled DOM layout stress keeps long names, filenames, descriptions and signed-64-bit numeric text visible across the same 54 widths without asserting a live overview API",
  );

  const liveContext = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await liveContext.request.post(base + "/api/v1/auth/login", {
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
  });
  await liveContext.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  const livePage = await liveContext.newPage();
  livePage.on("pageerror", (error) => report.errors.push(error.message));
  await livePage.goto(base + "/publisher");
  await expect(
    livePage.locator(".publisher-services .ant-table-row"),
  ).toHaveCount(4);
  await expect(
    livePage.getByText("暂无登记异常部署", { exact: true }),
  ).toBeVisible();
  await expect(
    livePage.getByText("统计期内暂无退款记录", { exact: true }),
  ).toBeVisible();
  await expect(livePage.locator(".publisher-stats strong")).toHaveText([
    "4",
    "0",
    "¥0.00",
    "0",
  ]);
  await expect(livePage.getByText("本地开发示例", { exact: true })).toHaveCount(
    0,
  );
  await checkHomeWidths(livePage, "home_live");
  await liveContext.close();
  report.checks.push(
    "live publisher home renders owner-scoped API service rows, explicit registered deployment state and exact zero balances across 54 widths",
  );

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
