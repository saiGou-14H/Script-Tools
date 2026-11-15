import { chromium, expect } from "@playwright/test";
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
      const marketSearch = page.getByPlaceholder(
        "搜索用途或服务，如：表格清洗、文件批量处理",
        { exact: true },
      );
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
