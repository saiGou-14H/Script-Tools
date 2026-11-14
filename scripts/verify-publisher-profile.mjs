import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect, request } from "@playwright/test";
import { preview } from "vite";

loadEnvFile(".env");
const root = process.cwd();
const output = path.resolve("output/verification/publisher-profile");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  `publisher-verification-${randomUUID()}`,
);
assert.equal(path.dirname(temporaryData), localRoot);
await mkdir(output, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const previousEnvironment = Object.fromEntries(
  [
    "DATABASE_URL",
    "LOCAL_DATA_DIRECTORY",
    "DEV_SEED",
    "NODE_ENV",
    "WEB_ORIGIN",
  ].map((name) => [name, process.env[name]]),
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
  CommandReceiptService,
} = require("../apps/control-api/dist/common/command-receipt.service.js");
const {
  PublisherProfileService,
} = require("../apps/control-api/dist/publisher/publisher-profile.service.js");
const {
  hashPassword,
} = require("../apps/control-api/dist/database/seed.service.js");
const {
  EnvelopeInterceptor,
  HttpErrorFilter,
} = require("../apps/control-api/dist/common/http.js");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    "Isolated PGlite HTTP and production-built UI, plus rolled-back PostgreSQL transactions",
};
let app;
let server;
let browser;
let guest;
let page;
let client;
const contexts = [];
const profilePath = "/api/v1/me/publisher-profile";
const body = {
  public_name: "验证工具工作室",
  description: "提供公开的脚本服务与联系说明。",
  accepted_terms_version: "V3.0",
};
const password = `PublisherVerification!${randomUUID()}`;

