import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = path.resolve("output/verification/personal-data-pages");
await mkdir(output, { recursive: true });
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
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const contexts = [];
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
  final_visual_acceptance: "pending",
};
let page;
async function session(live = false) {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  contexts.push(context);
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
  if (live)
    await context.route("**/api/v1/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.data_mode = "live";
      await route.fulfill({ response, json: body });
    });
  const current = await context.newPage();
  current.on("pageerror", (error) =>
    report.errors.push(error.stack || error.message),
  );
  return current;
}
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toHaveText(title);
}
async function capture(id) {
  await page.mouse.move(1813, 867);
  await page.screenshot({
    path: path.join(output, id + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(id);
  const layout = await page.evaluate(() => {
    function bounds(selector) {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
          }
        : null;
    }
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      intro: bounds(".credential-intro,.traveler-intro"),
      main: bounds(".credentials-columns > .panel,.traveler-list"),
      detail: bounds(
        ".credentials-columns > .panel:last-child,.travelers-columns > .panel",
      ),
      help: bounds(".sidebar .nav-group:last-child .nav-item"),
    };
  });
  report.layouts[id] = layout;
  assert.equal(layout.width, 1814);
  assert.equal(layout.height, 868);
  assert.ok(layout.help.bottom <= 868);
  assert.ok(layout.detail.bottom <= 868);
}
function credential(name) {
  return page
    .locator(".credentials-columns .ant-table-tbody tr.ant-table-row")
    .filter({ hasText: name });
}
function traveler(name) {
  return page
    .locator(".traveler-list article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function fillTraveler(name, phone, identity, kind = "身份证") {
  await page.getByLabel("姓名", { exact: true }).fill(name);
  await page.getByLabel("手机号", { exact: true }).fill(phone);
  await page.getByLabel("证件类型", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: kind })
    .click();
  await page.getByLabel("证件号码", { exact: true }).fill(identity);
}
try {
  page = await session();
  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  await page.goto(base + "/me/credentials");
  await expect(page.locator(".credentials-columns .ant-table-row")).toHaveCount(
    2,
  );
  await capture("USER-C14");
  await expect(page.locator(".breadcrumb")).toContainText("我的首页");
  const links = await page.locator(".sidebar .nav-item").allTextContents();
  assert.ok(links.indexOf("账户设置") < links.indexOf("预约凭证与票款"));
  await menu("出行人资料");
  await expect(page.locator(".traveler-list article")).toHaveCount(3);
  await capture("USER-C15");
  report.checks.push(
    "the production-built credential and traveler layouts restore their reference regions inside 1814 by 868 with complete sidebar access, aligned traveler columns and the whole editing form visible",
  );

  for (const title of ["凭据管理", "出行人资料"]) {
    await menu(title);
    await page.getByRole("heading", { name: title, exact: true }).click();
    await page.keyboard.press("Control+k");
    await expect(page.locator(".global-search input")).toBeFocused();
    await page.locator(".global-search input").fill("表格");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/market\?q=/);
    assert.equal(new URL(page.url()).searchParams.get("q"), "表格");
  }
  report.checks.push(
    "the reference Ctrl K hint focuses the global search and submits through the existing service-market route from both personal-data pages",
  );

  await menu("凭据管理");
  await page.getByRole("button", { name: "新增凭据", exact: true }).click();
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(
    page.getByText("请输入新的完整凭据", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("名称", { exact: true }).fill("  ");
  await page.getByLabel("凭据内容", { exact: true }).fill("x7");
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(page.getByText("请输入凭据名称", { exact: true })).toBeVisible();
  await page.getByLabel("名称", { exact: true }).fill("  短凭据示例  ");
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(credential("短凭据示例")).toContainText("••••");
  await expect(credential("短凭据示例")).not.toContainText("x7");
  await credential("短凭据示例")
    .getByRole("button", { name: "更新", exact: true })
    .click();
  await expect(page.getByLabel("名称", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("类型", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("凭据内容", { exact: true })).toHaveValue("");
  await page
    .getByLabel("凭据内容", { exact: true })
    .fill("cancelled-preview-secret");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await credential("短凭据示例")
    .getByRole("button", { name: "更新", exact: true })
    .click();
  await expect(page.getByLabel("凭据内容", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await credential("短凭据示例")
    .getByRole("button", { name: /查看绑定/ })
    .click();
  await expect(page.getByText("暂无绑定任务", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  report.checks.push(
    "credential creation validates names and required secrets, short values remain fully masked, rotation keeps the credential identity fixed and cancellation clears the secret editor",
  );

  await credential("邮箱服务token")
    .getByRole("button", { name: "更新", exact: true })
    .click();
  await page
    .getByLabel("凭据内容", { exact: true })
    .fill("rotated-preview-token-7391");
  await page.getByRole("button", { name: "保存凭据", exact: true }).click();
  await expect(credential("邮箱服务token")).toContainText("v2");
  await expect(credential("邮箱服务token")).toContainText("••••7391");
  await expect(credential("邮箱服务token")).toContainText("未验证");
  await credential("邮箱服务token")
    .getByRole("button", { name: /查看绑定/ })
    .click();
  const bindings = page.getByRole("dialog");
  await expect(bindings.getByRole("link")).toHaveCount(2);
  await expect(bindings).toContainText("绑定 v1 · 当前 v2");
  await bindings
    .getByRole("link", { name: "公开数据整理：城市基本信息", exact: true })
    .click();
  await expect(page).toHaveURL(/\/me\/tasks\/data$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".main-content")).toContainText("SO-20261113-003");
  await menu("凭据管理");
  await credential("邮箱服务token")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("绑定了2个任务");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    credential("邮箱服务token").getByRole("button", {
      name: "更新",
      exact: true,
    }),
  ).toBeEnabled();
  await credential("邮箱服务token")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await page.getByRole("button", { name: "确认撤销", exact: true }).click();
  for (const name of ["更新", "验证", "撤销"])
    await expect(
      credential("邮箱服务token").getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(credential("邮箱服务token")).toContainText("v2");
  report.checks.push(
    "rotating credentials creates the next preview version while existing bindings retain v1, binding links open their own task and close the dialog, and revocation requires confirmation while retaining historical version metadata",
  );

  await menu("出行人资料");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(page.getByText("请输入姓名", { exact: true })).toBeVisible();
  await fillTraveler("赵明", "+     ", "3301********1234");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(
    page.getByText("请输入有效的手机号", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("请输入完整的证件号码", { exact: true }),
  ).toBeVisible();
  await fillTraveler("赵明", "+86 13800123456", "P73210945", "护照");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(traveler("赵*")).toHaveCount(1);
  await expect(
    page.locator(".traveler-list").getByText("默认联系人", { exact: true }),
  ).toHaveCount(1);
  await expect(traveler("赵*")).toContainText("默认联系人");
  await expect(page.locator(".traveler-list")).not.toContainText("P73210945");
  await expect(page.locator(".traveler-list")).not.toContainText("13800123456");
  await traveler("赵*")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expect(page.locator(".traveler-edit-note")).toContainText("v1");
  await expect(
    page.locator(".travelers-columns .ant-select").getByText("护照", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("证件号码", { exact: true })).toHaveValue("");
  await fillTraveler("赵敏", "13800123456", "P83210945", "护照");
  await page.getByRole("button", { name: "更新资料", exact: true }).click();
  await expect(page.locator(".traveler-list article")).toHaveCount(4);
  await traveler("赵*")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expect(page.locator(".traveler-edit-note")).toContainText("v2");
  await expect(
    page.locator(".travelers-columns .ant-select").getByText("护照", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置", exact: true }).click();
  report.checks.push(
    "traveler forms reject masked identities and invalid phones, save only masked preview values, retain the selected passport type across edits, advance the same record to v2 and keep one selected default contact",
  );

  await fillTraveler("李", "123456", "987654", "其他证件");
  await page
    .getByRole("checkbox", { name: "设为默认联系人", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(traveler("*")).toHaveCount(1);
  await expect(traveler("*")).not.toContainText("123456");
  await expect(traveler("*")).not.toContainText("987654");
  await expect(traveler("*")).toContainText("****");
  await expect(
    page.locator(".traveler-list").getByText("默认联系人", { exact: true }),
  ).toHaveCount(1);
  await traveler("赵*")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel("姓名", { exact: true }).fill("待取消编辑");
  await traveler("赵*")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(traveler("赵*")).toHaveCount(1);
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue(
    "待取消编辑",
  );
  await traveler("赵*")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(traveler("赵*")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "添加资料", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue("");
  report.checks.push(
    "short names, phone numbers and document numbers remain masked, unchecked defaults preserve the prior selection, deletion cancellation retains the edit and deleting the edited record resets its stale form",
  );
  assert.deepEqual(mutations, []);

  const live = await session(true);
  await live.goto(base + "/me/credentials");
  await expect(
    live.getByText("凭据管理接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(
    live.getByRole("button", { name: "新增凭据", exact: true }),
  ).toBeDisabled();
  await expect(live.locator(".credentials-columns .ant-table-row")).toHaveCount(
    0,
  );
  await live.goto(base + "/me/travelers");
  await expect(
    live.getByText("出行人资料接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(
    live.getByRole("button", { name: "添加资料", exact: true }),
  ).toBeDisabled();
  await expect(live.getByLabel("姓名", { exact: true })).toBeDisabled();
  await expect(live.locator(".traveler-list article")).toHaveCount(0);
  report.checks.push(
    "live-mode credential and traveler pages expose pending service integration, keep development fixtures isolated and disable local-only mutation entry points",
  );

  const narrow = await session();
  await narrow.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/me/credentials", "/me/travelers"]) {
    await narrow.goto(base + route);
    await expect(narrow.locator(".page-heading h1")).toBeVisible();
    assert.equal(
      await narrow.evaluate(() => document.documentElement.scrollWidth),
      390,
      route,
    );
  }
  report.checks.push(
    "the existing narrow-screen layout retains credential-table scrolling and usable traveler forms without horizontal document overflow",
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
  for (const context of contexts)
    await context.unrouteAll({ behavior: "wait" });
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
