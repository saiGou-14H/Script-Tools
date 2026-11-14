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
