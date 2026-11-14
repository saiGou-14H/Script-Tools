import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect, request } from "@playwright/test";

loadEnvFile(".env");
const base = "http://127.0.0.1:5174";
const output = path.resolve("output/verification/identity");
await mkdir(output, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch();
const guest = await request.newContext({ baseURL: base });
const signed = await request.newContext({ baseURL: base });
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
const email = `identity-${randomUUID()}@example.invalid`;
const passwordA = "Verification!2026A";
const passwordB = "Verification!2026B";
const newPassword = "Verification!2026New";
let context;
let page;
async function issue(purpose, target = email, password = passwordA) {
  const response = await guest.post(
    `/api/v1/auth/${purpose === "verify" ? "register" : "password-reset-requests"}`,
    {
      data:
        purpose === "verify"
          ? { email: target, password, accepted_terms_version: "V3.0" }
          : { email: target },
    },
  );
  expect(response.status()).toBe(202);
  const receipt = (await response.json()).data;
  assert.equal(typeof receipt.challenge_id, "string");
  assert.equal(receipt.development_token.length, 64);
  return receipt;
}
async function consume(purpose, receipt, changes = {}) {
  return guest.post(
    `/api/v1/auth/${purpose === "verify" ? "verify-email" : "password-resets"}`,
    {
      data: {
        challenge_id: receipt.challenge_id,
        token: receipt.development_token,
        ...(purpose === "reset" ? { new_password: newPassword } : {}),
        ...changes,
      },
    },
  );
}
try {
  await expect
    .poll(
      async () => {
        try {
          return (await guest.get("/api/v1/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  const terms = await guest.post("/api/v1/auth/register", {
    data: { email, password: passwordA },
  });
  expect(terms.status()).toBe(422);
  for (const invalid of [null, []]) {
    const response = await guest.post("/api/v1/auth/register", {
      data: invalid,
    });
    assert.ok(response.status() >= 400 && response.status() < 500);
  }
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM travel.users WHERE email_normalized=$1",
        [email],
      )
    ).rowCount,
    0,
  );
  const first = await issue("verify");
  const second = await issue("verify", email, passwordB);
  const owner = (
    await pool.query(
      "SELECT id,status FROM travel.users WHERE email_normalized=$1",
      [email],
    )
  ).rows[0];
  assert.equal(owner.status, "UNVERIFIED");
  const beforeVerification = await signed.post("/api/v1/auth/login", {
    data: { email, password: passwordA },
  });
  expect(beforeVerification.status()).toBe(401);
  const protectedData = (
    await pool.query(
      "SELECT token_hash,target_payload_id FROM travel.auth_challenges WHERE id=$1",
      [first.challenge_id],
    )
  ).rows[0];
  assert.equal(
    protectedData.token_hash.includes(first.development_token),
    false,
  );
  const payload = (
    await pool.query(
      "SELECT ciphertext FROM travel.private_payloads WHERE id=$1",
      [protectedData.target_payload_id],
    )
  ).rows[0];
  assert.equal(
    Buffer.from(payload.ciphertext).includes(Buffer.from(passwordA)),
    false,
  );
  assert.equal(
    Buffer.from(payload.ciphertext).includes(Buffer.from(email)),
    false,
  );
  report.checks.push(
    "registration requires the accepted terms version, creates an unverified account and keeps challenge secrets and pending registration data protected",
  );

  expect((await consume("reset", first)).status()).toBe(422);
  expect(
    (await consume("verify", first, { token: "incorrect" })).status(),
  ).toBe(422);
  assert.equal(
    (
      await pool.query(
        "SELECT attempts FROM travel.auth_challenges WHERE id=$1",
        [first.challenge_id],
      )
    ).rows[0].attempts,
    1,
  );
  const verification = await Promise.all([
    consume("verify", first),
    consume("verify", first),
  ]);
  assert.deepEqual(
    verification.map((response) => response.status()).sort(),
    [200, 422],
  );
  expect((await consume("verify", second)).status()).toBe(422);
  const activated = (
    await pool.query(
      "SELECT status,verified_at FROM travel.users WHERE id=$1",
      [owner.id],
    )
  ).rows[0];
  assert.equal(activated.status, "ACTIVE");
  assert.ok(activated.verified_at);
  const eventRevision = (
    await pool.query(
      "SELECT e.aggregate_revision,c.revision FROM travel.outbox_events e JOIN travel.auth_challenges c ON c.id=e.aggregate_id WHERE e.aggregate_id=$1 AND e.event_type='EMAIL_VERIFIED'",
      [first.challenge_id],
    )
  ).rows[0];
  assert.equal(
    String(eventRevision.aggregate_revision),
    String(eventRevision.revision),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM travel.user_preferences WHERE owner_user_id=$1",
        [owner.id],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM travel.private_payloads WHERE owner_user_id=$1 AND purpose='AUTH_REGISTRATION' AND ciphertext IS NOT NULL",
        [owner.id],
      )
    ).rows[0].count,
    0,
  );
  expect(
    (
      await signed.post("/api/v1/auth/login", {
        data: { email, password: passwordA },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await guest.post("/api/v1/auth/login", {
        data: { email, password: passwordB },
      })
    ).status(),
  ).toBe(401);
  report.checks.push(
    "verification binds its own registration password, commits a failed-attempt count, activates once under concurrency and invalidates sibling challenges while erasing consumed payloads",
  );

  const reset = await issue("reset");
  const unknown = await issue(
    "reset",
    `unknown-${randomUUID()}@example.invalid`,
  );
  assert.deepEqual(Object.keys(reset).sort(), Object.keys(unknown).sort());
  assert.equal(reset.delivery_status, unknown.delivery_status);
  expect((await consume("reset", unknown)).status()).toBe(422);
  expect(
    (await consume("reset", reset, { new_password: "short" })).status(),
  ).toBe(422);
  expect((await consume("reset", reset)).status()).toBe(200);
  expect((await consume("reset", reset)).status()).toBe(422);
  expect((await signed.get("/api/v1/me")).status()).toBe(401);
  expect(
    (
      await signed.post("/api/v1/auth/login", {
        data: { email, password: passwordA },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await signed.post("/api/v1/auth/login", {
        data: { email, password: newPassword },
      })
    ).status(),
  ).toBe(200);
  report.checks.push(
    "password recovery uses a uniform accepted response, rejects invalid new passwords and atomically consumes its token while revoking previous sessions",
  );

  const bounded = await issue("reset");
  for (let attempt = 0; attempt < 5; attempt++)
    expect(
      (await consume("reset", bounded, { token: "incorrect" })).status(),
    ).toBe(422);
  expect((await consume("reset", bounded)).status()).toBe(422);
  const expired = await issue("reset");
  await pool.query(
    "UPDATE travel.auth_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.challenge_id],
  );
  expect((await consume("reset", expired)).status()).toBe(422);
  await pool.query(
    "UPDATE travel.auth_sessions SET last_seen_at=now()-interval '31 minutes' WHERE owner_user_id=$1 AND revoked_at IS NULL",
    [owner.id],
  );
  expect((await signed.get("/api/v1/me")).status()).toBe(401);
  report.checks.push(
    "challenge attempt budgets, challenge expiry and the session idle window are enforced against persisted state",
  );

  const require = createRequire(import.meta.url);
  const {
    DatabaseService,
  } = require("../apps/control-api/dist/database/database.service.js");
  const {
    AuthChallengeService,
  } = require("../apps/control-api/dist/auth/auth-challenge.service.js");
  const database = new DatabaseService();
  await database.onModuleInit();
  const previousDevSeed = process.env.DEV_SEED;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.DEV_SEED = "true";
    process.env.NODE_ENV = "development";
    const fresh = await issue(
      "verify",
      `identity-restart-${randomUUID()}@example.invalid`,
    );
    const service = new AuthChallengeService(database);
    const result = await service.consume(
      "VERIFY_EMAIL",
      { challenge_id: fresh.challenge_id, token: fresh.development_token },
      randomUUID(),
      "verification",
    );
    assert.equal(result.verified, true);
    process.env.NODE_ENV = "production";
    await assert.rejects(
      service.request(
        "RESET_PASSWORD",
        { email },
        randomUUID(),
        "verification",
      ),
      (error) => error.getStatus() === 503,
    );
  } finally {
    if (previousDevSeed === undefined) delete process.env.DEV_SEED;
    else process.env.DEV_SEED = previousDevSeed;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await database.onModuleDestroy();
  }
  report.checks.push(
    "a fresh identity service decrypts a pending registration with the persisted development key, and production mode requires configured message delivery",
  );

  context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base + "/auth");
  await expect(
    page.getByRole("heading", { name: "登录与注册", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".auth-use-cases article")).toHaveCount(2);
  await expect(page.locator(".auth-service-rules article")).toHaveCount(3);
  await page.screenshot({
    path: path.join(output, "GUEST-P07.png"),
    fullPage: true,
  });
  report.screenshots.push("GUEST-P07");
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    card: document.querySelector(".auth-card").getBoundingClientRect().toJSON(),
  }));
  assert.equal(layout.width, 1814);
  assert.equal(layout.height, 868);
  report.layout = layout;
  report.checks.push(
    "the sign-in page restores the reference introduction, service rules and two-column form layout within the reference viewport",
  );

  const uiEmail = `identity-ui-${randomUUID()}@example.invalid`;
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(uiEmail);
  await page.getByLabel("密码", { exact: true }).fill(passwordA);
  await page
    .getByRole("button", { name: "注册并验证邮箱", exact: true })
    .click();
  await expect(
    page.getByText("请先阅读并同意服务条款", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "我已阅读并同意", exact: true })
    .check();
  await page
    .getByRole("button", { name: "注册并验证邮箱", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "验证邮箱", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".auth-development-token")).toBeVisible();
  await page.getByRole("button", { name: "填入开发令牌", exact: true }).click();
  await page.locator(".auth-submit").click();
  await expect(
    page.getByText("邮箱验证完成，请使用邮箱和密码登录。", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(uiEmail);
  await page.getByLabel("密码", { exact: true }).fill(passwordA);
  await page.locator(".auth-submit").click();
  await expect(
    page.getByRole("heading", { name: "我的服务", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "registration, explicit terms consent, email verification and password sign-in complete through the real UI and database",
  );

  await page.goto(base + "/auth?tab=reset");
  await page.getByLabel("邮箱", { exact: true }).fill(uiEmail);
  await page.getByRole("button", { name: "发送验证邮件", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "重设密码", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "填入开发令牌", exact: true }).click();
  await page.getByLabel("新密码", { exact: true }).fill(newPassword);
  await page.getByLabel("确认新密码", { exact: true }).fill(passwordB);
  await page.locator(".auth-submit").click();
  await expect(
    page.getByText("两次输入的密码不一致", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("确认新密码", { exact: true }).fill(newPassword);
  await page.locator(".auth-submit").click();
  await expect(
    page.getByText("密码已重设，旧会话已撤销，请重新登录。", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(uiEmail);
  await page.getByLabel("密码", { exact: true }).fill(newPassword);
  await page.locator(".auth-submit").click();
  await expect(
    page.getByRole("heading", { name: "我的服务", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "password recovery validates confirmation fields, revokes the browser session and returns to explicit sign-in through the real UI",
  );
  for (const target of [
    "/admin/orders",
    "https://example.invalid/",
    String.raw`/\[`,
  ]) {
    const params = new URLSearchParams({
      workspace: "ADMIN",
      returnTo: target,
    });
    await page.goto(base + "/auth?" + params.toString());
    await expect(page.locator(".app-shell.role-GUEST")).toBeVisible();
    await page.getByLabel("邮箱", { exact: true }).fill(uiEmail);
    await page.getByLabel("密码", { exact: true }).fill(newPassword);
    await page.locator(".auth-submit").click();
    await expect(
      page.getByRole("heading", { name: "我的服务", exact: true }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/me/home");
  }
  report.checks.push(
    "sign-in uses the public workspace and returns consumers to an accessible local page when a requested administrator or external destination is unavailable",
  );
  for (const [role, account, route] of [
    ["PUBLISHER", "publisher@example.invalid", "/publisher"],
    ["ADMIN", "admin@example.invalid", "/admin"],
  ]) {
    await page.goto(base + "/auth?workspace=" + role);
    await page.getByLabel("邮箱", { exact: true }).fill(account);
    await page.getByLabel("密码", { exact: true }).fill("TravelTools2026!");
    await page.locator(".auth-submit").click();
    await expect(page).toHaveURL(base + route);
    await expect(page.locator(".app-shell.role-" + role)).toBeVisible();
  }
  report.checks.push(
    "an authorized publisher or administrator without an explicit return target enters the requested workspace home",
  );
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
  await rm(path.join(output, "failure.png"), { force: true });
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  await browser.close();
  await guest.dispose();
  await signed.dispose();
  await pool.end();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
