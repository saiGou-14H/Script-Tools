import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, request } from "@playwright/test";
import { Pool } from "pg";
import { preview } from "vite";

loadEnvFile(path.resolve(process.argv[2] || ".env"));
const output = path.resolve("output/verification/admin-catalog-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(localRoot, "admin-metadata-" + randomUUID());
assert.equal(path.dirname(temporaryData), localRoot);
await mkdir(output, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const previous = Object.fromEntries(
  ["DATABASE_URL", "LOCAL_DATA_DIRECTORY", "DEV_SEED", "NODE_ENV"].map(
    (key) => [key, process.env[key]],
  ),
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
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  AdminMetadataService,
} = require("../apps/control-api/dist/admin/admin-metadata.service.js");
const {
  PaginationService,
} = require("../apps/control-api/dist/common/pagination.service.js");
const {
  EnvelopeInterceptor,
  HttpErrorFilter,
} = require("../apps/control-api/dist/common/http.js");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  layouts: {},
  errors: [],
};
const contexts = [];
let app, server, browser, page, connection;

async function fixtures(database, actorId, prefix) {
  const userId = randomUUID(),
    scriptId = randomUUID(),
    serviceId = randomUUID(),
    versionId = randomUUID();
  await database.query(
    `INSERT INTO travel.users(id,email_normalized,password_hash,display_name,status,verified_at)
    SELECT $1,$2,password_hash,$3,'ACTIVE',now() FROM travel.users WHERE id=$4`,
    [userId, prefix + "@example.invalid", prefix + "%_", actorId],
  );
  await database.query(
    `INSERT INTO travel.quota_accounts(id,scope,scope_key,resource_key,window_start,limit_amount,reserved_amount,consumed_amount)
    VALUES ($1,'USER',$2,'runtime.memory_bytes',now()-interval '1 day',9223372036854775807,10,20),
      ($3,'USER',$2,'runtime.memory_bytes',now()-interval '2 days',50,0,0),
      ($4,'USER',$2,'runtime.memory_bytes',now()+interval '1 day',1,0,0),
      ($5,'USER',$2,'runtime.executions',now()-interval '1 day',1000,2,3),
      ($6,'NODE',$2,'node.only',now()-interval '1 day',100,0,0)`,
    [
      randomUUID(),
      userId,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );
  await database.query(
    "INSERT INTO travel.scripts(id,owner_user_id,name) VALUES($1,$2,$3)",
    [scriptId, userId, prefix + "私有脚本"],
  );
  await database.query(
    "INSERT INTO travel.script_versions(id,owner_user_id,script_id,version) VALUES($1,$2,$3,'draft-0.1')",
    [versionId, userId, scriptId],
  );
  await database.query(
    `INSERT INTO travel.services(id,owner_user_id,title,category_id)
    SELECT $1,$2,$3,id FROM travel.service_categories ORDER BY id LIMIT 1`,
    [serviceId, userId, prefix + "草稿商品"],
  );
  return { userId, scriptId, serviceId, versionId };
}

try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl(),
    database = app.get(DatabaseService);
  async function login(email) {
    const context = await request.newContext({ baseURL: base });
    contexts.push(context);
    const response = await context.post("/api/v1/auth/login", {
      data: { email, password: "TravelTools2026!" },
    });
    expect(response.status()).toBe(200);
    return { context, ...(await response.json()).data };
  }
  const guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  const admin = await login("admin@example.invalid"),
    consumer = await login("consumer@example.invalid");
  for (const endpoint of [
    "/admin/users",
    "/admin/services",
    `/admin/users/${consumer.user.id}/quotas`,
  ]) {
    expect((await guest.get("/api/v1" + endpoint)).status()).toBe(401);
    expect((await consumer.context.get("/api/v1" + endpoint)).status()).toBe(
      403,
    );
  }
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason)
    VALUES($1,$2,ARRAY['runtime.observe'],'Verification limited grant')`,
    [randomUUID(), consumer.user.id],
  );
  expect((await consumer.context.get("/api/v1/admin/users")).status()).toBe(
    403,
  );
  expect((await consumer.context.get("/api/v1/admin/services")).status()).toBe(
    403,
  );
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['user.manage'] WHERE owner_user_id=$1",
    [consumer.user.id],
  );
  expect((await consumer.context.get("/api/v1/admin/users")).status()).toBe(
    200,
  );
  expect((await consumer.context.get("/api/v1/admin/services")).status()).toBe(
    403,
  );
  report.checks.push(
    "anonymous, consumer and limited administrator HTTP requests enforce independent user.manage and catalog.manage capabilities",
  );

  async function get(endpoint, status = 200, actor = admin) {
    const response = await actor.context.get("/api/v1" + endpoint);
    expect(response.status(), endpoint).toBe(status);
    if (status === 200)
      expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const seedUsers = (await get("/admin/users")).data;
  const self = seedUsers.find((item) => item.id === admin.user.id);
  assert.equal(self.is_current, true);
  assert.equal(self.is_last_access_manager, true);
  assert.equal(self.display_name_mask, "平**");
  for (const forbidden of [
    "email_normalized",
    "password_hash",
    "token_hash",
    "admin@example.invalid",
    "平台管理员",
  ])
    assert.equal(JSON.stringify(seedUsers).includes(forbidden), false);
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason,expires_at)
    VALUES($1,$2,ARRAY['access.manage'],'Expired verification grant',now()-interval '1 minute')`,
    [randomUUID(), consumer.user.id],
  );
  assert.equal(
    (await get("/admin/users")).data.find((item) => item.id === admin.user.id)
      .is_last_access_manager,
    true,
  );
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason)
    VALUES($1,$2,ARRAY['access.manage'],'Effective verification grant')`,
    [randomUUID(), consumer.user.id],
  );
  assert.equal(
    (await get("/admin/users")).data.find((item) => item.id === admin.user.id)
      .is_last_access_manager,
    false,
  );
  report.checks.push(
    "masked account projections retain exact string revisions, current-account identity and last effective access-manager protection while ignoring expired grants",
  );

  const prefix = "metadata-" + randomUUID(),
    fixture = await fixtures(database, admin.user.id, prefix);
  await database.query(
    `INSERT INTO travel.users(id,email_normalized,password_hash,display_name,status,verified_at,created_at)
    SELECT gen_random_uuid(),$1||i::text||'@example.invalid',password_hash,$1||i::text,'ACTIVE',now(),'2026-01-01 00:00:00.123456+00'
    FROM travel.users CROSS JOIN generate_series(1,23) i WHERE id=$2`,
    [prefix, admin.user.id],
  );
  assert.equal(
    (await get("/admin/users?q=" + encodeURIComponent(prefix + "%_"))).data
      .length,
    1,
  );
  for (const query of [
    "limit=0",
    "limit=101",
    "limit=1.0",
    "q=a&q=b",
    "status=READY",
    "unknown=true",
    "cursor=broken",
    "q=" + "a".repeat(201),
  ])
    await get("/admin/users?" + query, 422);
  for (const endpoint of [
    "/admin/services?view=invalid",
    "/admin/services?view=versions&status=ACTIVE",
    "/admin/services?view=services&status=SEALED",
    "/admin/services?view=services&view=versions",
  ])
    await get(endpoint, 422);
  await get("/admin/users/invalid/quotas", 422);
  await get(`/admin/users/${randomUUID()}/quotas`, 404);
  await get(`/admin/users/${fixture.userId}/quotas?status=ACTIVE`, 422);
  report.checks.push(
    "search escapes literal wildcard characters and strict queries reject unsupported fields, arrays, invalid states, malformed UUIDs and unavailable accounts",
  );

  const search = "/admin/users?limit=1&q=" + encodeURIComponent(prefix);
  const first = await get(search),
    second = await get(
      search + "&cursor=" + encodeURIComponent(first.next_cursor),
    );
  assert.notEqual(first.data[0].id, second.data[0].id);
  for (const endpoint of [
    search.replace("limit=1", "limit=2"),
    search + "x",
    "/admin/services?limit=1",
    `/admin/users/${fixture.userId}/quotas?limit=1`,
  ])
    await get(
      endpoint + "&cursor=" + encodeURIComponent(first.next_cursor),
      422,
    );
  await get(
    search + "&cursor=" + encodeURIComponent(first.next_cursor),
    422,
    consumer,
  );
  const [token, signature] = first.next_cursor.split(".");
  const tampered =
    token + "." + (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
  await get(search + "&cursor=" + encodeURIComponent(tampered), 422);
  const ids = new Set();
  let cursor;
  do {
    const result = await get(
      search + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    for (const user of result.data) {
      assert.equal(ids.has(user.id), false);
      ids.add(user.id);
    }
    cursor = result.next_cursor;
  } while (cursor);
  assert.equal(ids.size, 24);
  report.checks.push(
    "signed keyset cursors preserve microsecond timestamp ties and reject actor, filter, page-size, resource and signature changes without duplicate rows",
  );

  const quotas = await get(`/admin/users/${fixture.userId}/quotas`);
  assert.equal(quotas.data.length, 2);
  const memory = quotas.data.find(
    (item) => item.resource_key === "runtime.memory_bytes",
  );
  assert.equal(memory.limit_amount, "9223372036854775807");
  assert.equal(memory.available_amount, "9223372036854775777");
  assert.equal(typeof memory.revision, "string");
  assert.equal(
    (await get("/admin/users?q=" + fixture.userId)).data[0]
      .quota_resource_count,
    "2",
  );
  const quotaFirst = await get(`/admin/users/${fixture.userId}/quotas?limit=1`);
  const quotaSecond = await get(
    `/admin/users/${fixture.userId}/quotas?limit=1&cursor=` +
      encodeURIComponent(quotaFirst.next_cursor),
  );
  assert.notEqual(quotaFirst.data[0].id, quotaSecond.data[0].id);
  await get(
    `/admin/users/${admin.user.id}/quotas?limit=1&cursor=` +
      encodeURIComponent(quotaFirst.next_cursor),
    422,
  );
  report.checks.push(
    "quota snapshots select each USER resource's latest started window, exclude future and NODE windows and preserve signed 64-bit quantities and exact availability",
  );

  const catalog = (await get("/admin/services")).data;
  const draft = catalog.find((item) => item.id === fixture.serviceId);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.release_id, null);
  assert.equal(draft.deployment_status, null);
  assert.equal(draft.content_status, null);
  assert.equal(draft.entitlement_count, "0");
  for (const state of ["SEALED", "REVOKED"]) {
    await database.query(
      `INSERT INTO travel.script_versions(id,owner_user_id,script_id,version,source_object_id,manifest,content_hash,schema_digest,build_artifact_id,sealed_at,content_status)
      SELECT $1,owner_user_id,script_id,$2,source_object_id,manifest,content_hash,schema_digest,build_artifact_id,sealed_at,$3
      FROM travel.script_versions WHERE content_status='READY' ORDER BY id LIMIT 1`,
      [randomUUID(), "metadata-" + state, state],
    );
  }
  const versions = (await get("/admin/services?view=versions")).data;
  assert.equal(
    versions.find((item) => item.id === fixture.versionId).content_status,
    "DRAFT",
  );
  for (const state of ["SEALED", "REVOKED"])
    assert.equal(
      versions.some((item) => item.content_status === state),
      true,
    );
  for (const forbidden of [
    "source_object_id",
    "content_hash",
    "manifest",
    "schema_digest",
    "password_hash",
  ])
    assert.equal(
      JSON.stringify([...catalog, ...versions]).includes('"' + forbidden + '"'),
      false,
    );
  const catalogFirst = await get("/admin/services?limit=1");
  await get(
    "/admin/services?view=versions&limit=1&cursor=" +
      encodeURIComponent(catalogFirst.next_cursor),
    422,
  );
  report.checks.push(
    "catalog queries include unbound draft services and all private version states while projecting metadata without source, manifests, build artifacts or credentials",
  );

  connection = await pool.connect();
  await connection.query("BEGIN");
  const existing = await connection.query(
    "SELECT id FROM travel.users WHERE email_normalized='admin@example.invalid'",
  );
  assert.equal(existing.rows.length, 1);
  const pgFixture = await fixtures(
    connection,
    existing.rows[0].id,
    "pg-metadata-" + randomUUID(),
  );
  const adapter = {
    root: database.root,
    query: (sql, values) => connection.query(sql, values),
  };
  const pgService = new AdminMetadataService(
    adapter,
    new PaginationService(adapter),
  );
  const actor = {
    id: existing.rows[0].id,
    roles: ["ADMIN"],
    capabilities: ["user.manage", "catalog.manage"],
    security_revision: "1",
  };
  assert.equal(
    (await pgService.users(actor, { q: pgFixture.userId })).items[0]
      .quota_resource_count,
    "2",
  );
  const pgQuotas = await pgService.quotas(actor, pgFixture.userId, {});
  assert.equal(
    pgQuotas.items.find((item) => item.resource_key === "runtime.memory_bytes")
      .available_amount,
    "9223372036854775777",
  );
  assert.equal(
    (await pgService.catalog(actor, { q: pgFixture.serviceId })).items[0]
      .content_status,
    null,
  );
  assert.equal(
    (
      await pgService.catalog(actor, {
        view: "versions",
        q: pgFixture.versionId,
      })
    ).items[0].status,
    "DRAFT",
  );
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query("SELECT id FROM travel.users WHERE id=$1", [
        pgFixture.userId,
      ])
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "the PostgreSQL 18 service queries validate account, quota, draft service and private version projections inside a transaction with complete fixture rollback",
  );

  const businessSnapshot = async () =>
    (
      await database.query(`
    SELECT jsonb_build_object(
      'users',(SELECT jsonb_agg(jsonb_build_array(id,revision,status) ORDER BY id) FROM travel.users),
      'services',(SELECT jsonb_agg(jsonb_build_array(id,revision,status) ORDER BY id) FROM travel.services),
      'versions',(SELECT jsonb_agg(jsonb_build_array(id,revision,content_status) ORDER BY id) FROM travel.script_versions),
      'quotas',(SELECT jsonb_agg(jsonb_build_array(id,revision,limit_amount,reserved_amount,consumed_amount) ORDER BY id) FROM travel.quota_accounts)
    ) AS state`)
    ).rows[0].state;
  const businessBefore = await businessSnapshot();
  const webRoot = path.resolve("apps/web");
  server = await preview({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": { target: base } },
    },
  });
  const address = server.httpServer.address();
  assert.equal(typeof address, "object");
  const web = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
  const ui = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await ui.request.post(web + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  async function capture(id, width = 1814) {
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
    });
    report.screenshots.push(id);
    const bounds = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    report.layouts[id] = bounds;
    assert.equal(bounds.width, width);
    if (width === 1814 && !id.endsWith("-live"))
      assert.equal(bounds.height, 868);
  }
  await page.goto(web + "/admin/users");
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    2,
  );
  await capture("ADMIN-O02");
  await page
    .locator(".admin-users-table .ant-table-row")
    .first()
    .getByRole("checkbox")
    .check();
  await page.getByLabel("搜索用户", { exact: true }).fill("9074");
  await page
    .locator(".admin-users-toolbar")
    .getByRole("button", { name: "限制新业务", exact: true })
    .click();
  await expect(
    page.getByText("请先选择一个账号", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("搜索用户", { exact: true })).toHaveValue(
    "9074",
  );
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    1,
  );
  await page.goto(web + "/admin/services");
  await expect(
    page.locator(".admin-services-page .ant-table-row:visible"),
  ).toHaveCount(2);
  await capture("ADMIN-O03");
  const clean = page
    .locator(".admin-services-page .ant-table-row:visible")
    .filter({ hasText: "脚本工坊" });
  await clean.getByRole("button", { name: "风险停销", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("重复点击验证");
  await page
    .getByRole("button", { name: "确认管理预览", exact: true })
    .dblclick();
  await expect(clean).toContainText("停销");
  await clean.getByRole("button", { name: "查看影响", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/重复点击验证/)).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "关闭影响", exact: true }).click();
  await page.getByRole("tab", { name: "脚本版本", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "脚本版本", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto(web + "/admin/services?view=unavailable");
  await expect(
    page.getByText("所选目录视图不存在，请选择服务商品或脚本版本。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".admin-services-page .ant-table-row")).toHaveCount(
    0,
  );
  report.checks.push(
    "prototype account search clears hidden selections, duplicate governance saves retain one note, URL search and version tabs survive reload and unknown views show unavailable state",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, route] of [
    ["ADMIN-O02-mobile", "/admin/users"],
    ["ADMIN-O03-mobile", "/admin/services"],
  ]) {
    await page.goto(web + route);
    await expect(
      page.locator(".admin-page .ant-table-row").first(),
    ).toBeVisible();
    const layout = await page.evaluate(() => ({
      contentLeft: document.querySelector(".admin-page").getBoundingClientRect()
        .left,
      contentWidth: document
        .querySelector(".admin-page")
        .getBoundingClientRect().width,
      actionsRight: document
        .querySelector(".topbar-actions")
        .getBoundingClientRect().right,
      headingTop: document
        .querySelector(".page-heading")
        .getBoundingClientRect().top,
      headerBottom: document.querySelector(".topbar").getBoundingClientRect()
        .bottom,
    }));
    assert.equal(layout.contentLeft, 16);
    assert.equal(layout.contentWidth, 358);
    assert.ok(layout.actionsRight <= 390);
    assert.ok(layout.headingTop >= layout.headerBottom);
    await capture(id, 390);
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  report.checks.push(
    "account and catalog reference layouts render at 1814 pixels and confine wide tables to internal scrolling at 390 pixels",
  );

  await ui.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  let failUsers = true;
  await ui.route("**/api/v1/admin/users?**", async (route) => {
    if (failUsers)
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "验证查询暂不可用" } },
      });
    else await route.continue();
  });
  await page.goto(web + "/admin/users");
  await expect(page.getByText("账号查询失败", { exact: true })).toBeVisible();
  failUsers = false;
  await page.getByRole("button", { name: "重试账号查询", exact: true }).click();
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    20,
  );
  await page.getByRole("button", { name: "加载更多账号", exact: true }).click();
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    27,
  );
  await page.getByLabel("搜索用户", { exact: true }).fill(fixture.userId);
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    1,
  );
  await expect(page.locator(".admin-users-table")).toContainText("2 类资源");
  await expect(
    page
      .locator(".admin-users-toolbar")
      .getByRole("button", { name: "调整配额", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".admin-users-table")
    .getByRole("button", { name: "查看摘要", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("9223372036854775777");
  await expect(page.getByRole("dialog")).toContainText("runtime.executions");
  await page.getByRole("button", { name: "关闭摘要", exact: true }).click();
  // Avoid recording random fixture identifiers in the reference screenshot.
  await page
    .getByLabel("搜索用户", { exact: true })
    .fill("admin@example.invalid");
  await expect(page.locator(".admin-users-table .ant-table-row")).toHaveCount(
    1,
  );
  await capture("ADMIN-O02-live");
  report.checks.push(
    "LIVE account UI queries real masked metadata, retries failures, loads cursor pages, preserves per-resource BIGINT quota values and disables pending mutations",
  );

  await page.goto(web + "/admin/services");
  await expect(page.locator(".admin-services-page .ant-table-row")).toHaveCount(
    5,
  );
  const draftRow = page
    .locator(".admin-services-page .ant-table-row")
    .filter({ hasText: prefix + "草稿商品" });
  await expect(draftRow).toContainText("未绑定部署");
  await expect(draftRow).toContainText("草稿");
  await expect(
    draftRow.getByRole("button", { name: "风险停销", exact: true }),
  ).toBeDisabled();
  await draftRow.getByRole("button", { name: "查看影响", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(fixture.serviceId);
  await expect(page.getByRole("dialog").getByRole("link")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭影响", exact: true }).click();
  await page.getByRole("tab", { name: "脚本版本", exact: true }).click();
  await expect(
    page.locator(".admin-services-page .ant-table-row:visible"),
  ).toHaveCount(7);
  await expect(
    page.locator(".admin-services-page [role=tabpanel]:visible"),
  ).toContainText("DRAFT");
  await expect(
    page.locator(".admin-services-page [role=tabpanel]:visible"),
  ).toContainText("SEALED");
  await expect(
    page.locator(".admin-services-page [role=tabpanel]:visible"),
  ).toContainText("REVOKED");
  await expect(
    page.getByRole("button", { name: "撤销执行", exact: true }).first(),
  ).toBeDisabled();
  await capture("ADMIN-O03-live");
  assert.deepEqual(await businessSnapshot(), businessBefore);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "LIVE service and version views render stored DRAFT, SEALED and REVOKED facts, missing bindings and selected-record impact metadata without fabricated order links or mutation success",
  );
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
  if (connection) {
    await connection.query("ROLLBACK");
    connection.release();
  }
  await browser?.close();
  await server?.close();
  for (const context of contexts) await context.dispose();
  await app?.close();
  await pool.end();
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
  console.log(JSON.stringify(report, null, 2));
}
