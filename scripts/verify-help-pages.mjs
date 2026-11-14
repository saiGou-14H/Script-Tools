import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";

const output = path.resolve("output/verification/help-pages");
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: {},
  errors: [],
};
const browser = await chromium.launch();
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
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
let page;
try {
  const anonymous = await browser.newContext();
  const response = await anonymous.request.get(base + "/api/v1/public/help");
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["cache-control"], "no-store");
  const body = await response.json();
  assert.equal(body.data.content_version, "1.0");
  assert.equal(body.data.groups.length, 5);
  assert.equal(body.data.questions.length, 6);
  assert.equal(new Set(body.data.questions.map((item) => item.id)).size, 6);
  assert(
    body.data.questions.every((item) =>
      body.data.groups.some((group) => group.id === item.group),
    ),
  );
  assert.equal(body.data.support.status, "UNCONFIGURED");
  assert(!("user" in body.data));
  assert(!("support_url" in body.data.support));
  for (const query of [
    "q=refund",
    "group=security",
    "owner_user_id=other",
    "q=a&q=b",
  ]) {
    const invalid = await anonymous.request.get(
      base + "/api/v1/public/help?" + query,
    );
    assert.equal(invalid.status(), 422);
    assert.equal((await invalid.json()).error.code, "INVALID_QUERY");
  }
  await anonymous.close();
  report.checks.push(
    "The anonymous public help endpoint returns a versioned six-question/five-category catalog and explicit unconfigured support state, rejects unsupported query parameters and exposes no account fields",
  );

  for (const [role, email] of [
    ["GUEST", null],
    ["USER", "consumer@example.invalid"],
    ["PUBLISHER", "publisher@example.invalid"],
    ["ADMIN", "admin@example.invalid"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    if (email) {
      const login = await context.request.post(base + "/api/v1/auth/login", {
        data: { email, password: "TravelTools2026!" },
      });
      assert.equal(login.status(), 200);
      assert.deepEqual(
        (await (await context.request.get(base + "/api/v1/public/help")).json())
          .data,
        body.data,
      );
    }
    page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    async function open(search = "") {
      await page.goto(`${base}/help?workspace=${role}${search}`);
      await expect(page.locator(`.role-${role}.page-P06`)).toBeVisible();
      await expect(
        page.locator(".help-questions .ant-collapse-item"),
      ).toHaveCount(5);
    }
    async function capture(id) {
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: path.join(output, id + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      report.screenshots.push(id);
    }
    const home = {
      GUEST: "/",
      USER: "/me/home",
      PUBLISHER: "/publisher",
      ADMIN: "/admin",
    }[role];
    await page.goto(base + home);
    const helpLink = page
      .locator(".sidebar")
      .getByRole("link", { name: "使用帮助", exact: true });
    if (role !== "GUEST")
      await expect(helpLink).toHaveAttribute("href", `/help?workspace=${role}`);
    await helpLink.click();
    await expect(page.locator(`.role-${role}.page-P06`)).toBeVisible();
    await page.reload();
    await expect(page.locator(`.role-${role}.page-P06`)).toBeVisible();
    await open();
    await expect(
      page.getByRole("heading", { name: "使用帮助", exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator(".help-answer:visible")).toContainText(
      "以购买前展示并固定的发布者规则为准。",
    );
    if (role === "PUBLISHER")
      await expect(page.locator(".help-banner")).toHaveCount(0);
    else await expect(page.locator(".help-banner")).toBeVisible();
    await capture(role + "-P06");
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      columns: [...document.querySelectorAll(".help-columns > *")].map(
        (element) => ({
          left: element.getBoundingClientRect().left,
          top: element.getBoundingClientRect().top,
          width: element.getBoundingClientRect().width,
        }),
      ),
      helpBottom: document
        .querySelector('.sidebar a[href^="/help"]')
        ?.getBoundingClientRect().bottom,
    }));
    report.layouts[role] = layout;
    assert.equal(layout.width, 1814, role + " desktop width");
    assert(layout.height <= 868, role + " desktop height " + layout.height);
    assert(layout.helpBottom <= 868, role + " complete sidebar navigation");
    assert(
      Math.max(...layout.columns.map((column) => column.top)) -
        Math.min(...layout.columns.map((column) => column.top)) <
        1,
    );

    const search = page.getByRole("textbox", {
      name: "搜索帮助内容",
      exact: true,
    });
    await search.fill("密码");
    await search.press("Enter");
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await expect(page.locator(".help-questions")).toContainText(
      "如何保护我的账户和凭据？",
    );
    await page.reload();
    await expect(search).toHaveValue("密码");
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await search.fill("JSON schema");
    await search.press("Enter");
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await expect(page.locator(".help-questions")).toContainText(
      "如何发布脚本？",
    );
    await search.fill("不存在<img src=x onerror=alert(1)>");
    await search.press("Enter");
    await expect(
      page.getByText("未找到相关帮助", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".help-questions img")).toHaveCount(0);
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(5);
    await expect(search).toHaveValue("");
    assert.equal(new URL(page.url()).searchParams.get("workspace"), role);

    await page
      .locator(".help-directory")
      .getByRole("button", { name: "账号安全", exact: true })
      .click();
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page
        .locator(".help-directory")
        .getByRole("button", { name: "账号安全", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "如何保护我的账户和凭据？", exact: true })
      .click();
    await expect(page.locator(".help-answer:visible")).toContainText(
      "对应服务的接入状态",
    );
    await page.reload();
    await expect(page.locator(".help-answer:visible")).toContainText(
      "对应服务的接入状态",
    );
    await page
      .locator(".help-directory")
      .getByRole("button", { name: "账号安全", exact: true })
      .click();
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(6);
    await page.goto(`${base}/help?workspace=${role}&question=missing`);
    await expect(
      page.getByText("帮助条目 missing 不可用", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".help-answer:visible")).toHaveCount(0);
    await page.goto(`${base}/help?workspace=${role}&question=`);
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(5);
    await expect(page.locator(".help-answer:visible")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".help-answer:visible")).toHaveCount(0);

    const globalSearch = page.locator(".global-search input");
    await globalSearch.fill("服务费");
    await globalSearch.press("Enter");
    await expect(search).toHaveValue("服务费");
    await expect(page.locator(`.role-${role}.page-P06`)).toBeVisible();
    await globalSearch.fill("密码");
    await globalSearch.press("Enter");
    await expect(search).toHaveValue("密码");
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);

    await open();
    await page.locator(".help-contact .ant-btn").click();
    await expect(page.getByRole("dialog")).toContainText(
      "在线支持渠道尚未配置",
    );
    await page.reload();
    await expect(page.getByRole("dialog")).toContainText(
      "在线支持渠道尚未配置",
    );
    await page
      .getByRole("button", { name: "查看退款说明", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await expect(page.locator(".help-answer:visible")).toContainText(
      "以购买前展示并固定的发布者规则为准。",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    await capture(role + "-P06-mobile");
    const mobile = await page.locator(".help-page").boundingBox();
    assert.equal(mobile.x, 16);
    assert.equal(mobile.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
      role + " mobile width",
    );
    if (role !== "PUBLISHER") {
      assert(
        await page
          .locator(".help-banner")
          .evaluate((element) => {
            const banner = element.getBoundingClientRect();
            return [...element.children]
              .filter((child) => !child.classList.contains("help-search-art"))
              .every((child) => {
                const box = child.getBoundingClientRect();
                return box.top >= banner.top && box.bottom <= banner.bottom;
              });
          }),
        role + " unclipped mobile banner content",
      );
    }
    await search.fill("密码");
    await search.press("Enter");
    await expect(
      page.locator(".help-questions .ant-collapse-item"),
    ).toHaveCount(1);
    await context.close();
    report.checks.push(
      `${role} help retains its own reference layout and navigation, searches all categories including account security, restores filters and exact accordion state from URL, preserves help search workspace and restores the unconfigured-support dialog on desktop and 390px screens`,
    );
  }

  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await context.route("**/api/v1/public/help", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "帮助暂时不可用" },
      }),
    }),
  );
  await page.goto(base + "/help");
  await expect(
    page.getByText("帮助内容加载失败", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".help-questions .ant-collapse-item")).toHaveCount(
    0,
  );
  await expect(page.locator(".help-contact .ant-btn")).toBeDisabled();
  await context.unroute("**/api/v1/public/help");
  await page.getByRole("button", { name: "重试加载帮助", exact: true }).click();
  await expect(page.locator(".help-questions .ant-collapse-item")).toHaveCount(
    5,
  );
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.data.data_mode = "live";
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await expect(page.locator(".help-questions .ant-collapse-item")).toHaveCount(
    5,
  );
  await page.screenshot({
    path: path.join(output, "GUEST-P06-live.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("GUEST-P06-live");
  await context.close();
  report.checks.push(
    "Failed public help reads show retryable errors without substituting example answers, and a LIVE bootstrap continues to use the same public catalog with explicit pending support state",
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
  await browser.close();
  await server.close();
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
