import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

loadEnvFile(path.resolve(process.argv[2] || ".env"));
const output = path.resolve("output/verification/role-layouts");
const referenceRoot = path.resolve(
  "output/prototypes/2026-11-13-v5-commercial",
);
const manifest = JSON.parse(
  await readFile(path.join(referenceRoot, "manifest.json"), "utf8"),
);
const catalog = JSON.parse(
  await readFile("docs/contracts/ui-role-catalog.json", "utf8"),
);
const localRoot = path.resolve(".local");
const temporaryData = path.join(localRoot, "role-layouts-" + randomUUID());
assert.equal(path.dirname(temporaryData), localRoot);
const environmentKeys = [
  "DATABASE_URL",
  "LOCAL_DATA_DIRECTORY",
  "DEV_SEED",
  "NODE_ENV",
  "WEB_ORIGIN",
];
const previous = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);
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
  data_source: "isolated development seed",
  viewport_source: "individual reference manifest dimensions",
  visual_acceptance: "pending",
  checks: [],
  screenshots: [],
  items: [],
  errors: [],
};
let app, server, browser, page;
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function dimensions(page) {
  return page.locator(".main-content").evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scroll_width: element.scrollWidth,
    document_width: document.documentElement.scrollWidth,
    document_height: document.documentElement.scrollHeight,
    headings: [...element.querySelectorAll("h1,h2")].map(
      (heading) => heading.textContent,
    ),
    empty_states: [
      ...element.querySelectorAll(".ant-empty-description,.ant-result-title"),
    ].map((item) => item.textContent),
  }));
}
async function ready(page, role, id) {
  await expect(
    page.locator(`.app-shell.role-${role}.page-${id}`),
  ).toBeVisible();
  await expect(page.locator(".main-content .ant-skeleton")).toHaveCount(0);
  await expect(page.locator(".main-content h1").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
  });
}
async function capture(name, fullPage = false) {
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage,
    animations: "disabled",
  });
  report.screenshots.push(name);
}

