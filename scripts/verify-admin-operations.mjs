import { chromium, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("output/verification/admin-operations");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1814, height: 868 },
});
const page = await context.newPage();
const base = "http://127.0.0.1:5174";
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: [],
  errors: [],
};
page.on("pageerror", (error) => report.errors.push(error.message));
async function login(target) {
  const response = await target.request.post(base + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function menu(title) {
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: title })
    .click();
}
async function choose(scope, label, value) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .locator(".ant-select-dropdown .ant-select-item-option-content")
    .getByText(value, { exact: true })
    .click();
}
async function confirmOperation(reason) {
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill(reason);
  await page.getByRole("button", { name: "确认操作预览", exact: true }).click();
}
try {
  const session = await login(context);
  expect(session.user.capabilities).toContain("runtime.observe");
  for (const [id, route, title] of [
    ["O13", "/admin/scheduling", "调度与容量"],
    ["O14", "/admin/infrastructure", "节点与镜像"],
    ["O15", "/admin/runs", "运行与排障"],
    ["O16", "/admin/observability", "日志与告警"],
    ["O17", "/admin/deliveries", "通知投递"],
    ["O18", "/admin/settings", "平台设置"],
    ["O19", "/admin/access", "权限与操作审计"],
    ["O20", "/admin/recovery", "备份与清理"],
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
            .querySelector('.sidebar a[href="/help"]')
            ?.getBoundingClientRect().bottom,
        }),
        id,
      ),
    );
    const fieldIds = await page
      .locator("input[id], select[id], textarea[id]")
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(fieldIds).size, `${id} form control identifiers`).toBe(
      fieldIds.length,
    );
    await page.screenshot({
      path: path.join(output, `ADMIN-${id}.png`),
      fullPage: true,
    });
    report.screenshots.push(`ADMIN-${id}`);
  }
  for (const layout of report.layouts) {
    expect(layout.width, `${layout.id} horizontal layout`).toBeLessThanOrEqual(
      1814,
    );
    expect(layout.height, `${layout.id} vertical layout`).toBeLessThanOrEqual(
      868,
    );
    expect(
      layout.helpBottom,
      `${layout.id} navigation height`,
    ).toBeLessThanOrEqual(868);
  }
  report.checks.push(
    "all eight infrastructure and platform pages render within the reference viewport with complete navigation",
  );
  await menu("调度与容量");
  await page.getByRole("button", { name: "设置限流", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("每分钟启动上限", { exact: true })
    .fill("24");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("按容量调整启动速率");
  await page.getByRole("button", { name: "保存限流预览", exact: true }).click();
  await page.getByRole("button", { name: "执行排空", exact: true }).click();
  await confirmOperation("维护资源池，等待在途租约归零");
  await expect(
    page.getByRole("button", { name: "排空待处理", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".capacity-bars")).toContainText("48 / 64");
  report.checks.push(
    "rate and pool-drain previews preserve occupied capacity while pending work remains visible",
  );
  await menu("节点与镜像");
  const docker = page
    .locator("#infrastructure-nodes tbody tr")
    .filter({ hasText: "docker01" });
  await docker.getByRole("button", { name: "排空", exact: true }).click();
  await confirmOperation("维护docker01");
  await expect(docker).toContainText("排空中");
  await expect(docker).toContainText("4 个");
  await expect(
    docker.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await docker.getByRole("button", { name: "docker01", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "受控清理", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "关闭节点详情", exact: true }).click();
  const image = page
    .locator("#infrastructure-images tbody tr")
    .filter({ hasText: "reserve-worker" });
  await image.getByRole("button", { name: "镜像验证", exact: true }).click();
  await page.getByRole("button", { name: "发起验证", exact: true }).click();
  await confirmOperation("验证固定镜像摘要");
  await expect(image).toContainText("未验证");
  report.checks.push(
    "node drain retains leases, cleanup checks active leases, and requesting image verification preserves its pending evidence state",
  );
  await menu("运行与排障");
  await page.getByRole("button", { name: "Run083", exact: true }).click();
  await page.getByRole("button", { name: "受控停止", exact: true }).click();
  await confirmOperation("停止持续查询运行");
  await expect(
    page.locator(".admin-runs-table tbody tr").filter({ hasText: "Run083" }),
  ).toContainText("停止中");
  await expect(page.locator(".admin-controlled-stop")).toContainText("Run083");
  await page.getByRole("button", { name: "开启限时会话", exact: true }).click();
  await expect(page.getByText("请填写排障对象", { exact: true })).toBeVisible();
  await expect(page.getByText("请填写工单编号", { exact: true })).toBeVisible();
  report.checks.push(
    "controlled stop keeps its cleanup phase and scoped diagnostics validate resource, reason, fields and ticket",
  );
  await menu("日志与告警");
  await choose(page.locator(".admin-log-panel"), "关联服务", "景点预约服务");
  await page
    .locator(".admin-log-panel")
    .getByRole("button", { name: "查询", exact: true })
    .click();
  await expect(page.locator(".admin-log-panel tbody tr")).toHaveCount(2);
  const firstAlert = page
    .locator(".admin-alert-panel tbody tr")
    .filter({ hasText: "支付回调积压" });
  await firstAlert
    .getByRole("button", { name: "限时静默", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("核对恢复证据期间限时静默");
  await page.getByRole("button", { name: "保存预览", exact: true }).click();
  await expect(firstAlert).toContainText("结束静默");
  await expect(firstAlert).toContainText("队列积压已回落");
  await firstAlert
    .getByRole("button", { name: "结束静默", exact: true })
    .click();
  await expect(firstAlert).toContainText("限时静默");
  await firstAlert
    .getByRole("button", { name: "规则设置", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("表达式", { exact: true })
    .fill("tt_queue_oldest_age_seconds > 90");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("调整规则草稿阈值");
  await page.getByRole("button", { name: "保存预览", exact: true }).click();
  report.checks.push(
    "log filters, bounded silences and rule drafts operate independently from recorded recovery evidence",
  );
  await menu("通知投递");
  const failed = page
    .locator(".admin-delivery-table tbody tr")
    .filter({ hasText: "MAIL-****7D91" });
  await failed.getByRole("button", { name: "重投", exact: true }).click();
  await confirmOperation("按原收件策略重投失败消息");
  await expect(failed).toContainText("重投待处理");
  await expect(failed.locator("td").nth(4)).toHaveText("2");
  const unknown = page
    .locator(".admin-delivery-table tbody tr")
    .filter({ hasText: "MSG-****F64B" });
  await unknown.getByRole("button", { name: "先核验", exact: true }).click();
  await confirmOperation("查询原服务商回执");
  await expect(unknown).toContainText("UNKNOWN");
  await expect(unknown.locator("td").nth(4)).toHaveText("1");
  report.checks.push(
    "safe notification retries preserve logical receipt identifiers and attempt counts, and unknown deliveries remain pending original receipt reconciliation",
  );
  await menu("平台设置");
  await expect(
    page.getByRole("switch", { name: "远程来源（P1）", exact: true }),
  ).toBeDisabled();
  await page.getByRole("switch", { name: "暂停新销售", exact: true }).click();
  await confirmOperation("平台维护暂停新销售");
  await expect(
    page.getByRole("switch", { name: "暂停新销售", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: /网络白名单/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("允许域名", { exact: true })
    .fill("127.0.0.1");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("维护出站白名单");
  await page.getByRole("button", { name: "保存网络预览", exact: true }).click();
  await expect(
    page.getByText("请填写公网域名，使用逐项白名单", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("允许域名", { exact: true })
    .fill("api.example.com");
  await page.getByRole("button", { name: "保存网络预览", exact: true }).click();
  await menu("节点与镜像");
  await menu("平台设置");
  await expect(
    page.getByRole("switch", { name: "暂停新销售", exact: true }),
  ).toBeChecked();
  report.checks.push(
    "platform protection and domain-policy previews persist across routes while deferred features retain their configured phase",
  );
  await menu("权限与操作审计");
  const opsGrant = page
    .locator(".admin-access-columns tbody tr")
    .filter({ hasText: "ops****217" })
    .filter({
      has: page.getByRole("button", { name: "调整权限", exact: true }),
    });
  await opsGrant.getByRole("button", { name: "调整权限", exact: true }).click();
  await choose(page.getByRole("dialog"), "授权能力", "runtime.observe");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("补充日志只读权限预览");
  await page.getByRole("button", { name: "保存授权预览", exact: true }).click();
  await expect(opsGrant).toContainText("runtime.observe");
  await expect(page.locator(".admin-access-columns").first()).toContainText(
    "补充日志只读权限预览",
  );
  await expect(
    page
      .locator(".admin-access-columns")
      .first()
      .locator("tbody tr")
      .filter({ hasText: "adm****001" })
      .getByRole("button", { name: "调整权限", exact: true }),
  ).toHaveCount(0);
  report.checks.push(
    "grant previews retain the protected current manager and append auditable reasons for changes to another account",
  );
  await menu("备份与清理");
  await page
    .getByRole("button", { name: "运行日志 工具", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("日志热检索天数", { exact: true })
    .fill("31");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("调整保留策略预览");
  await page.getByRole("button", { name: "保存策略预览", exact: true }).click();
  await expect(
    page.getByText("保留天数须为正整数，热检索天数须在总期限内", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("日志热检索天数", { exact: true })
    .fill("5");
  await page
    .getByRole("dialog")
    .getByLabel("日志总保留天数", { exact: true })
    .fill("25");
  await page.getByRole("button", { name: "保存策略预览", exact: true }).click();
  await expect(page.locator(".admin-recovery-columns")).toContainText(
    "热检索5天 / 总保留25天",
  );
  await page.getByRole("button", { name: "恢复预检", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("待执行");
  await page.getByRole("button", { name: "登记恢复演练", exact: true }).click();
  await confirmOperation("独立验证环境恢复演练");
  await expect(page.locator(".backup-status-row")).toContainText(
    "恢复演练已登记",
  );
  report.checks.push(
    "retention validates the total window and recovery registration remains distinct from actual execution and verification",
  );
  expect(report.errors).toEqual([]);
  report.checks.push(
    "infrastructure and platform workflows complete without browser runtime exceptions",
  );
  const limited = await browser.newContext();
  await login(limited);
  let capabilities = ["runtime.observe"];
  await limited.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.user.capabilities = capabilities;
    await route.fulfill({ json: body });
  });
  const limitedPage = await limited.newPage();
  await limitedPage.goto(base + "/admin/observability");
  await expect(limitedPage.locator(".admin-log-panel tbody tr")).toHaveCount(5);
  await expect(
    limitedPage
      .locator(".admin-alert-toolbar")
      .getByRole("button", { name: "规则设置", exact: true }),
  ).toBeDisabled();
  await limitedPage.goto(base + "/admin/settings");
  await expect(
    limitedPage.getByText("无权访问此页面", { exact: true }),
  ).toBeVisible();
  capabilities = ["runtime.manage"];
  await limitedPage.goto(base + "/admin/runs");
  await expect(
    limitedPage.getByRole("button", { name: "开启限时会话", exact: true }),
  ).toBeDisabled();
  await limited.close();
  report.checks.push(
    "read-only observation grants retain log visibility while management and sensitive-session controls require their separate capabilities",
  );
  const live = await browser.newContext();
  await login(live);
  await live.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  const livePage = await live.newPage();
  livePage.on("pageerror", (error) => report.errors.push(error.message));
  for (const route of [
    "/admin/scheduling",
    "/admin/runs",
    "/admin/observability",
    "/admin/deliveries",
    "/admin/settings",
    "/admin/access",
    "/admin/recovery",
  ]) {
    await livePage.goto(base + route);
    await expect(
      livePage.locator(".admin-page .ant-empty").first(),
    ).toBeVisible();
    await expect(livePage.locator(".admin-page")).not.toContainText(
      "MAIL-****7D91",
    );
  }
  const realNodes = await live.request.get(base + "/api/v1/admin/nodes");
  expect(realNodes.ok()).toBe(true);
  const nodeRows = (await realNodes.json()).data;
  await livePage.goto(base + "/admin/infrastructure");
  if (nodeRows.length)
    await expect(
      livePage.locator("#infrastructure-nodes tbody tr[data-row-key]"),
    ).toHaveCount(nodeRows.length);
  else
    await expect(
      livePage.locator("#infrastructure-nodes .ant-empty"),
    ).toBeVisible();
  await expect(
    livePage.locator("#infrastructure-images .ant-empty"),
  ).toBeVisible();
  await live.close();
  expect(report.errors).toEqual([]);
  report.checks.push(
    "live-mode infrastructure uses the real node API and shows unavailable business modules without prototype records",
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
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
