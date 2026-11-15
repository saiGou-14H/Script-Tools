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

loadEnvFile(path.resolve(process.argv[2] || ".env"));
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

async function holdNextResponse(currentPage, pattern, method) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let captured = false;
  let finished = false;
  let status;
  let count = 0;
  const handler = async (route) => {
    if (route.request().method() !== method) {
      await route.continue();
      return;
    }
    count += 1;
    if (captured) {
      await route.continue();
      return;
    }
    captured = true;
    const response = await route.fetch();
    status = response.status();
    await gate;
    await route.fulfill({ response });
    finished = true;
  };
  await currentPage.route(pattern, handler);
  return {
    wait: (expectedStatus = 200) =>
      expect.poll(() => status).toBe(expectedStatus),
    release: () => release(),
    count: () => count,
    dispose: async () => {
      release();
      await expect.poll(() => finished).toBe(true);
      await currentPage.unroute(pattern, handler);
    },
  };
}

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

  const delayedProfile = await holdNextResponse(
    page,
    "**/api/v1/me/publisher-profile",
    "POST",
  );
  try {
    await page.getByLabel("公开昵称", { exact: true }).fill("正在提交的工作室");
    await page
      .getByLabel("服务简介", { exact: true })
      .fill("已提交的公开服务说明");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await delayedProfile.wait();
    await page
      .getByLabel("公开昵称", { exact: true })
      .fill("提交期间的新工作室");
    await page
      .getByLabel("服务简介", { exact: true })
      .fill("提交期间的新服务说明");
    delayedProfile.release();
    await expect(
      page.getByText("已保存提交的资料，当前新增输入尚未保存。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("公开昵称", { exact: true })).toHaveValue(
      "提交期间的新工作室",
    );
    await expect(page.getByLabel("服务简介", { exact: true })).toHaveValue(
      "提交期间的新服务说明",
    );
    await expect(
      page.getByRole("button", { name: "保存设置", exact: true }),
    ).not.toHaveClass(/ant-btn-loading/);
    assert.equal(
      (
        await database.query(
          "SELECT public_name FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [second.user.id],
        )
      ).rows[0].public_name,
      "正在提交的工作室",
    );
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(
      page.getByText("已保存提交的资料，当前新增输入尚未保存。", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "保存设置", exact: true }),
    ).not.toHaveClass(/ant-btn-loading/);
    assert.equal(delayedProfile.count(), 2);
    const persisted = (
      await database.query(
        "SELECT public_name,description,revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [second.user.id],
      )
    ).rows[0];
    assert.deepEqual(persisted, {
      public_name: "提交期间的新工作室",
      description: "提交期间的新服务说明",
      revision: "4",
    });
  } finally {
    await delayedProfile.dispose();
  }
  report.checks.push(
    "settings preserve fields entered during an in-flight write, show the unsaved draft and use the committed revision for a second explicit save",
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
    "过期页面提交",
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
  await expect(
    page.getByText("最新资料已加载，已保留当前编辑内容，请核对后再次保存。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存设置", exact: true }),
  ).not.toHaveClass(/ant-btn-loading/);
  assert.equal(
    (
      await database.query(
        "SELECT public_name FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [second.user.id],
      )
    ).rows[0].public_name,
    "过期页面提交",
  );
  report.checks.push(
    "conflict recovery loads the current revision while retaining typed fields and leaves the external write intact until the user explicitly submits again",
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

  const mainPage = page;
  async function onboardingFlow(name) {
    const owner = await account();
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    expect(
      (
        await context.request.post(webBase + "/api/v1/auth/login", {
          data: { email: owner.email, password },
        })
      ).status(),
    ).toBe(200);
    const currentPage = await context.newPage();
    page = currentPage;
    currentPage.on("pageerror", (error) => report.errors.push(error.message));
    const target = webBase + "/publisher/settings?entry=" + name + "#profile";
    await currentPage.goto(target);
    const access = currentPage.getByRole("dialog", {
      name: "开通发布者工作区",
      exact: true,
    });
    await expect(access).toBeVisible();
    await access.getByLabel("公开昵称", { exact: true }).fill(name + "工作室");
    await access
      .getByLabel("服务简介与联系说明", { exact: true })
      .fill(name + "的公开服务说明");
    await access.getByRole("checkbox").check();
    return { owner, context, page: currentPage, dialog: access, target };
  }
  const recovering = await onboardingFlow("recover");
  let failBootstrap = false;
  const bootstrapFailure = async (route) => {
    if (failBootstrap)
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "VERIFICATION_READ_FAILURE",
            message: "测试身份读取失败",
          },
        },
      });
    else await route.continue();
  };
  await recovering.page.route("**/api/v1/bootstrap", bootstrapFailure);
  const createdBeforeReadFailure = await holdNextResponse(
    recovering.page,
    "**/api/v1/me/publisher-profile",
    "POST",
  );
  try {
    await recovering.dialog
      .getByRole("button", { name: "开通并进入工作区", exact: true })
      .click();
    await createdBeforeReadFailure.wait(201);
    failBootstrap = true;
    createdBeforeReadFailure.release();
    await expect(
      recovering.dialog.getByText("资料已保存，后续状态暂时无法刷新", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(createdBeforeReadFailure.count(), 1);
    assert.equal(
      (
        await database.query(
          "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [recovering.owner.user.id],
        )
      ).rows[0].revision,
      "1",
    );
    failBootstrap = false;
    await recovering.dialog
      .getByRole("button", { name: "重试后续操作", exact: true })
      .click();
    await expect(
      recovering.page.getByRole("heading", { name: "发布者设置", exact: true }),
    ).toBeVisible();
    await expect(recovering.page).toHaveURL(recovering.target);
    assert.equal(createdBeforeReadFailure.count(), 1);
    assert.equal(
      (
        await database.query(
          "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [recovering.owner.user.id],
        )
      ).rows[0].revision,
      "1",
    );
  } finally {
    failBootstrap = false;
    await createdBeforeReadFailure.dispose();
    await recovering.page.unroute("**/api/v1/bootstrap", bootstrapFailure);
  }
  await recovering.context.close();
  page = mainPage;
  report.checks.push(
    "onboarding distinguishes a committed profile from a failed identity refresh, and retrying the follow-up enters the original route without repeating the profile command",
  );

  const cancelled = await onboardingFlow("cancelled");
  const delayedEntry = await holdNextResponse(
    cancelled.page,
    "**/api/v1/bootstrap",
    "GET",
  );
  try {
    await cancelled.dialog
      .getByRole("button", { name: "开通并进入工作区", exact: true })
      .click();
    await delayedEntry.wait();
    await expect(
      cancelled.dialog.getByLabel("公开昵称", { exact: true }),
    ).toBeDisabled();
    await cancelled.dialog
      .getByRole("button", { name: "返回消费者工作区", exact: true })
      .click();
    await expect(cancelled.page).toHaveURL(webBase + "/me/home");
    delayedEntry.release();
    await delayedEntry.dispose();
    await cancelled.page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(cancelled.page).toHaveURL(webBase + "/me/home");
    await expect(cancelled.page.locator(".app-shell.role-USER")).toBeVisible();
    assert.equal(
      (
        await database.query(
          "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [cancelled.owner.user.id],
        )
      ).rows[0].revision,
      "1",
    );
  } finally {
    await delayedEntry.dispose();
  }
  await cancelled.context.close();
  page = mainPage;
  report.checks.push(
    "returning to the consumer workspace while the post-creation identity response is delayed retains that destination after the response arrives and preserves the explicitly created profile",
  );

  const continuing = await onboardingFlow("continue");
  const delayedCreation = await holdNextResponse(
    continuing.page,
    "**/api/v1/me/publisher-profile",
    "POST",
  );
  try {
    await continuing.dialog
      .getByRole("button", { name: "开通并进入工作区", exact: true })
      .click();
    await delayedCreation.wait(201);
    await continuing.dialog
      .getByLabel("公开昵称", { exact: true })
      .fill("继续编辑的工作室");
    await continuing.dialog
      .getByLabel("服务简介与联系说明", { exact: true })
      .fill("继续编辑的公开服务说明");
    delayedCreation.release();
    await expect(
      continuing.dialog.getByRole("button", {
        name: "使用已保存资料进入",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      continuing.dialog.getByLabel("公开昵称", { exact: true }),
    ).toHaveValue("继续编辑的工作室");
    assert.equal(
      (
        await database.query(
          "SELECT public_name FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [continuing.owner.user.id],
        )
      ).rows[0].public_name,
      "continue工作室",
    );
    await continuing.dialog
      .getByRole("button", { name: "开通并进入工作区", exact: true })
      .click();
    await expect(
      continuing.page.getByRole("heading", { name: "发布者设置", exact: true }),
    ).toBeVisible();
    await expect(
      continuing.page.getByLabel("公开昵称", { exact: true }),
    ).toHaveValue("继续编辑的工作室");
    assert.equal(delayedCreation.count(), 2);
    assert.equal(
      (
        await database.query(
          "SELECT revision::text FROM travel.publisher_profiles WHERE owner_user_id=$1",
          [continuing.owner.user.id],
        )
      ).rows[0].revision,
      "2",
    );
  } finally {
    await delayedCreation.dispose();
  }
  await continuing.context.close();
  page = mainPage;
  report.checks.push(
    "onboarding retains input entered during creation and waits for an explicit saved-profile continuation or a second revision-checked save before entering the publisher workspace",
  );

  const staleTerms = await onboardingFlow("terms");
  const outdatedTerms = async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.terms.version = "V2.0";
    await route.fulfill({ response, json: payload });
  };
  await staleTerms.page.route("**/api/v1/me/publisher-profile", outdatedTerms);
  await staleTerms.page.reload();
  await expect(
    staleTerms.dialog.getByRole("button", {
      name: "阅读服务约定 V2.0",
      exact: true,
    }),
  ).toBeVisible();
  await staleTerms.dialog
    .getByLabel("公开昵称", { exact: true })
    .fill("保留输入的新版约定工作室");
  await staleTerms.dialog
    .getByLabel("服务简介与联系说明", { exact: true })
    .fill("确认当前约定后的公开说明");
  await staleTerms.dialog.getByRole("checkbox").check();
  await staleTerms.dialog
    .getByRole("button", { name: "开通并进入工作区", exact: true })
    .click();
  await expect(
    staleTerms.dialog.getByRole("button", {
      name: "加载最新资料",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [staleTerms.owner.user.id],
      )
    ).rows.length,
    0,
  );
  await staleTerms.page.unroute(
    "**/api/v1/me/publisher-profile",
    outdatedTerms,
  );
  await staleTerms.dialog
    .getByRole("button", { name: "加载最新资料", exact: true })
    .click();
  await expect(
    staleTerms.dialog.getByRole("button", {
      name: "阅读服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    staleTerms.dialog.getByLabel("公开昵称", { exact: true }),
  ).toHaveValue("保留输入的新版约定工作室");
  await expect(staleTerms.dialog.getByRole("checkbox")).not.toBeChecked();
  await staleTerms.dialog
    .getByRole("button", { name: "开通并进入工作区", exact: true })
    .click();
  await expect(
    staleTerms.dialog.getByText("请阅读并同意发布者服务约定", { exact: true }),
  ).toBeVisible();
  await staleTerms.dialog.getByRole("checkbox").check();
  await staleTerms.dialog
    .getByRole("button", { name: "开通并进入工作区", exact: true })
    .click();
  await expect(
    staleTerms.page.getByRole("heading", { name: "发布者设置", exact: true }),
  ).toBeVisible();
  assert.equal(
    (
      await database.query(
        "SELECT terms_version FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [staleTerms.owner.user.id],
      )
    ).rows[0].terms_version,
    "V3.0",
  );
  await staleTerms.context.close();
  page = mainPage;
  report.checks.push(
    "a rejected stale terms version offers metadata reload, retains edited profile fields and requires a fresh explicit consent before the real creation command succeeds",
  );

  const prototype = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  const prototypeLogin = await prototype.request.post(
    webBase + "/api/v1/auth/login",
    {
      data: {
        email: "publisher@example.invalid",
        password: "TravelTools2026!",
      },
    },
  );
  expect(prototypeLogin.status()).toBe(200);
  const prototypeUser = (await prototypeLogin.json()).data.user;
  const prototypePage = await prototype.newPage();
  page = prototypePage;
  prototypePage.on("pageerror", (error) => report.errors.push(error.message));
  await prototypePage.goto(webBase + "/publisher");
  await expect(
    prototypePage.getByRole("heading", { name: "发布者工作台", exact: true }),
  ).toBeVisible();
  await expect(
    prototypePage.getByText("本地开发示例", { exact: true }),
  ).toBeVisible();
  await prototypePage.evaluate(() => document.fonts.ready);
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
    animations: "disabled",
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

  page = prototypePage;
  await prototypePage.setViewportSize({ width: 1812, height: 868 });
  await prototypePage.goto(
    webBase + "/publisher/settings?entry=settings#profile",
  );
  await expect(
    prototypePage.getByLabel("公开昵称", { exact: true }),
  ).toHaveValue("数据工坊");
  await expect(prototypePage.getByRole("checkbox")).toHaveCount(0);
  await expect(
    prototypePage.getByText(/联系邮箱、收款账户与技术验证为本地预览/),
  ).toBeVisible();
  await prototypePage.evaluate(() => document.fonts.ready);
  report.settings_layout = await prototypePage.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      columns: rect(".publisher-settings-columns"),
      notice: rect(".publisher-settings-page > .notice"),
      save: rect(".publisher-settings-save"),
    };
  });
  assert.equal(report.settings_layout.width, 1812);
  assert.equal(report.settings_layout.height, 868);
  await expect(
    prototypePage.getByRole("button", { name: "保存设置", exact: true }),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await prototypePage.screenshot({
    path: path.join(output, "PUBLISHER-S15.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("PUBLISHER-S15");

  const concurrentSettings = await holdNextResponse(
    prototypePage,
    "**/api/v1/me/publisher-profile",
    "POST",
  );
  try {
    await prototypePage
      .getByLabel("公开昵称", { exact: true })
      .fill("并发设置验证工作室");
    await prototypePage
      .getByLabel("服务简介", { exact: true })
      .fill("提供公开服务与联系说明");
    await prototypePage
      .getByRole("button", { name: "保存设置", exact: true })
      .click();
    await concurrentSettings.wait();
    await prototypePage
      .getByLabel("联系邮箱", { exact: true })
      .fill(" next-contact@example.invalid ");
    await prototypePage
      .getByRole("button", { name: "更新收款资料", exact: true })
      .click();
    await prototypePage
      .getByLabel("收款账户令牌", { exact: true })
      .fill("concurrent-account-9087");
    await prototypePage
      .getByRole("button", { name: "保存资料预览", exact: true })
      .click();
    await expect(
      prototypePage.getByText("********9087", { exact: true }),
    ).toBeVisible();
    concurrentSettings.release();
    await expect(
      prototypePage.getByText("已保存提交的资料，当前新增输入尚未保存。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      prototypePage.getByRole("button", { name: "保存设置", exact: true }),
    ).not.toHaveClass(/ant-btn-loading/);
    await expect(
      prototypePage.getByText("********9087", { exact: true }),
    ).toBeVisible();
    await expect(
      prototypePage.getByLabel("联系邮箱", { exact: true }),
    ).toHaveValue(" next-contact@example.invalid ");
    await prototypePage
      .getByRole("button", { name: "保存设置", exact: true })
      .click();
    await expect(
      prototypePage.getByRole("button", { name: "保存设置", exact: true }),
    ).not.toHaveClass(/ant-btn-loading/);
    await expect(
      prototypePage.getByLabel("联系邮箱", { exact: true }),
    ).toHaveValue("next-contact@example.invalid");
    await expect(
      prototypePage.getByText("********9087", { exact: true }),
    ).toBeVisible();
  } finally {
    await concurrentSettings.dispose();
  }
  report.checks.push(
    "concurrent public-profile and payout previews merge their independent fields, preserve newly typed preview email, trim it on explicit save and retain the updated unverified account mask",
  );
  await prototypePage
    .getByLabel("公开昵称", { exact: true })
    .fill("读取失败时保留的昵称");
  await prototypePage
    .getByLabel("服务简介", { exact: true })
    .fill("读取失败时保留的公开说明");
  let failedReadAttempts = 0;
  const failedProfileRead = async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    failedReadAttempts += 1;
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: "VERIFICATION_READ_FAILURE",
          message: "测试资料读取失败",
        },
      },
    });
  };
  await prototypePage.route(
    "**/api/v1/me/publisher-profile",
    failedProfileRead,
  );
  await prototypePage.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(
    prototypePage.getByText("发布者资料暂时无法加载", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  assert.ok(failedReadAttempts > 0);
  await expect(
    prototypePage.getByLabel("公开昵称", { exact: true }),
  ).toHaveValue("读取失败时保留的昵称");
  await expect(
    prototypePage.getByLabel("服务简介", { exact: true }),
  ).toHaveValue("读取失败时保留的公开说明");
  await expect(
    prototypePage.getByRole("button", { name: "保存设置", exact: true }),
  ).toBeEnabled();
  await prototypePage
    .getByRole("button", { name: "阅读服务约定 V3.0", exact: true })
    .click();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  await prototypePage
    .getByRole("dialog", { name: "发布者服务约定 V3.0", exact: true })
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await prototypePage.unroute(
    "**/api/v1/me/publisher-profile",
    failedProfileRead,
  );
  await prototypePage
    .locator(".publisher-settings-read-error")
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(
    prototypePage.locator(".publisher-settings-read-error"),
  ).toHaveCount(0);
  await expect(
    prototypePage.getByLabel("公开昵称", { exact: true }),
  ).toHaveValue("读取失败时保留的昵称");
  await expect(
    prototypePage.getByLabel("服务简介", { exact: true }),
  ).toHaveValue("读取失败时保留的公开说明");
  assert.equal(
    (
      await database.query(
        "SELECT public_name FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [prototypeUser.id],
      )
    ).rows[0].public_name,
    "并发设置验证工作室",
  );
  report.checks.push(
    "a failed background metadata read keeps the loaded editor and dirty fields mounted, preserves terms access, and retries the read without a profile write",
  );
  await prototypePage.keyboard.press("Control+k");
  await expect(prototypePage.locator(".global-search input")).toBeFocused();
  await prototypePage
    .getByRole("button", { name: "阅读服务约定 V3.0", exact: true })
    .click();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(new URL(prototypePage.url()).hash, "#profile");
  await prototypePage.reload();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  await prototypePage.goBack();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toHaveCount(0);
  await prototypePage.goForward();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  await prototypePage
    .getByRole("dialog", { name: "发布者服务约定 V3.0", exact: true })
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await prototypePage
    .getByRole("button", { name: "更新收款资料", exact: true })
    .click();
  await prototypePage
    .getByLabel("收款账户令牌", { exact: true })
    .fill("unsaved-payout-token");
  await prototypePage.reload();
  const payoutDialog = prototypePage.getByRole("dialog", {
    name: "更新收款资料",
    exact: true,
  });
  await expect(payoutDialog).toBeVisible();
  await expect(
    payoutDialog.getByLabel("收款账户令牌", { exact: true }),
  ).toHaveValue("");
  await payoutDialog.getByLabel("收款账户令牌", { exact: true }).fill("      ");
  await payoutDialog
    .getByRole("button", { name: "保存资料预览", exact: true })
    .click();
  await expect(
    payoutDialog.getByText("请填写收款账户令牌", { exact: true }),
  ).toBeVisible();
  await payoutDialog.getByRole("button", { name: "取消", exact: true }).click();
  await prototypePage.goBack();
  await expect(payoutDialog).toBeVisible();
  await expect(
    payoutDialog.getByLabel("收款账户令牌", { exact: true }),
  ).toHaveValue("");
  await payoutDialog
    .getByLabel("收款账户令牌", { exact: true })
    .fill(" preview-account-5678 ");
  await payoutDialog
    .getByRole("button", { name: "保存资料预览", exact: true })
    .click();
  await expect(payoutDialog).toHaveCount(0);
  await expect(
    prototypePage.getByText("********5678", { exact: true }),
  ).toBeVisible();
  await expect(
    prototypePage.getByText("待验证", { exact: true }),
  ).toBeVisible();
  await prototypePage.goto(
    webBase +
      "/publisher/settings?workspace=PUBLISHER&entry=settings&dialog=missing#profile",
  );
  await expect(
    prototypePage.getByText("发布者设置入口不可用", { exact: true }),
  ).toBeVisible();
  await prototypePage
    .getByRole("button", { name: "返回设置", exact: true })
    .click();
  assert.equal(
    new URL(prototypePage.url()).searchParams.get("entry"),
    "settings",
  );
  assert.equal(
    new URL(prototypePage.url()).searchParams.get("workspace"),
    "PUBLISHER",
  );
  assert.equal(new URL(prototypePage.url()).searchParams.get("dialog"), null);
  assert.equal(new URL(prototypePage.url()).hash, "#profile");
  await prototypePage.setViewportSize({ width: 390, height: 844 });
  await expect(
    prototypePage.getByLabel("公开昵称", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await prototypePage.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await prototypePage
    .getByRole("button", { name: "阅读服务约定 V3.0", exact: true })
    .click();
  await expect(
    prototypePage.getByRole("dialog", {
      name: "发布者服务约定 V3.0",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    await prototypePage.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await mainPage.goto(
    webBase + "/publisher/settings?entry=live&dialog=payout#profile",
  );
  await expect(
    mainPage.getByRole("dialog", { name: "更新收款资料", exact: true }),
  ).toContainText("收款资料与技术验证接口待接入");
  await expect(
    mainPage.getByLabel("收款账户令牌", { exact: true }),
  ).toHaveCount(0);
  await mainPage
    .getByRole("dialog", { name: "更新收款资料", exact: true })
    .getByRole("button", { name: "返回设置", exact: true })
    .click();
  assert.equal(new URL(mainPage.url()).searchParams.get("entry"), "live");
  assert.equal(new URL(mainPage.url()).hash, "#profile");
  report.checks.push(
    "publisher settings match the desktop regions and 390px layout, retain keyboard search and URL-restored terms/payout dialogs, clear unsubmitted tokens, reject whitespace credentials and keep live payout configuration pending",
  );
  await prototype.close();
  page = mainPage;
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "the production-built publisher onboarding and profile workflow completes without browser exceptions",
  );
  report.result = "PASS";
  await rm(path.join(output, "failure.png"), { force: true });
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