try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, "127.0.0.1");
  const apiBase = await app.getUrl();
  const database = app.get(DatabaseService);
  guest = await request.newContext({ baseURL: apiBase });
  async function account() {
    const email = `publisher-verification-${randomUUID()}@example.invalid`;
    const receiptResponse = await guest.post("/api/v1/auth/register", {
      data: { email, password, accepted_terms_version: "V3.0" },
    });
    expect(receiptResponse.status()).toBe(202);
    const receipt = (await receiptResponse.json()).data;
    expect(
      (
        await guest.post("/api/v1/auth/verify-email", {
          data: {
            challenge_id: receipt.challenge_id,
            token: receipt.development_token,
          },
        })
      ).status(),
    ).toBe(200);
    const context = await request.newContext({ baseURL: apiBase });
    contexts.push(context);
    const login = await context.post("/api/v1/auth/login", {
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const session = (await login.json()).data;
    return { email, context, user: session.user, csrf: session.csrf_token };
  }
  const first = await account();
  const second = await account();
  async function save(account, values = body, key = randomUUID(), revision) {
    return account.context.post(profilePath, {
      headers: {
        "X-CSRF-Token": account.csrf,
        "Idempotency-Key": key,
        ...(revision ? { "If-Match": `"${revision}"` } : {}),
      },
      data: values,
    });
  }
  expect((await guest.get(profilePath)).status()).toBe(401);
  expect((await first.context.post(profilePath, { data: body })).status()).toBe(
    403,
  );
  expect(
    (
      await first.context.get(profilePath + `?owner=${second.user.id}`)
    ).status(),
  ).toBe(422);
  const empty = (await (await first.context.get(profilePath)).json()).data;
  assert.equal(empty.profile, null);
  assert.equal(empty.terms.version, "V3.0");
  assert.ok(empty.terms.paragraphs.length);
  expect(
    (
      await first.context.post(profilePath, {
        headers: { "X-CSRF-Token": first.csrf },
        data: body,
      })
    ).status(),
  ).toBe(422);
  for (const invalid of [
    null,
    [],
    {},
    { ...body, public_name: " " },
    { ...body, public_name: "a".repeat(121) },
    { ...body, description: " " },
    { ...body, description: "a".repeat(10001) },
    { ...body, accepted_terms_version: "outdated" },
    { ...body, owner_user_id: second.user.id },
    { ...body, enabled: true },
  ]) {
    expect((await save(first, invalid)).status()).toBe(
      invalid === null ? 400 : 422,
    );
  }
  report.checks.push(
    "profile reads and writes require a verified session, CSRF and an idempotency key, reject owner overrides and enforce current terms and field limits",
  );

  const creationKey = randomUUID();
  const concurrent = await Promise.all([
    save(first, body, creationKey),
    save(first, body, creationKey),
  ]);
  assert.deepEqual(
    concurrent.map((response) => response.status()),
    [201, 201],
  );
  const original = (await concurrent[0].json()).data;
  assert.deepEqual((await concurrent[1].json()).data, original);
  assert.equal(concurrent[0].headers().etag, '"1"');
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [first.user.id],
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.outbox_events WHERE owner_user_id=$1 AND aggregate_type='PUBLISHER_PROFILE'",
        [first.user.id],
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.audit_events WHERE subject_owner_user_id=$1 AND target_type='PUBLISHER_PROFILE'",
        [first.user.id],
      )
    ).rows.length,
    1,
  );
  const own = (await (await first.context.get("/api/v1/bootstrap")).json())
    .data;
  assert.deepEqual(own.user.roles, ["USER", "PUBLISHER"]);
  assert.deepEqual(own.user.capabilities, []);
  assert.equal(
    (await (await second.context.get(profilePath)).json()).data.profile,
    null,
  );
  report.checks.push(
    "concurrent retries create one profile, audit event and outbox event, refresh the current session's publisher role and preserve account isolation and management capabilities",
  );

  expect(
    (
      await save(first, { ...body, public_name: "不同资料" }, creationKey)
    ).status(),
  ).toBe(409);
  expect((await save(first)).status()).toBe(428);
  expect((await save(first, body, randomUUID(), "9")).status()).toBe(412);
  const changed = { ...body, public_name: "更新后的公开资料" };
  const updatedResponse = await save(first, changed, randomUUID(), "1");
  expect(updatedResponse.status()).toBe(200);
  const updated = (await updatedResponse.json()).data;
  assert.equal(updated.revision, "2");
  const replay = await save(first, body, creationKey, "1");
  expect(replay.status()).toBe(201);
  assert.deepEqual((await replay.json()).data, original);
  assert.equal(
    (await (await first.context.get(profilePath)).json()).data.profile.revision,
    "2",
  );
  report.checks.push(
    "same-key different-body requests conflict, updates enforce If-Match, and replay returns the original snapshot and status before stale revision checks",
  );

  const receipt = (
    await database.query(
      "SELECT r.response_payload_id,p.ciphertext FROM travel.idempotency_records r JOIN travel.private_payloads p ON p.id=r.response_payload_id WHERE r.owner_user_id=$1 AND r.key=$2",
      [first.user.id, creationKey],
    )
  ).rows[0];
  assert.equal(
    Buffer.from(receipt.ciphertext).includes(Buffer.from(body.public_name)),
    false,
  );
  const freshReceiptService = new CommandReceiptService(database);
  const restored = await freshReceiptService.read(
    database,
    {
      owner: first.user.id,
      method: "POST",
      route: profilePath,
      key: creationKey,
    },
    body,
  );
  assert.deepEqual(restored.receipt.data, original);
  const tampered = Buffer.from(receipt.ciphertext);
  tampered[tampered.length - 1] ^= 1;
  await database.query(
    "UPDATE travel.private_payloads SET ciphertext=$2 WHERE id=$1",
    [receipt.response_payload_id, tampered],
  );
  expect((await save(first, body, creationKey)).status()).toBe(503);
  await database.query(
    "UPDATE travel.private_payloads SET ciphertext=$2 WHERE id=$1",
    [receipt.response_payload_id, receipt.ciphertext],
  );
  report.checks.push(
    "encrypted receipts conceal profile text, remain readable by a fresh service and fail closed when ciphertext authentication fails",
  );

  await database.query(
    "UPDATE travel.idempotency_records SET expires_at=now()-interval '1 second' WHERE owner_user_id=$1 AND key=$2",
    [first.user.id, creationKey],
  );
  expect((await save(first, body, creationKey, "2")).status()).toBe(200);
  const retiredPayload = (
    await database.query(
      "SELECT deleted_at,ciphertext FROM travel.private_payloads WHERE id=$1",
      [receipt.response_payload_id],
    )
  ).rows[0];
  assert.ok(retiredPayload.deleted_at);
  assert.equal(retiredPayload.ciphertext, null);
  await database.query(
    "UPDATE travel.publisher_profiles SET enabled=false WHERE owner_user_id=$1",
    [first.user.id],
  );
  expect((await save(first, body, creationKey)).status()).toBe(403);
  assert.deepEqual(
    (await (await first.context.get("/api/v1/bootstrap")).json()).data.user
      .roles,
    ["USER"],
  );
  report.checks.push(
    "expired receipts retire encrypted payloads while profile uniqueness persists, and a disabled publisher cannot reactivate through replay or a fresh command",
  );

  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL search_path=travel,public");
  const pgOwner = randomUUID();
  await client.query(
    "INSERT INTO travel.users(id,email_normalized,password_hash,display_name,status,verified_at) VALUES($1,$2,$3,'发布者事务验证','ACTIVE',now())",
    [
      pgOwner,
      `publisher-pg-${randomUUID()}@example.invalid`,
      hashPassword(password),
    ],
  );
  const pgDatabase = {
    root,
    query: (sql, values) => client.query(sql, values),
    transaction: async (callback) => {
      await client.query("SAVEPOINT publisher_command");
      try {
        const result = await callback(client);
        await client.query("RELEASE SAVEPOINT publisher_command");
        return result;
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT publisher_command");
        await client.query("RELEASE SAVEPOINT publisher_command");
        throw error;
      }
    },
  };
  const pgReceipts = new CommandReceiptService(pgDatabase);
  const profiles = new PublisherProfileService(pgDatabase, pgReceipts);
  const pgResult = await profiles.save(
    pgOwner,
    body,
    randomUUID(),
    undefined,
    randomUUID(),
  );
  assert.equal(pgResult.status, 201);
  assert.equal(
    (await profiles.save(pgOwner, changed, randomUUID(), '"1"', randomUUID()))
      .data.revision,
    "2",
  );
  const beforeFault = (await profiles.get(pgOwner)).profile;
  const faultyReceipts = {
    read: (...args) => pgReceipts.read(...args),
    write: async () => {
      throw new Error("Injected receipt persistence failure");
    },
  };
  await assert.rejects(
    new PublisherProfileService(pgDatabase, faultyReceipts).save(
      pgOwner,
      body,
      randomUUID(),
      '"2"',
      randomUUID(),
    ),
    /Injected receipt/,
  );
  assert.deepEqual((await profiles.get(pgOwner)).profile, beforeFault);
  assert.equal(
    (
      await client.query(
        "SELECT id FROM travel.audit_events WHERE subject_owner_user_id=$1 AND target_type='PUBLISHER_PROFILE'",
        [pgOwner],
      )
    ).rowCount,
    2,
  );
  assert.equal(
    (
      await client.query(
        "SELECT id FROM travel.outbox_events WHERE owner_user_id=$1",
        [pgOwner],
      )
    ).rowCount,
    2,
  );
  await client.query("ROLLBACK");
  client.release();
  client = undefined;
  report.checks.push(
    "PostgreSQL executes profile creation and trigger-based revisions, and an injected receipt failure rolls back profile, audit and outbox changes together inside a rolled-back verification transaction",
  );

  server = await preview({
    root: path.join(root, "apps/web"),
    configFile: path.join(root, "apps/web/vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": { target: apiBase } },
    },
  });
  const address = server.httpServer.address();
  const webBase = `http://127.0.0.1:${address.port}`;
  process.env.WEB_ORIGIN = webBase;
  browser = await chromium.launch();
  const ui = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await ui.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.data_mode = "live";
    await route.fulfill({ json: payload });
  });
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(webBase + "/publisher/settings?entry=verification#profile");
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(second.email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page
    .locator(".auth-card")
    .getByRole("button", { name: "登录", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "开通发布者工作区",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog
    .getByRole("button", { name: "返回消费者工作区", exact: true })
    .click();
  await expect(page).toHaveURL(webBase + "/me/home");
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [second.user.id],
      )
    ).rows.length,
    0,
  );
  report.checks.push(
    "anonymous publisher intent survives password login, requires an explicit unchecked consent and can return to the consumer workspace without creating a profile",
  );

  await page.goto(webBase + "/publisher/settings?entry=verification#profile");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("公开昵称", { exact: true }).fill("浏览器验证工作室");
  await dialog
    .getByLabel("服务简介与联系说明", { exact: true })
    .fill("提供自定义脚本服务，公开联系说明。 ");
  await dialog
    .getByRole("button", { name: "开通并进入工作区", exact: true })
    .click();
  await expect(
    dialog.getByText("请阅读并同意发布者服务约定", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "阅读服务约定 V3.0", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "发布者服务约定 V3.0", exact: true }),
  ).toContainText(empty.terms.paragraphs[0]);
  await page
    .getByRole("dialog", { name: "发布者服务约定 V3.0", exact: true })
    .getByRole("button", { name: "关闭", exact: true })
    .last()
    .click();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "开通并进入工作区", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "发布者设置", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    webBase + "/publisher/settings?entry=verification#profile",
  );
  await expect(page.getByLabel("公开昵称", { exact: true })).toHaveValue(
    "浏览器验证工作室",
  );
  await expect(page.getByLabel("联系邮箱", { exact: true })).toHaveCount(0);
  await page.getByLabel("公开昵称", { exact: true }).fill("持久化后的工作室");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(
    page.getByText("发布者资料已保存", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("公开昵称", { exact: true })).toHaveValue(
    "持久化后的工作室",
  );
  assert.equal(
    (
      await database.query(
        "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [second.user.id],
      )
    ).rows[0].revision,
    "2",
  );
  report.checks.push(
    "explicit profile creation refreshes publisher access and the full original route, and settings saves public fields durably without inventing a contact-email database field",
  );

  const externalEdit = (
    await database.query(
      "UPDATE travel.publisher_profiles SET public_name='外部更新资料' WHERE owner_user_id=$1 RETURNING revision::text",
      [second.user.id],
    )
  ).rows[0];
  await page.getByLabel("公开昵称", { exact: true }).fill("过期页面提交");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加载最新资料", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "加载最新资料", exact: true }).click();
  await expect(page.getByLabel("公开昵称", { exact: true })).toHaveValue(
    "外部更新资料",
  );
  assert.equal(
    (
      await database.query(
        "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [second.user.id],
      )
    ).rows[0].revision,
    externalEdit.revision,
  );
  report.checks.push(
    "a stale settings form displays revision conflict recovery and loads the newer profile without overwriting it",
  );
  await page.goto(webBase + "/publisher");
  await expect(
    page.getByRole("heading", { name: "发布者工作台", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("部署告警接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("销售退款接口待接入", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "全部服务", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("T202501200036")).toHaveCount(0);
  await expect(
    page.getByText("发布者服务概况接口待接入", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    1814,
  );
  report.checks.push(
    "the live publisher home renders empty counters and pending integration states without preview refunds or deployment alerts",
  );
  const prototype = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  expect(
    (
      await prototype.request.post(webBase + "/api/v1/auth/login", {
        data: {
          email: "publisher@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
  ).toBe(200);
  const prototypePage = await prototype.newPage();
  prototypePage.on("pageerror", (error) => report.errors.push(error.message));
  await prototypePage.goto(webBase + "/publisher");
  await expect(
    prototypePage.getByRole("heading", { name: "发布者工作台", exact: true }),
  ).toBeVisible();
  await expect(
    prototypePage.getByText("本地开发示例", { exact: true }),
  ).toBeVisible();
  report.layout = await prototypePage.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    helpBottom: document
      .querySelector(".consumer-sidebar-footer")
      .getBoundingClientRect().bottom,
  }));
  assert.deepEqual([report.layout.width, report.layout.height], [1814, 868]);
  assert.ok(report.layout.helpBottom <= 868);
  await prototypePage.screenshot({
    path: path.join(output, "PUBLISHER-S01.png"),
    fullPage: true,
  });
  report.screenshots.push("PUBLISHER-S01");
  await prototypePage
    .getByRole("button", { name: "上传脚本", exact: true })
    .click();
  await expect(
    prototypePage.getByRole("heading", { name: "我的脚本", exact: true }),
  ).toBeVisible();
  await prototypePage.goto(webBase + "/publisher");
  await prototypePage
    .getByRole("button", { name: "创建服务", exact: true })
    .first()
    .click();
  await expect(prototypePage).toHaveURL(
    webBase + "/publisher/services/new/edit",
  );
  await expect(
    prototypePage.getByRole("heading", { name: "编辑与上架服务", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "the publisher home fits its reference viewport with complete sidebar access and routes upload and service creation to their normal entry points",
  );
  await prototype.close();
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "the production-built publisher onboarding and profile workflow completes without browser exceptions",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  if (client) {
    await client.query("ROLLBACK");
    client.release();
  }
  await browser?.close();
  await server?.close();
  for (const context of contexts) await context.dispose();
  await guest?.dispose();
  await app?.close();
  await pool.end();
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  assert.equal(path.dirname(path.resolve(temporaryData)), localRoot);
  await rm(temporaryData, { recursive: true, force: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