function comparisonDocument() {
  const entries = JSON.stringify(report.items).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
  <meta charset="utf-8" /><meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  />
  <title>Script Tools 原型对照</title>
  <style>
    body {
      margin: 0;
      background: #f1f4fa;
      color: #172137;
      font:
        14px "Microsoft YaHei",
        sans-serif;
    }
    header {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      padding: 16px;
      background: #fff;
      border-bottom: 1px solid #dce3ef;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 {
      font-size: 18px;
      margin: 0;
    }
    select,
    button {
      padding: 7px;
      border: 1px solid #dce3ef;
      border-radius: 5px;
      background: white;
    }
    label {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    main {
      padding: 16px;
    }
    .images {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    figure {
      margin: 0;
      min-width: 0;
    }
    figcaption {
      padding: 10px;
      background: #fff;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      background: #fff;
    }
    .overlay {
      position: relative;
      display: block;
    }
    .overlay figure + figure {
      position: absolute;
      inset: 0;
    }
    .overlay figcaption {
      visibility: hidden;
    }
    .overlay figure:first-child figcaption {
      visibility: visible;
    }
    #metadata {
      margin: 0 0 12px;
      line-height: 1.8;
    }
    .pending {
      color: #996013;
    }
    a {
      color: #1555ff;
    }
    @media (max-width: 800px) {
      .images {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <header>
    <h1>Script Tools 原型对照</h1>
    <select id="role" aria-label="工作区">
      <option value="">全部工作区</option>
      <option>GUEST</option>
      <option>USER</option>
      <option>PUBLISHER</option>
      <option>ADMIN</option></select
    ><select id="page" aria-label="页面"></select
    ><button id="previous">上一页</button><button id="next">下一页</button
    ><label><input type="checkbox" id="overlay" />叠加显示</label
    ><label
      >实现图透明度<input
        type="range"
        id="opacity"
        min="0"
        max="100"
        value="50" /></label
    ><span class="pending">最终视觉验收待完成</span>
  </header>
  <main>
    <p id="metadata"></p>
    <div class="images" id="images">
      <figure>
        <figcaption>设计原型</figcaption>
        <img id="reference" alt="设计原型" />
      </figure>
      <figure>
        <figcaption>当前实现</figcaption>
        <img id="implementation" alt="当前实现" />
      </figure>
    </div>
  </main>
  <script>
    const entries = ${entries};
    const role = document.querySelector("#role"),
      select = document.querySelector("#page"),
      images = document.querySelector("#images"),
      overlay = document.querySelector("#overlay"),
      opacity = document.querySelector("#opacity");
    function update() {
      const item = entries.find((item) => item.key === select.value);
      if (!item) return;
      document.querySelector("#reference").src =
        "../../prototypes/2026-11-13-v5-commercial/" + item.reference_file;
      document.querySelector("#implementation").src = item.key + ".png";
      document.querySelector("#metadata").textContent =
        item.key +
        " · " +
        item.title +
        " · " +
        item.viewport.width +
        " × " +
        item.viewport.height +
        " · " +
        item.route +
        " · 文档高度 " +
        item.layout.document_height +
        "px · 最终视觉验收待完成";
      history.replaceState(null, "", "#" + item.key);
    }
    function filter() {
      const previous = select.value;
      select.replaceChildren(
        ...entries
          .filter((item) => !role.value || item.role === role.value)
          .map((item) => {
            const option = document.createElement("option");
            option.value = item.key;
            option.textContent = item.key + " " + item.title;
            return option;
          }),
      );
      if ([...select.options].some((option) => option.value === previous))
        select.value = previous;
      update();
    }
    function layer() {
      images.classList.toggle("overlay", overlay.checked);
      images.lastElementChild.style.opacity = overlay.checked
        ? opacity.value / 100
        : 1;
    }
    role.onchange = filter;
    select.onchange = update;
    overlay.onchange = layer;
    opacity.oninput = layer;
    document.querySelector("#previous").onclick = () => {
      select.selectedIndex = Math.max(0, select.selectedIndex - 1);
      update();
    };
    document.querySelector("#next").onclick = () => {
      select.selectedIndex = Math.min(
        select.options.length - 1,
        select.selectedIndex + 1,
      );
      update();
    };
    const selected = location.hash.slice(1);
    filter();
    if (entries.some((item) => item.key === selected)) {
      select.value = selected;
      update();
    }
  </script>
</html>
`;
}

try {
  await mkdir(output, { recursive: true });
  report.build_sha256 = sha256(await readFile("apps/web/dist/index.html"));
  report.source_sha256 = {};
  report.source_hash_normalization = "LF";
  for (const file of [
    "apps/web/src/pages/PublisherHome.tsx",
    "apps/web/src/pages/AdminHome.tsx",
    "apps/web/src/components/Shell.tsx",
    "apps/web/src/components/ui.tsx",
    "apps/web/src/styles/dashboards.css",
    "apps/web/src/main.tsx",
    "apps/web/src/pages/ScriptEditor.tsx",
    "apps/web/src/pages/PublisherScripts.tsx",
    "apps/web/src/pages/PublisherProducts.tsx",
    "apps/web/src/publisher-preview.tsx",
    "apps/web/src/styles/publisher-editors.css",
    "apps/web/src/lib/script-editor.ts",
    "apps/web/src/lib/schema-validator.ts",
    "apps/web/src/components/SchemaInput.tsx",
    "apps/web/src/styles/schema-input.css",
    "apps/web/src/styles/consumer.css",
    "apps/web/src/pages/Checkout.tsx",
    "apps/web/src/pages/ConfigureService.tsx",
  ]) {
    report.source_sha256[file] = sha256(
      (await readFile(file, "utf8")).replaceAll("\r\n", "\n"),
    );
  }
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
      strictPort: true,
      proxy: { "/api": { target: await app.getUrl() } },
    },
  });
  const base = "http://127.0.0.1:" + server.httpServer.address().port;
  process.env.WEB_ORIGIN = base;
  browser = await chromium.launch();
  for (const role of catalog.roles) {
    const context = await browser.newContext();
    if (role.id !== "GUEST") {
      const email =
        { USER: "consumer", PUBLISHER: "publisher", ADMIN: "admin" }[role.id] +
        "@example.invalid";
      const response = await context.request.post(base + "/api/v1/auth/login", {
        data: { email, password: "TravelTools2026!" },
      });
      assert.equal(response.status(), 200);
    }
    page = await context.newPage();
    page.on("pageerror", (error) =>
      report.errors.push({
        route: new URL(page.url()).pathname,
        message: error.message,
      }),
    );
    for (const id of role.pages) {
      const key = `${role.id}-${id}`;
      const reference = manifest.items[key];
      assert(reference, `Missing reference ${key}`);
      const referenceBytes = await readFile(
        path.join(referenceRoot, reference.file),
      );
      assert.equal(sha256(referenceBytes), reference.sha256);
      await page.setViewportSize({
        width: reference.width,
        height: reference.height,
      });
      let route = catalog.pages[id].route.replace(/:\w+/g, "demo");
      if (
        ["C21", "P06"].includes(id) &&
        ["PUBLISHER", "ADMIN"].includes(role.id)
      )
        route += "?workspace=" + role.id;
      await page.goto(base + route);
      await ready(page, role.id, id);
      await capture(key);
      const bytes = await readFile(path.join(output, key + ".png"));
      assert.equal(bytes.readUInt32BE(16), reference.width);
      assert.equal(bytes.readUInt32BE(20), reference.height);
      const layout = await dimensions(page);
      assert(
        layout.document_width <= reference.width &&
          layout.scroll_width <= layout.width + 1,
        JSON.stringify({ key, layout }),
      );
      assert(
        !layout.empty_states.some((text) =>
          /不存在|未找到|无权限|失效/.test(text),
        ),
        JSON.stringify({ key, empty_states: layout.empty_states }),
      );
      report.items.push({
        key,
        role: role.id,
        page_id: id,
        title: reference.page_name,
        route,
        reference_file: reference.file,
        reference_sha256: reference.sha256,
        screenshot_sha256: sha256(bytes),
        viewport: { width: reference.width, height: reference.height },
        layout,
        visual_acceptance: "pending",
      });
      report.checks.push(
        `${key} renders its authorized role route at the reference viewport`,
      );
      console.log(key + " captured");
    }
    if (role.id === "PUBLISHER" || role.id === "ADMIN") {
      const publisher = role.id === "PUBLISHER";
      const route = publisher ? "/publisher" : "/admin";
      const id = publisher ? "S01" : "O01";
      await page.goto(base + route);
      await ready(page, role.id, id);
      if (publisher) {
        await expect(page.locator(".publisher-stats em")).toHaveText([
          "↑ 1",
          "↑ +3",
        ]);
        await expect(page.locator(".publisher-income-row em")).toHaveText(
          "↑ +18%",
        );
        await page.getByRole("tab", { name: "已下架(1)", exact: true }).click();
        await expect(
          page.locator(".publisher-services .ant-table-row"),
        ).toHaveCount(1);
        await expect(
          page.locator(".publisher-services .ant-table-row"),
        ).toContainText("无结果不退款");
        await page
          .getByRole("textbox", { name: "搜索工作台服务" })
          .fill("不存在");
        await expect(
          page.locator(".publisher-services .ant-table-row"),
        ).toHaveCount(0);
        await page.reload();
        await ready(page, role.id, id);
        await expect(
          page.getByRole("textbox", { name: "搜索工作台服务" }),
        ).toHaveValue("不存在");
        assert.equal(new URL(page.url()).searchParams.get("status"), "已下架");
        await page.goto(base + route);
        await ready(page, role.id, id);
        await page.keyboard.press("Control+k");
        await expect(page.locator(".global-search input")).toBeFocused();
        report.checks.push(
          "Publisher dashboard filter state survives reload, fixture policy matches the reference, and Ctrl+K focuses search",
        );
      } else {
        await expect(
          page.getByRole("img", { name: "最近七天交易额，11月13日 ¥860" }),
        ).toBeVisible();
        for (const [metric, amount] of [
          ["退款额", "80"],
          ["净收益", "780"],
        ]) {
          await page.getByRole("button", { name: metric, exact: true }).click();
          await expect(
            page.getByRole("button", { name: metric, exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await expect(page.locator(".dashboard-chart-value text")).toHaveText(
            "¥" + amount,
          );
          await page.reload();
          await ready(page, role.id, id);
          assert.equal(new URL(page.url()).searchParams.get("metric"), metric);
          await expect(
            page.getByRole("img", {
              name: `最近七天${metric}，11月13日 ¥${amount}`,
            }),
          ).toBeVisible();
        }
        await expect(page.locator(".technical-metrics")).toContainText(
          "使用 1,280 次（53.3%）",
        );
        await expect(
          page.locator(".technical-metrics .ant-progress"),
        ).toHaveAttribute("aria-valuenow", "53.3");
        await expect(
          page.locator(
            ".admin-bottom-grid > .panel:last-child .ant-table-row td:last-child",
          ),
        ).toHaveText(["99.8%", "99.6%", "99.5%", "98.9%"]);
        report.checks.push(
          "Admin chart metrics retain selection and coherent end values, and runtime capacity and availability preserve reference detail",
        );
      }
      await page.goto(base + route);
      await ready(page, role.id, id);
      const layout = await page
        .locator(publisher ? ".publisher-columns" : ".admin-bottom-grid")
        .evaluate((element) => ({
          bottom: element.getBoundingClientRect().bottom,
          viewport: innerHeight,
        }));
      assert(
        layout.bottom <= layout.viewport,
        JSON.stringify({ role: role.id, ...layout }),
      );
      report.checks.push(
        role.id + " dashboard fits the reference desktop height",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".workspace-button")).toHaveCSS(
        "font-size",
        "0px",
      );
      const mobile = await dimensions(page);
      assert(
        mobile.document_width <= 390 && mobile.scroll_width <= mobile.width + 1,
        JSON.stringify(mobile),
      );
      const header = await page.locator(".topbar").evaluate((element) => {
        const brand = element
          .querySelector(".brand strong")
          .getBoundingClientRect();
        const workspace = element
          .querySelector(".workspace-button")
          .getBoundingClientRect();
        const actions = element
          .querySelector(".topbar-actions")
          .getBoundingClientRect();
        return {
          brand_right: brand.right,
          workspace_left: workspace.left,
          actions_right: actions.right,
        };
      });
      assert(
        header.brand_right <= header.workspace_left &&
          header.actions_right <= 390,
        JSON.stringify(header),
      );
      if (!publisher) {
        const alerts = await page
          .locator(".admin-anomalies > a")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const row = element.getBoundingClientRect();
              return {
                top: row.top,
                bottom: row.bottom,
                right: row.right,
                text_width: element.querySelector("div").getBoundingClientRect()
                  .width,
              };
            }),
          );
        assert(
          alerts.every(
            (row, index) =>
              row.right <= 390 &&
              row.text_width >= 175 &&
              (index === 0 || row.top >= alerts[index - 1].bottom),
          ),
          JSON.stringify(alerts),
        );
        const chart = await page
          .locator(".line-chart svg")
          .evaluate((element) => {
            const bounds = element.parentElement.getBoundingClientRect();
            const label = element
              .querySelector(".dashboard-chart-value rect")
              .getBoundingClientRect();
            return { right: bounds.right, label_right: label.right };
          });
        assert(chart.label_right <= chart.right, JSON.stringify(chart));
      }
      await capture(role.id + "-" + id + "-mobile", true);
      report.checks.push(
        role.id + " dashboard uses internal table scrolling at 390px",
      );
      await context.route("**/api/v1/bootstrap", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.data_mode = "live";
        await route.fulfill({ response, json: body });
      });
      await page.goto(base + route);
      await ready(page, role.id, id);
      await expect(page.locator(".main-content")).not.toContainText("示例数据");
      await expect(
        page.locator(publisher ? ".publisher-stats" : ".admin-head-stats"),
      ).not.toContainText("¥");
      if (publisher) {
        await expect(
          page.locator(".publisher-services .ant-table-row"),
        ).toHaveCount(0);
        await expect(page.locator(".publisher-stats em")).toHaveCount(0);
      } else {
        await expect(page.locator(".admin-anomalies > a")).toHaveCount(0);
        await expect(page.locator(".dashboard-chart-value")).toHaveCount(0);
        await expect(page.locator(".availability-ring")).toHaveClass(
          /is-unavailable/,
        );
        await expect(
          page.locator(".technical-metrics .ant-progress"),
        ).toHaveCount(0);
        await expect(page.locator(".technical-metrics .positive")).toHaveCount(
          0,
        );
      }
      await capture(role.id + "-" + id + "-live-mobile", true);
      report.checks.push(
        role.id +
          " live dashboard exposes pending integrations with empty data and neutral indicators",
      );
    }
    await context.close();
  }
  assert.equal(report.items.length, manifest.total);
  await writeFile(path.join(output, "index.html"), comparisonDocument());
  page = await browser.newPage();
  page.on("pageerror", (error) =>
    report.errors.push({ route: "comparison viewer", message: error.message }),
  );
  await page.goto(
    pathToFileURL(path.join(output, "index.html")).href + "#ADMIN-O01",
  );
  await expect(page.locator("#page")).toHaveValue("ADMIN-O01");
  await page.locator("#role").selectOption("PUBLISHER");
  await expect(page.locator("#page option")).toHaveCount(18);
  await expect(page.locator("#page")).toHaveValue("PUBLISHER-S01");
  await page.locator("#reference").evaluate((image) => image.decode());
  await page.locator("#implementation").evaluate((image) => image.decode());
  await page.locator("#overlay").check();
  await expect(page.locator("#images")).toHaveClass(/overlay/);
  await page.locator("#opacity").press("Home");
  await page.locator("#opacity").press("ArrowRight");
  await expect(page.locator("#images > figure:last-child")).toHaveCSS(
    "opacity",
    "0.01",
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("#page")).toHaveValue("PUBLISHER-S02");
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(page.locator("#page")).toHaveValue("PUBLISHER-S01");
  report.checks.push(
    "The comparison viewer opens local reference and implementation images, supports deep links, role navigation and opacity overlays",
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
  await writeFile(path.join(output, "index.html"), comparisonDocument());
  console.log(
    JSON.stringify({
      result: report.result,
      pages: report.items.length,
      checks: report.checks.length,
      error: report.error,
    }),
  );
}
