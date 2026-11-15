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
const root = process.cwd(),
  output = path.resolve("output/verification/account-pages"),
  localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "account-verification-" + randomUUID(),
);
assert.equal(path.dirname(temporaryData), localRoot);
await mkdir(output, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const previous = Object.fromEntries(
  [
    "DATABASE_URL",
    "LOCAL_DATA_DIRECTORY",
    "DEV_SEED",
    "NODE_ENV",
    "WEB_ORIGIN",
  ].map((key) => [key, process.env[key]]),
);
delete process.env.DATABASE_URL;
process.env.LOCAL_DATA_DIRECTORY = temporaryData;
process.env.DEV_SEED = "true";
process.env.NODE_ENV = "development";
const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core"),
  cookieParser = require("cookie-parser");
const { AppModule } = require("../apps/control-api/dist/app.module.js");
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  AccountService,
} = require("../apps/control-api/dist/account/account.service.js");
const {
  CommandReceiptService,
} = require("../apps/control-api/dist/common/command-receipt.service.js");
const {
  PaginationService,
} = require("../apps/control-api/dist/common/pagination.service.js");
const {
  AuthService,
  digest,
} = require("../apps/control-api/dist/auth/auth.service.js");
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
  layouts: {},
};
const password = "AccountVerification!" + randomUUID(),
  contexts = [];
