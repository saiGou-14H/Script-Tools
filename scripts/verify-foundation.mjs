import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("output/verification/frontend-foundation");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = {
  date: new Date().toISOString(),
  baseURL: "http://127.0.0.1:5174",
  checks: [],
  screenshots: [],
  consoleErrors: [],
};
async function capture(page, name) {
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
  });
  report.screenshots.push(name);
}
async function login(context, email) {
  const response = await context.request.post(
    `${report.baseURL}/api/v1/auth/login`,
    { data: { email, password: "TravelTools2026!" } },
  );
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
try {
  const publicContext = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  const page = await publicContext.newPage();
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  await page.goto(`${report.baseURL}/market`);
  await expect(page).toHaveTitle("Script Tools · 通用脚本服务平台");
  await expect(page.locator(".brand strong")).toHaveText("Script Tools");
  const apiDocument = await publicContext.request.get(
    `${report.baseURL}/api/docs-json`,
  );
  expect(apiDocument.ok()).toBe(true);
  expect((await apiDocument.json()).info.title).toBe("Script Tools API");
  report.checks.push(
    "Script Tools branding is consistent in the browser, navigation and API documentation",
  );
  await expect(page.locator(".service-card")).toHaveCount(4);
  await capture(page, "GUEST-P02");
  await page
    .getByPlaceholder("搜索用途或服务，如：表格清洗、文件批量处理")
    .fill("表格清洗");
  await expect(page.locator(".service-card")).toHaveCount(1);
  report.checks.push("service search filters server-backed catalog");
  const unauthorized = await publicContext.request.get(
    `${report.baseURL}/api/v1/tasks`,
  );
  expect(unauthorized.status()).toBe(401);
  report.checks.push("anonymous private API is rejected");
  await page.goto(`${report.baseURL}/me/tasks`);
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  report.checks.push("private route redirects to login");
  await capture(page, "GUEST-P07");
  await page
    .getByRole("button", { name: "本地开发示例账号", exact: true })
    .click();
  await page.getByRole("button", { name: "示例消费者", exact: true }).click();
  await page
    .locator(".auth-card")
    .getByRole("button", { name: /登\s*录/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "我的任务", exact: true }),
  ).toBeVisible();
  const user = (
    await (
      await publicContext.request.get(`${report.baseURL}/api/v1/bootstrap`)
    ).json()
  ).data;
  report.checks.push(
    "login form establishes a server session and returns to the workspace",
  );
  await page.goto(`${report.baseURL}/me/home`);
  await expect(page.getByRole("heading", { name: "欢迎回来！" })).toBeVisible();
  await capture(page, "USER-C01");
  await page.goto(`${report.baseURL}/me/tasks`);
  await expect(page.locator(".task-table .ant-table-tbody tr")).toHaveCount(3);
  await capture(page, "USER-C08");
  await page.getByText("本人自用", { exact: true }).click();
  await expect(page.locator(".task-table .ant-empty")).toBeVisible();
  report.checks.push("task scope tabs expose an honest empty state");
  await page.goto(`${report.baseURL}/me/services/demo/use`);
  await expect(page.getByRole("heading", { name: "配置参数" })).toBeVisible();
  await capture(page, "USER-C07");
  await page.getByRole("button", { name: "预览配置" }).click();
  await expect(
    page.locator(".ant-form-item-explain-error").first(),
  ).toBeVisible();
  report.checks.push("RJSF blocks empty required publisher fields");
  await page.goto(`${report.baseURL}/me/runs`);
  await expect(page.locator(".record-table .ant-table-tbody tr")).toHaveCount(
    3,
  );
  await capture(page, "USER-C10");
  await page.goto(`${report.baseURL}/me/outputs`);
  await expect(page.getByText("cleaned.csv", { exact: true })).toBeVisible();
  await capture(page, "USER-C12");
  await page
    .getByRole("button", { name: /安全预览/ })
    .first()
    .click();
  await expect(page.locator(".ant-modal pre")).toContainText("name,email");
  await page
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /下载/ }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cleaned.csv");
  report.checks.push("output preview and file download work in prototype mode");
  const admin = await publicContext.request.get(
    `${report.baseURL}/api/v1/admin/nodes`,
  );
  expect(admin.status()).toBe(403);
  report.checks.push("consumer cannot call admin API");
  const csrf = await publicContext.request.post(
    `${report.baseURL}/api/v1/auth/logout`,
    { data: {} },
  );
  expect(csrf.status()).toBe(403);
  report.checks.push("session mutation requires CSRF token");
  const logout = await publicContext.request.post(
    `${report.baseURL}/api/v1/auth/logout`,
    { data: {}, headers: { "x-csrf-token": user.csrf_token } },
  );
  expect(logout.status()).toBe(200);
  expect(
    (await publicContext.request.get(`${report.baseURL}/api/v1/me`)).status(),
  ).toBe(401);
  report.checks.push("logout revokes server session");
  const publisherContext = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await login(publisherContext, "publisher@example.invalid");
  const editor = await publisherContext.newPage();
  editor.on("pageerror", (error) => report.consoleErrors.push(error.message));
  await editor.goto(`${report.baseURL}/publisher`);
  await expect(
    editor.getByRole("heading", { name: "发布者工作台" }),
  ).toBeVisible();
  await capture(editor, "PUBLISHER-S01");
  await editor.goto(`${report.baseURL}/publisher/scripts/demo/edit`);
  await expect(editor.getByLabel("脚本代码")).toBeVisible();
  await editor.getByRole("button", { name: "校验", exact: true }).click();
  await expect(editor.getByText("清单校验成功", { exact: true })).toBeVisible();
  await capture(editor, "PUBLISHER-S03");
  report.checks.push(
    "publisher editor accepts and validates editable manifest",
  );
  const adminContext = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await login(adminContext, "admin@example.invalid");
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (error) =>
    report.consoleErrors.push(error.message),
  );
  await adminPage.goto(`${report.baseURL}/admin`);
  await expect(
    adminPage.getByRole("heading", { name: "运营总览" }),
  ).toBeVisible();
  await capture(adminPage, "ADMIN-O01");
  report.checks.push("admin dashboard renders in authorized workspace");
  expect(report.consoleErrors).toEqual([]);
  report.checks.push(
    "implemented pages render without browser runtime exceptions",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
