import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";

const output = path.resolve("output/verification/shared-pages");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
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
if (!address || typeof address !== "object")
  throw new Error("Preview address is unavailable");
const base = `http://127.0.0.1:${address.port}`;
const restoredWorkspaces = [];
async function homeLayout(page) {
  return page.evaluate(() => {
    const brand = document.querySelector(".brand").getBoundingClientRect();
    const actions = document
      .querySelector(".topbar-actions")
      .getBoundingClientRect();
    const search = document
      .querySelector(".global-search")
      .getBoundingClientRect();
    const selectors = [
      ".home-service-banner",
      ".home-service-intro",
      ".home-service-benefits",
      ".home-recommendation",
      ".home-recommendation-title",
      ".home-recommendation-title h3",
      ".home-recommendation-price",
      ".home-recommendation footer",
      ".home-category-navigation",
      ".home-workflow",
      ".home-workflow h4",
      ".home-category-details > a",
      ".home-fee-note",
      ".home-payment-guide",
      ".home-publish-guide",
    ];
    return {
      width: document.documentElement.scrollWidth,
      clipped: [...document.querySelectorAll(selectors.join(","))]
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.className || element.tagName),
      header_overlap: brand.right > actions.left,
      search_overlap:
        search.width > 0 &&
        (search.left < brand.right || search.right > actions.left),
    };
  });
}
async function verifyPublicHome(context, page) {
  await page.setViewportSize({ width: 1813, height: 868 });
  const regions = [
    [".home-service-banner", { x: 250, y: 104, width: 1160, height: 156 }],
    [".home-recommendation-grid", { x: 250, y: 319, width: 1160, height: 179 }],
    [".home-discovery-row", { x: 250, y: 515, width: 1160, height: 136 }],
    [".home-category-details", { x: 250, y: 680, width: 1160, height: 166 }],
    [".home-fee-note", { x: 1427, y: 104, width: 378, height: 134 }],
    [".home-payment-guide", { x: 1427, y: 252, width: 378, height: 247 }],
    [".home-publish-guide", { x: 1427, y: 516, width: 378, height: 275 }],
  ];
  report.homeReferenceRegions = [];
  for (const [selector, expected] of regions) {
    const actual = await page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    for (const coordinate of Object.keys(expected))
      assert(
        Math.abs(actual[coordinate] - expected[coordinate]) <= 3,
        JSON.stringify({ selector, expected, actual }),
      );
    report.homeReferenceRegions.push({
      selector,
      expected,
      actual,
      tolerance_px: 3,
    });
  }
  await page.screenshot({
    path: path.join(output, "GUEST-P01-reference.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("GUEST-P01-reference");
  const widths = [
    ...new Set([
      700,
      701,
      1000,
      1001,
      1100,
      1101,
      1200,
      1201,
      1450,
      1451,
      1700,
      1701,
      1800,
      1801,
      ...Array.from({ length: 41 }, (_, index) => 390 + index * 37),
    ]),
  ];
  report.homeResponsive = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 700 ? 844 : 900 });
    const state = await homeLayout(page);
    assert(
      state.width <= width &&
        state.clipped.length === 0 &&
        !state.header_overlap &&
        !state.search_overlap,
      JSON.stringify({ width, ...state }),
    );
    report.homeResponsive.push({ viewport_width: width, ...state });
    if (width === 390) {
      await page.screenshot({
        path: path.join(output, "GUEST-P01-mobile.png"),
        fullPage: true,
        animations: "disabled",
      });
      report.screenshots.push("GUEST-P01-mobile");
    }
  }
  report.checks.push(
    `Public home follows seven reference regions and keeps its content and header unclipped across ${widths.length} widths and breakpoint boundaries`,
  );

  await page.setViewportSize({ width: 1813, height: 868 });
  const response = await context.request.get(base + "/api/v1/services");
  expect(response.status()).toBe(200);
  const envelope = await response.json();
  const original = envelope.data;
  for (const travel of [false, true]) {
    const service = original.find(
      (item) => (item.scene_key === "travel") === travel,
    );
    const recommendation = page
      .locator(".home-recommendation")
      .filter({
        has: page.getByRole("heading", { name: service.title, exact: true }),
      });
    await recommendation.getByRole("link").click();
    expect(new URL(page.url()).pathname).toBe(
      `${travel ? "/travel/attractions/" : "/services/"}${service.id}`,
    );
    await expect(
      page.locator(
        travel ? ".travel-service-banner" : ".retail-service-banner",
      ),
    ).toBeVisible();
    await page.goto(base + "/");
    await expect(page.locator(".home-recommendation")).toHaveCount(4);
  }
  await page
    .locator(".topbar-actions")
    .getByRole("button", { name: "登录", exact: true })
    .click();
  expect(new URL(page.url()).pathname).toBe("/auth");
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/");
  await page
    .locator(".topbar-actions")
    .getByRole("button", { name: "注册", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("tab")).toBe("register");
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "Home general and travel recommendations retain their exact service identities, and login and registration open their corresponding authentication entries",
  );

  const samples = structuredClone(original);
  const long = samples.find((item) => item.delivery_policy.icon === "table");
  long.title = "自定义脚本".repeat(12);
  long.description = "payload_".repeat(50);
  long.amount_minor = "9223372036854775807";
  long.availability = {
    can_purchase: false,
    reason: "controlled unavailable service",
  };
  const legacy = samples.find((item) => item.delivery_policy.icon === "file");
  delete legacy.availability;
  legacy.deployment_status = "STOPPED";
  const explicit = samples.find(
    (item) => item.delivery_policy.icon === "database",
  );
  explicit.availability = { can_purchase: true, reason: null };
  explicit.deployment_status = "DEGRADED";
  samples.push({
    ...long,
    id: randomUUID(),
    title: "推荐之外的自定义服务",
    delivery_policy: { ...long.delivery_policy, icon: "__proto__" },
  });
  await context.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: samples } }),
  );
  await page.goto(base + "/");
  await expect(page.locator(".home-recommendation")).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "推荐之外的自定义服务", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".home-recommendation > p")
      .filter({ hasText: long.description }),
  ).toHaveText(long.description);
  await expect(
    page
      .locator(".home-recommendation-price")
      .filter({ hasText: "92233720368547758.07" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".home-recommendation footer .status-gray"),
  ).toHaveCount(2);
  await expect(
    page.locator(".home-recommendation footer .status-green"),
  ).toHaveCount(2);
  for (const width of [1813, 1701, 1201, 1101, 701, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const state = await homeLayout(page);
    assert(
      state.width <= width &&
        state.clipped.length === 0 &&
        !state.header_overlap &&
        !state.search_overlap,
      JSON.stringify({ width, long: true, ...state }),
    );
  }
  await page.screenshot({
    path: path.join(output, "GUEST-P01-long.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("GUEST-P01-long");
  await context.unroute("**/api/v1/services");
  report.checks.push(
    "Four home recommendations preserve complete long metadata and exact signed-64-bit prices, respect explicit purchase availability and legacy deployment fallback, and safely rank custom icon names",
  );

  let phase = "loading";
  await context.route("**/api/v1/services", async (route) => {
    if (phase === "loading")
      await new Promise((resolve) => setTimeout(resolve, 1000));
    if (phase === "error")
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "UNAVAILABLE",
            message: "controlled home catalog failure",
          },
        },
      });
    else
      await route.fulfill({
        json: { ...envelope, data: phase === "empty" ? [] : original },
      });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(".home-recommendations .ant-skeleton"),
  ).toBeVisible();
  await expect(page.locator(".home-recommendation")).toHaveCount(4);
  phase = "error";
  await page.reload();
  await expect(page.getByText("服务暂时无法加载", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  await expect(page.locator(".home-recommendation")).toHaveCount(0);
  phase = "empty";
  await page.getByRole("button", { name: "重试推荐服务", exact: true }).click();
  await expect(page.getByText("暂无可用服务", { exact: true })).toBeVisible();
  phase = "normal";
  await page.reload();
  await expect(page.locator(".home-recommendation")).toHaveCount(4);
  await context.unroute("**/api/v1/services");
  report.checks.push(
    "Home catalog loading, empty and failed reads expose their own feedback, and retry restores the returned recommendations",
  );
  await page.setViewportSize({ width: 1814, height: 868 });
}

try {
  for (const [role, email, routes] of [
    [
      "GUEST",
      null,
      [
        ["P01", "/", null],
        ["P03", "/services/demo", "服务介绍"],
        ["P04", "/travel", "城市与景点"],
        ["P05", "/travel/attractions/demo", "景点代抢服务详情"],
        ["P06", "/help", "使用帮助"],
      ],
    ],
    [
      "USER",
      "consumer@example.invalid",
      [
        ["P02", "/market", "脚本市场"],
        ["P03", "/services/demo", "服务介绍"],
        ["P05", "/travel/attractions/demo", "景点代抢服务详情"],
        ["C09", "/me/tasks/demo", "任务详情"],
      ],
    ],
    [
      "PUBLISHER",
      "publisher@example.invalid",
      [
        ["C21", "/me/settings/account?workspace=PUBLISHER", "账户设置"],
        ["P06", "/help?workspace=PUBLISHER", "使用帮助"],
      ],
    ],
    [
      "ADMIN",
      "admin@example.invalid",
      [
        ["C21", "/me/settings/account?workspace=ADMIN", "账户设置"],
        ["P06", "/help?workspace=ADMIN", "使用帮助"],
      ],
    ],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    if (email)
      expect(
        (
          await context.request.post(base + "/api/v1/auth/login", {
            data: { email, password: "TravelTools2026!" },
          })
        ).status(),
      ).toBe(200);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    for (const [id, route, title] of routes) {
      await page.goto(base + route);
      await expect(page.locator(`.app-shell.role-${role}`)).toBeVisible();
      if (title === "服务介绍")
        await expect(
          page.getByRole("tab", { name: title, exact: true }),
        ).toBeVisible();
      else if (title)
        await expect(
          page.getByRole("heading", { name: title, exact: true, level: 1 }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("heading", {
            name: "把重复工作交给脚本",
            exact: true,
          }),
        ).toBeVisible();
      if (id === "P01") {
        await expect(page.locator(".home-recommendation")).toHaveCount(4);
        await expect(page.locator(".home-category-details > a")).toHaveCount(3);
        await expect(page.locator(".home-fee-note")).toContainText(
          "脚本服务费",
        );
        await expect(page.locator(".home-payment-guide ol li")).toHaveCount(3);
        const layout = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          helpBottom: document
            .querySelector(".home-sidebar-help")
            .getBoundingClientRect().bottom,
        }));
        expect(layout.width).toBe(1814);
        expect(layout.height).toBe(868);
        expect(layout.helpBottom).toBeLessThanOrEqual(868);
        report.homeLayout = layout;
        report.checks.push(
          "public home retains the reference columns, recommendations, categories, workflow and purchase guidance within the reference viewport",
        );
        await verifyPublicHome(context, page);
      }
      await page.screenshot({
        path: path.join(output, `${role}-${id}.png`),
        fullPage: true,
      });
      report.screenshots.push(`${role}-${id}`);
    }

    await page.goto(
      base + `/help?workspace=${role}&q=${encodeURIComponent("服务费")}`,
    );
    const headerSearch = page.locator(".global-search input");
    const helpSearch = page.getByRole("textbox", {
      name: "搜索帮助内容",
      exact: true,
    });
    await expect(headerSearch).toHaveValue("服务费");
    await page.reload();
    await expect(headerSearch).toHaveValue("服务费");
    await headerSearch.fill("尚未提交的搜索");
    await expect(helpSearch).toHaveValue("服务费");
    expect(new URL(page.url()).searchParams.get("q")).toBe("服务费");
    await headerSearch.fill("密码");
    await headerSearch.press("Enter");
    await expect(headerSearch).toHaveValue("密码");
    await expect(helpSearch).toHaveValue("密码");
    await page.goBack();
    await expect(headerSearch).toHaveValue("服务费");
    await page.goForward();
    await expect(headerSearch).toHaveValue("密码");
    await helpSearch.fill("");
    await helpSearch.press("Enter");
    await expect(headerSearch).toHaveValue("");
    await expect(
      page.locator(`.app-shell.role-${role}.page-P06`),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("workspace")).toBe(role);
    restoredWorkspaces.push(role);

    if (role === "PUBLISHER") {
      await page.goto(base + "/publisher/scripts?q=v0.4&source=verification");
      await expect(headerSearch).toHaveValue("v0.4");
      const scripts = page.locator(".publisher-scripts-list .ant-table-row");
      await expect(scripts).toHaveCount(1);
      await expect(scripts).toContainText("文件处理");
      const selectedScriptId = await scripts.getAttribute("data-row-key");
      expect(selectedScriptId).toBeTruthy();
      await expect(
        scripts.getByRole("link", { name: "创建服务", exact: true }),
      ).toHaveAttribute(
        "href",
        "/publisher/services/new/edit?script=" +
          encodeURIComponent(selectedScriptId),
      );
      await scripts
        .getByRole("link", { name: "创建服务", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "绑定脚本", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("文件处理 v0.4", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator(".product-input-preview")).toContainText(
        "输出格式",
      );
      await page.goBack();
      await expect(headerSearch).toHaveValue("v0.4");
      await headerSearch.fill("表格");
      await headerSearch.press("Enter");
      await expect(headerSearch).toHaveValue("表格");
      expect(new URL(page.url()).pathname).toBe("/publisher/scripts");
      expect(new URL(page.url()).searchParams.get("source")).toBe(
        "verification",
      );
      await expect(scripts.first()).toContainText("表格清洗");
      await headerSearch.fill("  ");
      await headerSearch.press("Enter");
      await expect(headerSearch).toHaveValue("");
      expect(await scripts.count()).toBeGreaterThan(3);
      const bodyScroll = await page
        .locator(".publisher-scripts-list .ant-table-body")
        .evaluate((element) => ({
          height: element.clientHeight,
          scroll: element.scrollHeight,
        }));
      expect(bodyScroll.scroll).toBeGreaterThan(bodyScroll.height);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(868);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("heading", { name: "我的脚本", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "新建脚本", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const narrowTable = await page.locator(".publisher-scripts-list .ant-table-body").evaluate((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
      }));
      expect(narrowTable.content).toBeGreaterThan(narrowTable.width);
      await page.screenshot({ path: path.join(output, "PUBLISHER-S02-mobile.png"), animations: "disabled", fullPage: true });
      await page.setViewportSize({ width: 1814, height: 868 });
      report.checks.push(
        "owner-script search matches names, descriptions and displayed versions, restores its URL state and opens a fresh product bound to that script while longer lists scroll internally and preserve mobile access",
      );
      await page.goto(
        base +
          "/publisher/builds?q=table&status=SUCCEEDED&record=B031&source=verification",
      );
      await expect(headerSearch).toHaveValue("table");
      await headerSearch.fill("  文件  ");
      await headerSearch.press("Enter");
      await expect(headerSearch).toHaveValue("文件");
      await expect(headerSearch).toBeFocused();
      const search = new URL(page.url()).searchParams;
      expect(search.get("q")).toBe("文件");
      expect(search.get("status")).toBe("SUCCEEDED");
      expect(search.get("source")).toBe("verification");
      expect(search.get("record")).toBe(null);
      await page.reload();
      await expect(headerSearch).toHaveValue("文件");
      await page.goBack();
      await expect(headerSearch).toHaveValue("table");
      await page.goForward();
      await expect(headerSearch).toHaveValue("文件");
      await headerSearch.fill("   ");
      await headerSearch.press("Enter");
      await expect(headerSearch).toHaveValue("");
      await expect(headerSearch).toBeFocused();
      expect(new URL(page.url()).searchParams.get("q")).toBe(null);
      report.checks.push(
        "publisher build search restores its URL value, preserves applied filters, clears obsolete selection and retains keyboard focus on submit",
      );
    }
    if (role === "ADMIN") {
      await page.goto(base + "/admin/orders?q=BK082");
      await expect(headerSearch).toHaveValue("BK082");
      await headerSearch.fill("用户A");
      await headerSearch.press("Enter");
      await expect(headerSearch).toHaveValue("用户A");
      await page.reload();
      await expect(headerSearch).toHaveValue("用户A");
      await page.goBack();
      await expect(headerSearch).toHaveValue("BK082");
      await page.goForward();
      await expect(headerSearch).toHaveValue("用户A");
      await page.getByRole("button", { name: "清除检索", exact: true }).click();
      await expect(headerSearch).toHaveValue("");
      expect(new URL(page.url()).searchParams.get("q")).toBe(null);
      report.checks.push(
        "administrator order search restores direct links and history and follows the existing clear-search action",
      );
    }
    if (role === "GUEST") {
      await page.goto(base + "/");
      await page
        .locator(".home-category-navigation")
        .getByRole("button", { name: "更多分类", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "城市与景点", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "城市与景点", exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/travel");
      await page.goto(base + "/");
      await page
        .locator(".home-category-navigation")
        .getByRole("link", { name: "数据处理", exact: true })
        .click();
      await expect(page.locator(".service-card")).toHaveCount(1);
      await expect(page.locator(".service-card h2")).toContainText("表格清洗");
      const globalSearch = page.getByPlaceholder("搜索脚本、服务或订单", {
        exact: true,
      });
      await globalSearch.fill("文件批量处理");
      await globalSearch.press("Enter");
      await expect(page.locator(".service-card")).toHaveCount(1);
      await expect(page.locator(".service-card h2")).toContainText(
        "文件批量处理",
      );
      await globalSearch.fill("公开数据整理");
      await globalSearch.press("Enter");
      await expect(page.locator(".service-card h2")).toContainText(
        "公开数据整理",
      );
      await page.reload();
      await expect(globalSearch).toHaveValue("公开数据整理");
      await page.goBack();
      await expect(globalSearch).toHaveValue("文件批量处理");
      await page.goForward();
      await expect(globalSearch).toHaveValue("公开数据整理");
      const marketSearch = page.getByRole("textbox", {
        name: "搜索脚本服务",
        exact: true,
      });
      await marketSearch.fill("表格");
      await expect(globalSearch).toHaveValue("表格");
      await marketSearch.fill("");
      await expect(globalSearch).toHaveValue("");
      report.checks.push(
        "catalog header search restores reload and browser history and follows the page search while global submission retains its existing all-category scope",
      );
      await page.goto(base + "/");
      await page.locator(".home-publish-guide").getByRole("link").click();
      await expect(
        page.getByRole("heading", {
          name: "登录与注册",
          exact: true,
        }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("workspace")).toBe(
        "PUBLISHER",
      );
      report.checks.push(
        "home categories filter the market, repeated global searches refresh the current route, and publishing opens the publisher sign-in entry",
      );
    }
    if (role === "USER") {
      for (const route of [
        "/services/missing",
        "/me/services/missing/use",
        "/me/tasks/missing",
      ]) {
        await page.goto(base + route);
        await expect(
          page.getByText(/服务不存在|权益不存在|任务不存在/),
        ).toBeVisible();
      }
      await page.goto(base + "/checkout/OD202611130001/pay");
      await expect(
        page.locator(".payment-status").getByText("已支付", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "取消订单", exact: true }),
      ).toBeDisabled();
      report.checks.push(
        "unknown resources do not substitute another service and paid orders cannot be cancelled as unpaid",
      );
    }
    report.checks.push(
      `${role} shared pages retain the requested workspace on a direct page load`,
    );
    await context.close();
  }
  expect(restoredWorkspaces).toEqual(["GUEST", "USER", "PUBLISHER", "ADMIN"]);
  report.checks.push(
    "all four help workspaces keep header drafts separate until submission and restore committed keywords through URLs, history and page-level clearing",
  );
  expect(report.errors).toEqual([]);
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