let app, server, browser, guest, page, connection;
async function holdNextResponse(currentPage, pattern, method) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let captured = false;
  let finished = false;
  let status;
  const handler = async (route) => {
    if (captured || route.request().method() !== method) {
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
    wait: () => expect.poll(() => status).toBe(200),
    release: () => release(),
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
  const base = await app.getUrl(),
    database = app.get(DatabaseService);
  guest = await request.newContext({ baseURL: base });
  async function login(
    email,
    secret = password,
    userAgent = "Mozilla/5.0 (Windows NT 10.0) Chrome/149.0",
  ) {
    const context = await request.newContext({ baseURL: base, userAgent });
    contexts.push(context);
    const response = await context.post("/api/v1/auth/login", {
      data: { email, password: secret },
    });
    expect(response.status()).toBe(200);
    return { email, context, ...(await response.json()).data };
  }
  async function register() {
    const email = "account-" + randomUUID() + "@example.invalid";
    const pending = await guest.post("/api/v1/auth/register", {
      data: { email, password, accepted_terms_version: "V3.0" },
    });
    expect(pending.status()).toBe(202);
    const challenge = (await pending.json()).data;
    expect(
      (
        await guest.post("/api/v1/auth/verify-email", {
          data: {
            challenge_id: challenge.challenge_id,
            token: challenge.development_token,
          },
        })
      ).status(),
    ).toBe(200);
    return login(email);
  }
  const first = await register(),
    second = await register();
  async function me(actor) {
    const result = await actor.context.get("/api/v1/me");
    expect(result.status()).toBe(200);
    return (await result.json()).data;
  }
  function headers(actor, key = randomUUID(), revision) {
    return {
      "X-CSRF-Token": actor.csrf_token,
      "Idempotency-Key": key,
      ...(revision ? { "If-Match": '"' + revision + '"' } : {}),
    };
  }
  const profile = await me(first);
  assert.match(profile.email_mask, /^a\*\*\*@example\.invalid$/);
  assert.equal(profile.current_session.client_summary, "Windows · Chrome");
  assert.equal(typeof profile.security_revision, "string");
  for (const forbidden of [
    "password_hash",
    "token_hash",
    "email_normalized",
    first.email,
  ])
    assert.equal(JSON.stringify(profile).includes(forbidden), false);
  expect((await guest.get("/api/v1/me")).status()).toBe(401);
  expect((await first.context.get("/api/v1/me?owner=other")).status()).toBe(
    422,
  );
  expect(
    (
      await first.context.patch("/api/v1/me", { data: { display_name: "x" } })
    ).status(),
  ).toBe(403);
  for (const body of [
    {},
    { display_name: " " },
    { display_name: "a".repeat(121) },
    { roles: ["ADMIN"] },
    { email: "other@example.invalid" },
    { locale: "not_a_locale" },
    { timezone: "invalid-zone" },
  ])
    expect(
      (
        await first.context.patch("/api/v1/me", {
          headers: headers(first),
          data: body,
        })
      ).status(),
    ).toBe(422);
  expect(
    (
      await first.context.patch("/api/v1/me", {
        headers: headers(first),
        data: { display_name: "x" },
      })
    ).status(),
  ).toBe(428);
  report.checks.push(
    "account reads expose masked identity and fixed device hints, preserve string revisions and reject anonymous access, CSRF failures and unsupported or invalid profile fields",
  );
  await database.query(
    "DELETE FROM travel.user_preferences WHERE owner_user_id=$1",
    [first.user.id],
  );
  assert.equal((await me(first)).timezone, "Asia/Shanghai");
  const key = randomUUID(),
    body = { display_name: " 验证昵称 ", locale: "EN-us", timezone: "utc" };
  const savedResponse = await first.context.patch("/api/v1/me", {
    headers: headers(first, key, profile.revision),
    data: body,
  });
  expect(savedResponse.status()).toBe(200);
  const saved = (await savedResponse.json()).data;
  assert.equal(saved.display_name, "验证昵称");
  assert.equal(saved.locale, "en-US");
  assert.equal(saved.timezone, "UTC");
  assert.equal(saved.revision, (BigInt(profile.revision) + 1n).toString());
  const replay = await first.context.patch("/api/v1/me", {
    headers: headers(first, key, profile.revision),
    data: body,
  });
  assert.deepEqual((await replay.json()).data, saved);
  expect(
    (
      await first.context.patch("/api/v1/me", {
        headers: headers(first, key, saved.revision),
        data: { display_name: "异体" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await first.context.patch("/api/v1/me", {
        headers: headers(first, randomUUID(), profile.revision),
        data: { display_name: "过期" },
      })
    ).status(),
  ).toBe(412);
  const parallelKey = randomUUID();
  const parallel = await Promise.all(
    [1, 2].map(() =>
      first.context.patch("/api/v1/me", {
        headers: headers(first, parallelKey, saved.revision),
        data: { display_name: "并发资料" },
      }),
    ),
  );
  assert.deepEqual(
    parallel.map((response) => response.status()),
    [200, 200],
  );
  assert.equal(
    (await me(first)).revision,
    (BigInt(saved.revision) + 1n).toString(),
  );
  report.checks.push(
    "profile commands create legacy preferences, canonicalize locale and timezone, preserve original idempotent responses and serialize concurrent retries without losing revisions",
  );
  const token = (await first.context.storageState()).cookies.find(
    (cookie) => cookie.name === "session",
  ).value;
  const receipts = app.get(CommandReceiptService),
    pagination = app.get(PaginationService);
  const faulty = {
    read: (...args) => receipts.read(...args),
    write: async () => {
      throw new Error("Injected receipt failure");
    },
  };
  await assert.rejects(
    new AccountService(database, faulty, pagination).update(
      first.user.id,
      token,
      { display_name: "不应落库", timezone: "Asia/Tokyo" },
      randomUUID(),
      '"' + (BigInt(saved.revision) + 1n).toString() + '"',
      randomUUID(),
    ),
    /Injected receipt/,
  );
  assert.equal((await me(first)).display_name, "并发资料");
  assert.equal((await me(first)).timezone, "UTC");
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.audit_events WHERE subject_owner_user_id=$1 AND action='ACCOUNT_PROFILE_UPDATED'",
        [first.user.id],
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.outbox_events WHERE owner_user_id=$1 AND event_type='ACCOUNT_PROFILE_UPDATED'",
        [first.user.id],
      )
    ).rows.length,
    2,
  );
  const receipt = (
    await database.query(
      "SELECT r.resource_type,p.ciphertext FROM travel.idempotency_records r JOIN travel.private_payloads p ON p.id=r.response_payload_id WHERE r.owner_user_id=$1 AND r.key=$2",
      [first.user.id, key],
    )
  ).rows[0];
  assert.equal(receipt.resource_type, "USER");
  assert.equal(
    Buffer.from(receipt.ciphertext).includes(Buffer.from("验证昵称")),
    false,
  );
  report.checks.push(
    "profile, preferences, audit and outbox roll back together if receipt storage fails, and generic encrypted receipts retain the correct resource type",
  );
  const others = await Promise.all([1, 2, 3].map(() => login(first.email)));
  let cursor,
    all = [];
  do {
    const response = await first.context.get(
      "/api/v1/me/sessions?limit=1" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    expect(response.status()).toBe(200);
    const envelope = await response.json();
    all.push(...envelope.data);
    cursor = envelope.next_cursor;
    if (!cursor && all.length === 1)
      throw new Error("Expected paginated sessions");
  } while (cursor);
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map((item) => item.id)).size, 4);
  assert.equal(all.filter((item) => item.is_current).length, 1);
  const firstPage = await (
    await first.context.get("/api/v1/me/sessions?limit=1")
  ).json();
  expect(
    (
      await second.context.get(
        "/api/v1/me/sessions?limit=1&cursor=" +
          encodeURIComponent(firstPage.next_cursor),
      )
    ).status(),
  ).toBe(422);
  assert.equal(JSON.stringify(all).includes("token_hash"), false);
  const target = all.find((item) => !item.is_current);
  expect(
    (
      await second.context.delete("/api/v1/me/sessions/" + target.id, {
        headers: headers(second),
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await first.context.delete("/api/v1/me/sessions/" + target.id, {
        headers: headers(first),
        data: {},
      })
    ).status(),
  ).toBe(428);
  const deleteKey = randomUUID();
  const removed = await first.context.delete(
    "/api/v1/me/sessions/" + target.id,
    { headers: headers(first, deleteKey, target.revision), data: {} },
  );
  expect(removed.status()).toBe(200);
  const retry = await first.context.delete("/api/v1/me/sessions/" + target.id, {
    headers: headers(first, deleteKey, target.revision),
    data: {},
  });
  assert.deepEqual((await retry.json()).data, (await removed.json()).data);
  report.checks.push(
    "session lists use owner-bound signed pagination and safe metadata, and individual revocation requires ownership, CSRF, idempotency and the displayed revision",
  );
  const bulkKey = randomUUID();
  const bulk = await first.context.delete("/api/v1/me/sessions/others", {
    headers: headers(first, bulkKey),
    data: {},
  });
  expect(bulk.status()).toBe(200);
  const bulkData = (await bulk.json()).data;
  assert.equal(bulkData.revoked_count, "2");
  assert.equal(bulkData.current_session_id, profile.current_session.id);
  const bulkReplay = await first.context.delete("/api/v1/me/sessions/others", {
    headers: headers(first, bulkKey),
    data: {},
  });
  assert.deepEqual((await bulkReplay.json()).data, bulkData);
  for (const other of others)
    expect((await other.context.get("/api/v1/me")).status()).toBe(401);
  const current = await me(first);
  assert.equal(current.security_revision, profile.security_revision);
  const currentKey = randomUUID();
  const currentDelete = await first.context.delete(
    "/api/v1/me/sessions/" + current.current_session.id,
    {
      headers: headers(first, currentKey, current.current_session.revision),
      data: {},
    },
  );
  expect(currentDelete.status()).toBe(200);
  expect((await first.context.get("/api/v1/me")).status()).toBe(401);
  const fresh = await login(first.email);
  const oldReplay = await fresh.context.delete(
    "/api/v1/me/sessions/" + current.current_session.id,
    {
      headers: headers(fresh, currentKey, current.current_session.revision),
      data: {},
    },
  );
  expect(oldReplay.status()).toBe(200);
  await me(fresh);
  report.checks.push(
    "bulk revocation preserves the current session, current-session deletion accounts for its own activity touch, and replay from a later session preserves that later session's cookie",
  );
  const admin = await login("admin@example.invalid", "TravelTools2026!");
  assert.equal((await me(admin)).is_last_access_manager, true);
  const grant = randomUUID();
  await database.query(
    "INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,granted_by,reason) VALUES($1,$2,ARRAY['access.manage'],$3,'Verification')",
    [grant, first.user.id, admin.user.id],
  );
  assert.equal((await me(admin)).is_last_access_manager, false);
  await database.query(
    "UPDATE travel.management_role_grants SET revoked_at=now() WHERE id=$1",
    [grant],
  );
  assert.equal((await me(admin)).is_last_access_manager, true);
  report.checks.push(
    "the last persistent access-manager indicator follows active grants and does not fabricate workspace privileges",
  );
  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const pgOwner = randomUUID(),
    pgToken = randomUUID(),
    security = "9223372036854775806";
  await connection.query(
    "INSERT INTO travel.users(id,email_normalized,password_hash,display_name,status,verified_at,security_revision) VALUES($1,$2,$3,'事务验证','ACTIVE',now(),$4)",
    [
      pgOwner,
      "account-pg-" + randomUUID() + "@example.invalid",
      hashPassword(password),
      security,
    ],
  );
  await connection.query(
    "INSERT INTO travel.auth_sessions(id,owner_user_id,token_hash,security_revision,authenticated_at,last_seen_at,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,now(),now(),now()+interval '1 hour')",
    [pgOwner, digest(pgToken), security],
  );
  const pgDatabase = {
    root,
    query: (...args) => connection.query(...args),
    transaction: async (callback) => {
      await connection.query("SAVEPOINT account_command");
      try {
        const result = await callback(connection);
        await connection.query("RELEASE SAVEPOINT account_command");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK TO SAVEPOINT account_command");
        throw error;
      }
    },
  };
  const pgService = new AccountService(
    pgDatabase,
    new CommandReceiptService(pgDatabase),
    new PaginationService(pgDatabase),
  );
  const pgActor = await new AuthService(pgDatabase).userForSession(pgToken);
  assert.equal(pgActor.security_revision, security);
  const pgSaved = await pgService.update(
    pgOwner,
    pgToken,
    { display_name: "PostgreSQL资料", timezone: "Asia/Tokyo" },
    randomUUID(),
    '"1"',
    randomUUID(),
  );
  assert.equal(pgSaved.data.revision, "2");
  assert.equal((await pgService.get(pgActor, pgToken)).timezone, "Asia/Tokyo");
  await connection.query("ROLLBACK");
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL profile updates exercise real revision triggers and preference upserts while authentication preserves full BIGINT security revision precision in a rolled-back transaction",
  );
  server = await preview({
    root: path.join(root, "apps/web"),
    configFile: path.join(root, "apps/web/vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": { target: base } },
    },
  });
  const web = "http://127.0.0.1:" + server.httpServer.address().port;
  process.env.WEB_ORIGIN = web;
  browser = await chromium.launch();
  const ui = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  expect(
    (
      await ui.request.post(web + "/api/v1/auth/login", {
        data: { email: first.email, password },
      })
    ).status(),
  ).toBe(200);
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(web + "/me/settings/account");
  await expect(page.locator(".account-profile-content")).toContainText(
    "并发资料",
  );
  await page.getByRole("tab", { name: "账号安全", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("section"), "security");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "找回密码", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "账号安全", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "会话", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("dialog"), "sessions");
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "会话管理", exact: true }),
  ).toContainText("当前会话");
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "会话管理", exact: true }),
  ).toHaveCount(0);
  await page.goForward();
  await expect(
    page.getByRole("dialog", { name: "会话管理", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "会话管理", exact: true })
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("tab", { name: "账号注销", exact: true }).click();
  await page.getByRole("button", { name: "申请注销", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "账号注销前检查", exact: true }),
  ).toContainText("接口待接入");
  await page.getByRole("button", { name: "返回账户设置", exact: true }).click();
  await page.goto(
    web + "/me/settings/account?workspace=USER&section=missing&dialog=missing",
  );
  await expect(
    page.getByText("账户设置入口不可用", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回资料", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("workspace"), "USER");
  assert.equal(new URL(page.url()).searchParams.has("section"), false);
  assert.equal(new URL(page.url()).searchParams.has("dialog"), false);
  report.checks.push(
    "account sections, session lists and closure information restore through URLs and browser history, invalid entries recover within the selected workspace, and password changes reach the existing reset flow",
  );
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("界面修改昵称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("个人资料已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".account-profile-content")).toContainText(
    "界面修改昵称",
  );
  const pendingProfile = await holdNextResponse(page, "**/api/v1/me", "PATCH");
  try {
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("昵称", { exact: true }).fill("正在提交的昵称");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await pendingProfile.wait();
    await page.getByLabel("昵称", { exact: true }).fill("提交期间的新输入");
    pendingProfile.release();
    await expect(
      page.getByText("已保存提交的昵称，当前输入尚未保存。", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("昵称", { exact: true })).toHaveValue(
      "提交期间的新输入",
    );
    await expect(page.locator(".account-profile-content")).toContainText(
      "正在提交的昵称",
    );
    await expect(
      page.getByRole("button", { name: "保存", exact: true }),
    ).not.toHaveClass(/ant-btn-loading/);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "编辑昵称", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".account-profile-content")).toContainText(
      "提交期间的新输入",
    );
  } finally {
    await pendingProfile.dispose();
  }
  report.checks.push(
    "nickname input entered while a submitted write is in flight remains available for a second explicit save using the returned revision",
  );
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("界面保留输入");
  const outside = await me(fresh);
  expect(
    (
      await fresh.context.patch("/api/v1/me", {
        headers: headers(fresh, randomUUID(), outside.revision),
        data: { display_name: "其他页面资料" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加载最新资料", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "加载最新资料", exact: true }).click();
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue(
    "界面保留输入",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".account-profile-content")).toContainText(
    "界面保留输入",
  );
  report.checks.push(
    "nickname editing persists through the real built UI and database, and conflict recovery reloads the revision while retaining the user's typed intent for explicit resubmission",
  );
  const viewGrant = randomUUID();
  await database.query(
    "INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,granted_by,reason) VALUES($1,$2,ARRAY['access.manage'],$3,'Verification')",
    [viewGrant, first.user.id, admin.user.id],
  );
  await page.goto(web + "/me/settings/account?workspace=ADMIN");
  await expect(page.locator(".app-shell")).toHaveClass(/role-ADMIN/);
  await expect(
    page.getByRole("button", { name: "编辑资料", exact: true }),
  ).toBeEnabled();
  await database.query(
    "UPDATE travel.management_role_grants SET revoked_at=now() WHERE id=$1",
    [viewGrant],
  );
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("权限刷新后的昵称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/role-USER/);
  await expect(
    page.getByRole("radio", { name: "消费者", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".account-profile-content")).toContainText(
    "权限刷新后的昵称",
  );
  report.checks.push(
    "identity refresh removes a revoked administrator workspace from account settings and reloads private queries under the remaining personal role",
  );
  await expect(
    page.getByRole("radio", { name: "消费者", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "切换到发布者", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "开通发布者工作区", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "返回消费者工作区", exact: true })
    .click();
  assert.equal(
    (
      await database.query(
        "SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [first.user.id],
      )
    ).rows.length,
    0,
  );
  report.checks.push(
    "the account publisher entry reaches the existing explicit onboarding flow and cancellation preserves the original personal account",
  );
  await page.goto(web + "/me/settings/account");
  await page.getByRole("tab", { name: "会话", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "会话管理", exact: true }),
  ).toContainText("当前会话");
  await page
    .getByRole("dialog", { name: "会话管理", exact: true })
    .locator(".ant-modal-footer")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "退出其他会话", exact: true }).click();
  await page.getByRole("button", { name: "确认退出", exact: true }).click();
  await expect(page.getByText(/已退出其他会话，共/)).toBeVisible();
  expect((await fresh.context.get("/api/v1/me")).status()).toBe(401);
  const revokedWithReadFailure = await login(first.email);
  let failProfileRead = false;
  let revocationRequests = 0;
  const failRead = async (route) => {
    if (failProfileRead && route.request().method() === "GET") {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "VERIFICATION_READ_FAILURE",
            message: "测试资料读取失败",
          },
        },
      });
    } else await route.continue();
  };
  const completeRevocation = async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    revocationRequests += 1;
    const response = await route.fetch();
    failProfileRead = response.status() === 200;
    await route.fulfill({ response });
  };
  await page.route("**/api/v1/me", failRead);
  await page.route("**/api/v1/me/sessions/others", completeRevocation);
  try {
    await page
      .getByRole("button", { name: "退出其他会话", exact: true })
      .click();
    await page.getByRole("button", { name: "确认退出", exact: true }).click();
    await expect(
      page.getByText("会话操作已完成，账户资料暂时无法刷新，请重试加载。", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("dialog", { name: "退出其他会话", exact: true }),
    ).toHaveCount(0);
    assert.equal(revocationRequests, 1);
    expect(
      (await revokedWithReadFailure.context.get("/api/v1/me")).status(),
    ).toBe(401);
  } finally {
    failProfileRead = false;
    await page.unroute("**/api/v1/me", failRead);
    await page.unroute("**/api/v1/me/sessions/others", completeRevocation);
  }
  await page
    .locator(".account-load-error")
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(page.locator(".account-load-error")).toHaveCount(0);
  report.checks.push(
    "a committed session revocation closes its confirmation and reports its result when the subsequent profile read fails, and read recovery issues no repeated revocation",
  );

  const lateUi = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  expect(
    (
      await lateUi.request.post(web + "/api/v1/auth/login", {
        data: { email: first.email, password },
      })
    ).status(),
  ).toBe(200);
  const latePage = await lateUi.newPage();
  latePage.on("pageerror", (error) => report.errors.push(error.message));
  await latePage.goto(web + "/me/home");
  await latePage
    .getByRole("navigation")
    .getByRole("link", { name: "账户设置", exact: true })
    .click();
  await expect(
    latePage.getByRole("button", { name: "编辑", exact: true }),
  ).toBeEnabled();
  const delayedBootstrap = await holdNextResponse(
    latePage,
    "**/api/v1/bootstrap",
    "GET",
  );
  try {
    await latePage.getByRole("button", { name: "编辑", exact: true }).click();
    await latePage.getByLabel("昵称", { exact: true }).fill("迟到身份响应");
    await latePage.getByRole("button", { name: "保存", exact: true }).click();
    await delayedBootstrap.wait();
    await expect(
      latePage.getByRole("dialog", { name: "编辑昵称", exact: true }),
    ).toHaveCount(0);
    await latePage.getByRole("tab", { name: "会话", exact: true }).click();
    await latePage
      .getByRole("dialog", { name: "会话管理", exact: true })
      .getByRole("button", { name: "退出当前登录", exact: true })
      .click();
    await latePage
      .getByRole("button", { name: "退出登录", exact: true })
      .click();
    await expect(
      latePage.getByRole("heading", { name: "登录与注册", exact: true }),
    ).toBeVisible();
    await delayedBootstrap.dispose();
    await latePage.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await latePage.goBack();
    await expect(
      latePage.getByRole("heading", { name: "登录与注册", exact: true }),
    ).toBeVisible();
    expect((await lateUi.request.get(web + "/api/v1/me")).status()).toBe(401);
  } finally {
    await delayedBootstrap.dispose();
    await lateUi.close();
  }
  report.checks.push(
    "confirmed logout clears local identity and private reads while an earlier bootstrap response is delayed, and browser history retains authenticated-route protection after that response arrives",
  );

  await page.getByRole("tab", { name: "会话", exact: true }).click();
  await page
    .getByRole("dialog", { name: "会话管理", exact: true })
    .getByRole("button", { name: "退出当前登录", exact: true })
    .click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  expect((await ui.request.get(web + "/api/v1/me")).status()).toBe(401);
  report.checks.push(
    "session management lists real devices, bulk logout preserves the browser's current session and explicit current logout returns to authenticated-route protection",
  );
  await ui.close();
  for (const [role, email] of [
    ["USER", "consumer@example.invalid"],
    ["PUBLISHER", "publisher@example.invalid"],
    ["ADMIN", "admin@example.invalid"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    expect(
      (
        await context.request.post(web + "/api/v1/auth/login", {
          data: { email, password: "TravelTools2026!" },
        })
      ).status(),
    ).toBe(200);
    const view = await context.newPage();
    page = view;
    view.on("pageerror", (error) => report.errors.push(error.message));
    await view.goto(web + "/me/settings/account?workspace=" + role);
    await expect(view.locator(".app-shell")).toHaveClass(
      new RegExp("role-" + role),
    );
    await expect(
      view.locator(".account-profile-content b").first(),
    ).not.toHaveText("—");
    await expect(view.locator(".account-profile-content")).toContainText(
      "***@example.invalid",
    );
    await expect(
      view.locator(".account-profile-section .ant-btn").first(),
    ).toBeEnabled();
    const id = role + "-C21";
    await view.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
    });
    report.screenshots.push(id);
    report.layouts[id] = await view.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        profile: bounds(".account-profile-section"),
        sessions: bounds(".account-sessions"),
        closure: bounds(".account-close"),
      };
    });
    assert.equal(report.layouts[id].width, 1814);
    assert.equal(report.layouts[id].height, 868);
    const accountLink = view
      .locator(".topbar-actions")
      .getByRole("link", { name: "打开账户设置", exact: true });
    await accountLink.focus();
    await view.keyboard.press("Enter");
    await expect(view.locator(".app-shell")).toHaveClass(
      new RegExp("role-" + role),
    );
    assert.equal(new URL(view.url()).pathname, "/me/settings/account");
    if (role !== "USER") {
      assert.equal(new URL(view.url()).searchParams.get("workspace"), role);
      await view.getByRole("tab", { name: "账号安全", exact: true }).click();
      await expect(
        view.getByRole("dialog", { name: "账号安全", exact: true }),
      ).toBeVisible();
      await view.reload();
      await expect(
        view.getByRole("dialog", { name: "账号安全", exact: true }),
      ).toBeVisible();
      await view
        .getByRole("dialog", { name: "账号安全", exact: true })
        .locator(".ant-modal-footer")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
    }
    await view.setViewportSize({ width: 390, height: 844 });
    await view.goto(web + "/me/settings/account?workspace=" + role);
    await expect(
      view.locator(".account-profile-section .ant-btn").first(),
    ).toBeEnabled();
    assert.equal(
      await view.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await view.getByRole("tab", { name: "会话", exact: true }).click();
    await expect(
      view.getByRole("dialog", { name: "会话管理", exact: true }),
    ).toBeVisible();
    await expect(
      view.getByRole("dialog", { name: "会话管理", exact: true }),
    ).toContainText("当前会话");
    assert.equal(
      await view.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    const tableScroll = await view
      .locator(".ant-modal .ant-table-content")
      .evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }));
    assert.ok(tableScroll.scroll > tableScroll.client);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "all three account layouts fit the desktop and 390px viewports, expose a keyboard-accessible workspace-preserving header link, restore security dialogs, and scroll session tables within the mobile dialog without browser exceptions",
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
  await guest?.dispose();
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
