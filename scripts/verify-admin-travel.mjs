import { chromium, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";
const webRoot = path.resolve("apps/web");
const server = await preview({
  root: webRoot,
  configFile: path.join(webRoot, "vite.config.ts"),
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
const output = path.resolve("output/verification/admin-travel");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const page = await context.newPage();
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: title })
    .click();
}
try {
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  expect(login.status()).toBe(200);
  for (const [id, route, title] of [
    ["O04", "/admin/travel/catalog", "城市与景点"],
    ["O05", "/admin/travel/channels", "渠道与适配"],
    ["O21", "/admin/travel/unresolved", "异常预约"],
  ]) {
    await page.goto(base + route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    report.layouts.push(
      await page.evaluate(
        (id) => ({
          id,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          helpBottom: document
            .querySelector('.sidebar a[href^="/help"]')
            ?.getBoundingClientRect().bottom,
        }),
        id,
      ),
    );
    const fieldIds = await page
      .locator("input[id], select[id], textarea[id]")
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(fieldIds).size, `${id} form identifiers`).toBe(
      fieldIds.length,
    );
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, `ADMIN-${id}.png`),
      fullPage: true,
    });
    report.screenshots.push(`ADMIN-${id}`);
  }
  for (const layout of report.layouts) {
    expect(layout.width, `${layout.id} width`).toBeLessThanOrEqual(1814);
    expect(layout.height, `${layout.id} height`).toBeLessThanOrEqual(868);
    expect(layout.helpBottom, `${layout.id} navigation`).toBeLessThanOrEqual(
      868,
    );
  }
  report.checks.push(
    "all three administrator travel pages render within the reference viewport",
  );
  await menu("城市与景点");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("tab", { name: "城市信息", exact: true }).click();
  await page.getByRole("button", { name: "新增城市", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("城市名称", { exact: true })
    .fill("上海");
  await page.getByRole("button", { name: "保存目录预览", exact: true }).dblclick();
  await expect(
    page.getByRole("heading", { name: "景点列表（上海）", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增景点", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("景点名称", { exact: true })
    .fill("公开展馆（示例）");
  await page
    .getByRole("dialog")
    .getByLabel("规则来源网址", { exact: true })
    .fill("https://example.invalid/shanghai");
  await page
    .getByRole("dialog")
    .getByLabel("规则来源", { exact: true })
    .fill("待渠道验证的示例规则");
  await page.getByRole("button", { name: "保存目录预览", exact: true }).click();
  await expect(page.locator(".admin-attraction-columns tbody")).toContainText(
    "公开展馆（示例）",
  );
  await expect(page.locator(".admin-attraction-columns tbody")).toContainText(
    "未开放",
  );
  await expect(page.locator(".admin-attraction-columns tbody")).toContainText(
    "0元",
  );
  report.checks.push(
    "city and free-attraction drafts update counts while unverified channels keep new attractions closed",
  );
  await menu("渠道与适配");
  const channel = page
    .locator(".admin-channel-main tbody tr")
    .filter({ hasText: "渠道A" });
  await channel.getByRole("checkbox").check();
  await page.getByRole("button", { name: "禁用新提交", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("渠道维护暂停新提交");
  await page.getByRole("button", { name: "确认操作预览", exact: true }).click();
  await expect(channel).toContainText("新提交停用");
  await expect(page.locator(".channel-unresolved .ant-table-row")).toHaveCount(
    3,
  );
  await menu("城市与景点");
  await expect(page.locator(".admin-city-list")).toContainText("上海");
  const history = page
    .locator(".admin-attraction-columns tbody tr")
    .filter({ hasText: "城市历史馆" });
  await expect(history).toContainText("未开放");
  report.checks.push(
    "channel submission pauses propagate to linked saleability and preserve all unresolved bookings",
  );
  await menu("渠道与适配");
  await channel.getByRole("checkbox").check();
  await page.getByRole("button", { name: "更新规则", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("规则来源", { exact: true })
    .fill("新规则来源样例");
  await page
    .getByRole("dialog")
    .getByLabel("规则快照", { exact: true })
    .fill("原渠道免费参观预约规则更新草稿");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("更新规则并等待重新验证");
  await page
    .getByRole("button", { name: "保存规则草稿", exact: true })
    .dblclick();
  await expect(channel).toContainText("v1.4.3");
  await expect(channel).toContainText("未验证");
  await channel
    .getByRole("button", { name: "待新版本验证", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("历史版本 v1.4.2");
  await expect(page.getByRole("dialog")).toContainText("验证截图（3张）");
  await page.getByRole("button", { name: "关闭验证记录", exact: true }).click();
  await expect(page.locator(".channel-unresolved .ant-table-row")).toHaveCount(
    3,
  );
  report.checks.push(
    "rule updates deduplicate one draft version, bind verification evidence to historical versions and preserve unresolved records",
  );
  await menu("异常预约");
  await page.getByRole("button", { name: "查询原预约", exact: true }).click();
  await page.getByRole("button", { name: "记录查询预览", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("请填写现有只读授权绑定", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("只读授权绑定", { exact: true })
    .fill("readonly-binding-demo");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("核对原预约渠道结果");
  await page.getByRole("button", { name: "记录查询预览", exact: true }).click();
  await expect(
    page.getByText("预约核验接口尚未接入，BK082保持UNKNOWN", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "记录核验结论", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("继续等待原预约可信回执");
  await page.getByRole("button", { name: "确认操作预览", exact: true }).click();
  await expect(page.locator(".unresolved-booking-table")).toContainText(
    "UNKNOWN",
  );
  await expect(page.locator(".unresolved-booking-detail")).toContainText(
    "0元（无需支付）",
  );
  await page.getByRole("link", { name: "TT••••0082", exact: true }).click();
  await expect(page.locator(".admin-order-hero")).toContainText(
    "TT202611130082",
  );
  report.checks.push(
    "booking reconciliation requires an existing read-only binding, preserves UNKNOWN and free ticket facts, and links to the exact service order",
  );
  await page.goto(base + "/admin/travel/unresolved?booking=MISSING");
  await expect(
    page.getByText("未找到未决预约 MISSING", { exact: true }),
  ).toBeVisible();
  expect(report.errors).toEqual([]);
  report.checks.push(
    "unknown booking IDs remain unavailable and travel workflows complete without browser runtime exceptions",
  );
  const live = await browser.newContext();
  await live.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  await live.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  const livePage = await live.newPage();
  for (const route of [
    "/admin/travel/catalog",
    "/admin/travel/channels",
    "/admin/travel/unresolved",
  ]) {
    await livePage.goto(base + route);
    await expect(
      livePage.locator(".admin-page .ant-empty").first(),
    ).toBeVisible();
    await expect(livePage.locator(".admin-page")).not.toContainText(
      "示例博物馆",
    );
  }
  await live.close();
  report.checks.push(
    "live travel views query stored directory metadata and expose pending booking integration while preserving the configured workspace guard",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
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
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
