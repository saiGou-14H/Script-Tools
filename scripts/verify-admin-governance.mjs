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
const output = path.resolve("output/verification/admin-governance-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "admin-governance-pages-" + randomUUID(),
);
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

async function fixtures(database) {
  async function insert(table, values) {
    const record = { id: randomUUID(), ...values },
      columns = Object.keys(record);
    await database.query(
      `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, i) => "$" + (i + 1)).join(",")})`,
      Object.values(record),
    );
    return record.id;
  }
  const admin = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized='admin@example.invalid'",
    )
  ).rows[0].id;
  const extraOwners = [];
  for (const status of ["ACTIVE", "FROZEN", "UNVERIFIED"])
    extraOwners.push(
      await insert("users", {
        email_normalized: randomUUID() + "@fixture.invalid",
        password_hash: "private-password-hash",
        display_name: "private-user-display",
        status,
        verified_at: status === "UNVERIFIED" ? null : new Date(),
      }),
    );
  const grants = [];
  for (const [user, capabilities, expires, revoked] of [
    [extraOwners[0], ["access.manage"], null, null],
    [extraOwners[0], ["access.manage", "runtime.observe"], null, null],
    [extraOwners[0], ["runtime.manage"], new Date("2020-01-01"), null],
    [extraOwners[0], ["catalog.manage"], null, new Date()],
    [extraOwners[1], ["access.manage"], null, null],
    [extraOwners[2], ["access.manage"], null, null],
  ])
    grants.push(
      await insert("management_role_grants", {
        owner_user_id: user,
        capabilities,
        expires_at: expires,
        revoked_at: revoked,
        reason: "fixture public grant reason",
        revision: "9007199254740993",
      }),
    );
  const ownGrant = await insert("management_role_grants", {
    owner_user_id: admin,
    capabilities: ["data.diagnose"],
    reason: "fixture own diagnostic capability",
  });
  const revokedGrant = await insert("management_role_grants", {
    owner_user_id: admin,
    capabilities: ["data.diagnose"],
    reason: "fixture revoked diagnostic capability",
    revoked_at: new Date(),
  });
  const sessions = [];
  for (const [grant, expires, revoked] of [
    [ownGrant, 1, null],
    [ownGrant, -1, null],
    [ownGrant, 1, new Date()],
    [revokedGrant, 1, null],
  ])
    sessions.push(
      await insert("data_access_sessions", {
        owner_user_id: admin,
        capability_grant_id: grant,
        purpose: "fixture diagnostic purpose",
        ticket_ref: "TICKET-%_",
        scope: JSON.stringify([
          { private: "private-scope-content" },
          { object: "another-private-object" },
        ]),
        token_hash: "private-session-token-" + randomUUID(),
        created_at: new Date(Date.now() - 600000),
        expires_at: new Date(Date.now() + expires * 300000),
        revoked_at: revoked,
        revision: "9007199254740993",
      }),
    );
  const foreignGrant = await insert("management_role_grants", {
    owner_user_id: extraOwners[0],
    capabilities: ["data.diagnose"],
    reason: "fixture foreign diagnostic",
  });
  const foreignSession = await insert("data_access_sessions", {
    owner_user_id: extraOwners[0],
    capability_grant_id: foreignGrant,
    purpose: "foreign-private-purpose",
    ticket_ref: "FOREIGN",
    scope: "[]",
    token_hash: randomUUID(),
    expires_at: new Date(Date.now() + 600000),
  });
  const audits = [];
  for (const outcome of ["SUCCESS", "DENIED", "FAILED"])
    audits.push(
      await insert("audit_events", {
        actor_service: "fixture-service",
        action: "fixture.%_" + outcome,
        target_type: "FIXTURE",
        target_id: randomUUID(),
        before_revision: "9007199254740993",
        after_revision: "9007199254740994",
        request_id: randomUUID(),
        outcome,
        summary: JSON.stringify({
          reason: "fixture readable reason",
          private: "private-audit-summary",
        }),
        created_at: new Date("2020-01-01T00:00:00.123456Z"),
      }),
    );
  const backups = [];
  for (let i = 0; i < 3; i++)
    backups.push(
      await insert("backup_manifests", {
        backup_key: "private-backup-key-" + randomUUID(),
        database_lsn: "private-lsn",
        object_manifest_key: "private-object-manifest-" + randomUUID(),
        revocation_watermark: i === 0 ? "" : "private-watermark",
        key_policy_version: "private-key-version",
        completed_at: new Date("2020-01-01"),
        expires_at: new Date(i === 1 ? "2021-01-01" : "2099-01-01"),
        checksum: "private-backup-checksum",
        revision: "9007199254740993",
      }),
    );
  const drills = [];
  for (const [i, status] of [
    "PLANNED",
    "RUNNING",
    "PASSED",
    "FAILED",
    "CANCELLED",
  ].entries())
    drills.push(
      await insert("recovery_drills", {
        owner_user_id: admin,
        backup_id: backups[i % 3],
        purpose: "private-drill-purpose",
        evidence:
          i === 2
            ? "{}"
            : JSON.stringify({ private: "private-drill-evidence" }),
        status,
        started_at: i > 0 ? new Date("2020-01-01") : null,
        finished_at: i > 1 ? new Date("2020-01-02") : null,
      }),
    );
  const requests = [];
  for (const status of ["REQUESTED", "RUNNING", "COMPLETED", "FAILED"])
    requests.push(
      await insert("deletion_requests", {
        owner_user_id: admin,
        scope_type: "LOG",
        scope_id: randomUUID(),
        reason: "private-deletion-reason",
        requested_at: new Date(),
        retained_summary: JSON.stringify({
          private: "private-retained-summary",
        }),
        latest_backup_expiry: new Date("2099-01-01"),
        status,
      }),
    );
  const cleanup = [];
  for (const [i, store] of [
    "DATABASE",
    "OBJECT",
    "LOKI",
    "TRACE",
    "CACHE",
    "EXPORT",
    "NODE_WAL",
    "WORKSPACE",
    "CHECKPOINT",
    "BACKUP",
  ].entries())
    cleanup.push(
      await insert("deletion_steps", {
        owner_user_id: admin,
        request_id: requests[(i + 1) % 4],
        store,
        object_scope: "private-object-scope-" + randomUUID(),
        status: ["PENDING", "RUNNING", "DONE", "FAILED"][i % 4],
        attempt_count: i,
        completed_at: i % 4 === 2 ? new Date() : null,
        failure_code: i % 4 === 3 ? "CLEANUP_RETRYABLE" : null,
      }),
    );
  const policies = [];
  for (const kind of ["logs.%_", "outputs.%_"])
    for (const [version, date] of [
      [1, "2020-01-01"],
      [2, "2021-01-01"],
      [3, "2099-01-01"],
    ])
      policies.push(
        await insert("observability_policies", {
          kind,
          version,
          policy: JSON.stringify({ private: "private-retention-policy" }),
          effective_at: new Date(date),
          created_by: admin,
        }),
      );
  return {
    admin,
    extraOwners,
    grants,
    ownGrant,
    sessions,
    foreignSession,
    audits,
    backups,
    drills,
    requests,
    cleanup,
    policies,
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
  async function login(email) {
    const context = await request.newContext({ baseURL: base });
    contexts.push(context);
    expect(
      (
        await context.post("/api/v1/auth/login", {
          data: { email, password: "TravelTools2026!" },
        })
      ).status(),
    ).toBe(200);
    return context;
  }
  const admin = await login("admin@example.invalid"),
    consumer = await login("consumer@example.invalid"),
    guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  const fixture = await fixtures(database);
  const endpoints = [
    "role-grants",
    "audit-events",
    "data-access-sessions",
    "backups",
    "recovery-drills",
    "cleanup-jobs",
    "observability/policies",
  ];
  for (const endpoint of endpoints) {
    expect((await guest.get("/api/v1/admin/" + endpoint)).status()).toBe(401);
    expect((await consumer.get("/api/v1/admin/" + endpoint)).status()).toBe(
      403,
    );
  }
  const consumerId = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized='consumer@example.invalid'",
    )
  ).rows[0].id;
  const accessGrant = randomUUID();
  await database.query(
    "INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason) VALUES($1,$2,ARRAY['access.manage'],'Governance verification')",
    [accessGrant, consumerId],
  );
  expect((await consumer.get("/api/v1/admin/role-grants")).status()).toBe(200);
  expect((await consumer.get("/api/v1/admin/backups")).status()).toBe(403);
  expect(
    (await consumer.get("/api/v1/admin/data-access-sessions")).status(),
  ).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['data.diagnose'] WHERE id=$1",
    [accessGrant],
  );
  const consumerSessions = await consumer.get(
    "/api/v1/admin/data-access-sessions",
  );
  expect(consumerSessions.status()).toBe(200);
  assert.equal((await consumerSessions.json()).data.length, 0);
  expect((await consumer.get("/api/v1/admin/audit-events")).status()).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['runtime.manage'] WHERE id=$1",
    [accessGrant],
  );
  expect((await consumer.get("/api/v1/admin/backups")).status()).toBe(200);
  expect(
    (await consumer.get("/api/v1/admin/data-access-sessions")).status(),
  ).toBe(403);
  report.checks.push(
    "HTTP governance queries enforce separate access.manage, data.diagnose and runtime.manage capabilities and recheck changed grants",
  );
  async function get(endpoint) {
    const response = await admin.get("/api/v1/admin/" + endpoint);
    expect(response.status(), endpoint + " " + (await response.text())).toBe(
      200,
    );
    expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const grants = await get("role-grants?limit=100");
  assert.ok(
    ["ACTIVE", "REVOKED", "EXPIRED", "ACCOUNT_INACTIVE"].every((status) =>
      grants.data.some((row) => row.status === status),
    ),
  );
  assert.equal(
    grants.data.find((row) => row.id === fixture.grants[0]).revision,
    "9007199254740993",
  );
  assert.ok(
    grants.data
      .filter((row) => row.is_current_user)
      .every((row) => !row.is_last_access_manager),
  );
  await database.query(
    "UPDATE travel.management_role_grants SET revoked_at=now() WHERE id=ANY($1::uuid[])",
    [fixture.grants.slice(0, 2)],
  );
  const last = await get("role-grants?q=" + fixture.ownGrant);
  assert.equal(last.data[0].is_last_access_manager, true);
  for (const marker of [
    "private-password-hash",
    "private-user-display",
    "@fixture.invalid",
  ])
    assert.ok(!JSON.stringify(grants).includes(marker));
  report.checks.push(
    "Role metadata keeps revoked, expired and inactive-account records distinct, preserves BIGINT revisions and counts the last effective access manager by distinct active verified account",
  );
  const audits = await get("audit-events?q=fixture.%25_");
  assert.equal(audits.data.length, 3);
  assert.ok(
    audits.data.every(
      (row) =>
        row.reason === "fixture readable reason" &&
        row.before_revision === "9007199254740993" &&
        row.after_revision === "9007199254740994",
    ),
  );
  assert.ok(!JSON.stringify(audits).includes("private-audit-summary"));
  assert.equal(
    (
      await get(
        "audit-events?actor=fixture-service&object=FIXTURE&action=fixture.%25_SUCCESS&from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z",
      )
    ).data.length,
    1,
  );
  assert.ok(
    (
      await database.query(
        "SELECT id FROM travel.audit_events WHERE action='ops.audit.read'",
      )
    ).rows.length >= 2,
  );
  const sessions = await get("data-access-sessions?limit=100");
  assert.equal(sessions.data.length, 4);
  assert.ok(sessions.data.every((row) => row.scope_count === "2"));
  assert.equal(new Set(sessions.data.map((row) => row.status)).size, 4);
  assert.ok(!JSON.stringify(sessions).includes(fixture.foreignSession));
  for (const marker of [
    "private-session-token-",
    "private-scope-content",
    "another-private-object",
  ])
    assert.ok(!JSON.stringify(sessions).includes(marker));
  report.checks.push(
    "Audit reads expose scoped reason and revision fields and append their own query audit, while diagnostic-session reads stay with the authenticated owner and exclude tokens and scope bodies",
  );
  const backups = await get("backups");
  assert.equal(backups.data.length, 3);
  assert.equal(backups.data.filter((row) => row.expired).length, 1);
  assert.ok(backups.data.every((row) => row.revision === "9007199254740993"));
  assert.equal(
    backups.data.filter((row) => !row.has_revocation_watermark).length,
    1,
  );
  const drills = await get("recovery-drills");
  assert.equal(drills.data.length, 5);
  assert.equal(new Set(drills.data.map((row) => row.status)).size, 5);
  assert.equal(
    drills.data.find((row) => row.status === "PASSED").has_evidence,
    false,
  );
  assert.ok(
    (await get("recovery-drills?backup_id=" + fixture.backups[0])).data.every(
      (row) => row.backup_id === fixture.backups[0],
    ),
  );
  const cleanup = await get("cleanup-jobs");
  assert.equal(cleanup.data.length, 10);
  assert.equal(new Set(cleanup.data.map((row) => row.store)).size, 10);
  assert.ok(
    cleanup.data.some(
      (row) => row.status === "DONE" && row.request_status === "FAILED",
    ),
  );
  assert.ok(cleanup.data.some((row) => row.attempt_count === 0));
  const policies = await get("observability/policies");
  assert.equal(policies.data.filter((row) => row.is_current).length, 2);
  assert.equal(policies.data.filter((row) => row.is_future).length, 2);
  for (const marker of [
    "private-backup-key",
    "private-lsn",
    "private-object-manifest",
    "private-watermark",
    "private-key-version",
    "private-backup-checksum",
    "private-drill-purpose",
    "private-drill-evidence",
    "private-deletion-reason",
    "private-retained-summary",
    "private-object-scope",
    "private-retention-policy",
  ])
    assert.ok(
      !JSON.stringify([backups, drills, cleanup, policies]).includes(marker),
      marker,
    );
  report.checks.push(
    "Backup manifests, drill states and evidence presence, per-store cleanup receipts and per-kind retention versions retain independent stored facts without exposing object paths or raw evidence",
  );
  for (const endpoint of [
    "role-grants?status=bad",
    "role-grants?owner_user_id=x",
    "audit-events?actor=x&actor=y",
    "audit-events?from=2020-02-30T00:00:00Z",
    "audit-events?from=2020-01-02T00:00:00Z&to=2020-01-01T00:00:00Z",
    "data-access-sessions?owner_user_id=x",
    "backups?status=SUCCESS",
    "recovery-drills?backup_id=bad",
    "cleanup-jobs?store=bad",
    "cleanup-jobs?request_id=bad",
    "observability/policies?enabled=true",
  ])
    expect(
      (await admin.get("/api/v1/admin/" + endpoint)).status(),
      endpoint,
    ).toBe(422);
  for (const endpoint of endpoints) {
    const first = await get(endpoint + "?limit=1");
    assert.ok(first.next_cursor, endpoint);
    const next = await get(endpoint + "?limit=1&cursor=" + first.next_cursor);
    assert.notEqual(first.data[0].id, next.data[0].id);
    expect(
      (
        await admin.get(
          "/api/v1/admin/" +
            endpoint +
            "?limit=1&q=changed&cursor=" +
            first.next_cursor,
        )
      ).status(),
    ).toBe(422);
  }
  report.checks.push(
    "Strict filters reject malformed queries and cross-owner session requests, and signed pagination binds query scope while audit self-recording avoids cursor duplication",
  );
  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const adapter = {
    root: database.root,
    query: (sql, values) => connection.query(sql, values),
  };
  const pg = await fixtures(adapter),
    metadata = new AdminMetadataService(
      adapter,
      new PaginationService(adapter),
    );
  const actor = {
    id: pg.admin,
    roles: ["ADMIN"],
    capabilities: ["access.manage", "data.diagnose", "runtime.manage"],
    security_revision: "1",
  };
  assert.equal(
    (await metadata.roleGrants(actor, { q: pg.grants[0] })).items[0].revision,
    "9007199254740993",
  );
  assert.equal(
    (await metadata.auditEvents(actor, { q: pg.audits[0] })).items[0].outcome,
    "SUCCESS",
  );
  assert.equal(
    (await metadata.dataAccessSessions(actor, { q: pg.sessions[0] })).items[0]
      .scope_count,
    "2",
  );
  assert.equal(
    (await metadata.backups(actor, { q: pg.backups[0] })).items.length,
    1,
  );
  assert.equal(
    (await metadata.recoveryDrills(actor, { q: pg.drills[2] })).items[0]
      .has_evidence,
    false,
  );
  assert.equal(
    (await metadata.cleanupJobs(actor, { q: pg.cleanup[0] })).items[0]
      .attempt_count,
    0,
  );
  assert.equal(
    (await metadata.retentionPolicies(actor, { q: pg.policies[1] })).items[0]
      .is_current,
    true,
  );
  const cursor = (await metadata.backups(actor, { limit: "1" })).nextCursor;
  await assert.rejects(
    metadata.backups(
      { ...actor, security_revision: "2" },
      { limit: "1", cursor },
    ),
    (error) => error.status === 422,
  );
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query(
        "SELECT id FROM travel.backup_manifests WHERE id=$1",
        [pg.backups[0]],
      )
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 verifies all governance projections, audited reads and security-revision cursors inside fully rolled-back transactions",
  );
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason,created_at) SELECT gen_random_uuid(),$1,ARRAY['runtime.observe'],'paged fixture','2019-01-01' FROM generate_series(1,23)`,
    [fixture.extraOwners[0]],
  );
  await database.query(
    `INSERT INTO travel.backup_manifests(id,backup_key,database_lsn,object_manifest_key,revocation_watermark,key_policy_version,completed_at,expires_at,checksum,created_at) SELECT gen_random_uuid(),gen_random_uuid()::text,'private',gen_random_uuid()::text,'private','private','2018-01-01','2099-01-01','private','2019-01-01' FROM generate_series(1,23)`,
  );
  const distantGrant = (
      await database.query(
        "SELECT id FROM travel.management_role_grants ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0].id,
    distantBackup = (
      await database.query(
        "SELECT id FROM travel.backup_manifests ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0].id;
  async function snapshot() {
    return (
      await database.query(
        `SELECT jsonb_build_object('grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM travel.management_role_grants g),'backups',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM travel.backup_manifests b),'drills',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM travel.recovery_drills d),'cleanup',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM travel.deletion_steps c)) AS state`,
      )
    ).rows[0].state;
  }
  const before = await snapshot(),
    webRoot = path.resolve("apps/web");
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
  const web = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  const ui = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await ui.request.post(web + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  async function capture(id) {
    await expect(page.locator(".admin-page h1")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(id);
  }
  async function choose(scope, label, value) {
    const field = scope.getByRole("combobox", { name: label, exact: true });
    const multiple = await field.evaluate((element) =>
      element.closest(".ant-select")?.classList.contains("ant-select-multiple"),
    );
    await field.click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText(value, { exact: true })
      .click();
    if (multiple) await field.press("Escape");
    await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  }
  await page.goto(web + "/admin/access");
  await capture("ADMIN-O19");
  await page.goto(web + "/admin/access?grant=ops");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "目标账号", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("dialog").getByLabel("处理理由", { exact: true }),
  ).toHaveValue("");
  await choose(page.getByRole("dialog"), "授权能力", "runtime.observe");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("治理授权重复确认");
  await page
    .getByRole("button", { name: "保存授权预览", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(
    page
      .locator(".admin-access-columns .ant-table-row")
      .filter({ hasText: "治理授权重复确认" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "授权管理", exact: true }).click();
  await choose(page.getByRole("dialog"), "目标账号", "ops****217 · 运维");
  await expect(page.getByRole("dialog")).toContainText("runtime.observe");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.goto(web + "/admin/access?grant=missing");
  await expect(page.getByRole("dialog")).toContainText("授权 missing 不可用");
  report.checks.push(
    "Prototype grant selection restores from URL, captures its revision, preserves updated capabilities and records one result for repeated confirmation without substituting an unavailable target",
  );
  await page.goto(web + "/admin/recovery");
  await capture("ADMIN-O20");
  await page.goto(web + "/admin/recovery?dialog=retention");
  await expect(
    page.getByRole("dialog").getByLabel("日志总保留天数", { exact: true }),
  ).toHaveValue("30");
  await page.reload();
  await expect(
    page.getByRole("dialog").getByLabel("日志热检索天数", { exact: true }),
  ).toHaveValue("7");
  await page
    .getByRole("dialog")
    .getByLabel("日志热检索天数", { exact: true })
    .fill("5");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("治理保留策略重复确认");
  await page
    .getByRole("button", { name: "保存策略预览", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(page.locator(".admin-recovery-columns")).toContainText(
    "热检索5天",
  );
  await page
    .getByRole("button", { name: "运行日志 工具", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("v3");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.goto(web + "/admin/recovery?dialog=precheck");
  await expect(page.getByRole("dialog")).toContainText("待执行");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("独立验证环境");
  report.checks.push(
    "Prototype retention and recovery dialogs restore from URL, capture their policy version and advance once for duplicate saves while precheck evidence retains its pending state",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, id] of [
    ["/admin/access", "ADMIN-O19-prototype-mobile"],
    ["/admin/recovery", "ADMIN-O20-prototype-mobile"],
  ]) {
    await page.goto(web + route);
    await capture(id);
    const box = await page.locator(".admin-page").boundingBox();
    assert.equal(box.x, 16);
    assert.equal(box.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  await ui.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  let failGrants = true;
  await ui.route("**/api/v1/admin/role-grants?**", (route) =>
    failGrants
      ? route.fulfill({
          status: 503,
          json: { error: { message: "unavailable" } },
        })
      : route.continue(),
  );
  await page.goto(web + "/admin/access");
  await expect(page.getByText("授权查询失败", { exact: true })).toBeVisible();
  failGrants = false;
  await page.getByRole("button", { name: "重试授权查询", exact: true }).click();
  await expect(
    page
      .locator(".admin-access-columns > .panel")
      .first()
      .locator(".ant-table-row"),
  ).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多授权", exact: true }).click();
  await expect(
    page
      .locator(".admin-access-columns > .panel")
      .first()
      .locator(".ant-table-row"),
  ).toHaveCount(34);
  await page.goto(web + "/admin/access?grant=" + distantGrant);
  await expect(page.getByRole("dialog")).toContainText(distantGrant);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(distantGrant);
  await page.getByRole("button", { name: "关闭授权详情", exact: true }).click();
  await page
    .getByRole("button", { name: "限时排障会话记录", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(
    4,
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "private-scope-content",
  );
  await page.getByRole("button", { name: "关闭会话记录", exact: true }).click();
  await capture("ADMIN-O19-live");
  report.checks.push(
    "LIVE access queries retry failures, paginate real grants, locate a grant beyond the loaded page and show only the current operator's diagnostic session metadata",
  );
  await page.goto(web + "/admin/recovery");
  await expect(page.locator(".backup-status-row")).toContainText(
    "已有备份清单记录",
  );
  await page.getByRole("button", { name: "备份清单", exact: true }).click();
  await expect(
    page.locator(".admin-recovery-columns").first().locator(".ant-table-row"),
  ).toHaveCount(20);
  await page
    .getByRole("button", { name: "加载更多保留与恢复记录", exact: true })
    .click();
  await expect(
    page.locator(".admin-recovery-columns").first().locator(".ant-table-row"),
  ).toHaveCount(26);
  await page.goto(web + "/admin/recovery?view=backups&backup=" + distantBackup);
  await expect(page.getByRole("dialog")).toContainText(distantBackup);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(distantBackup);
  await page.getByRole("button", { name: "关闭备份详情", exact: true }).click();
  await page.getByRole("button", { name: "恢复演练", exact: true }).click();
  await expect(
    page.locator(".admin-recovery-columns .ant-table-row"),
  ).toHaveCount(5);
  await choose(page, "恢复或清理状态筛选", "PASSED");
  await expect(
    page.locator(".admin-recovery-columns .ant-table-row"),
  ).toHaveCount(1);
  await expect(page.locator(".admin-recovery-columns")).toContainText("未记录");
  await page.getByRole("button", { name: "清理回执", exact: true }).click();
  await expect(
    page.locator(".admin-recovery-columns .ant-table-row"),
  ).toHaveCount(10);
  await expect(page.locator(".admin-recovery-columns")).toContainText(
    "CLEANUP_RETRYABLE",
  );
  await capture("ADMIN-O20-live");
  report.checks.push(
    "LIVE recovery restores exact backup identity, paginates manifests and keeps passed drill status, evidence presence and per-store cleanup results independently visible",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, id] of [
    ["/admin/access", "ADMIN-O19-mobile"],
    ["/admin/recovery", "ADMIN-O20-mobile"],
  ]) {
    await page.goto(web + route);
    await capture(id);
    const box = await page.locator(".admin-page").boundingBox();
    assert.equal(box.x, 16);
    assert.equal(box.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    report.layouts[id] = { left: box.x, width: box.width };
  }
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "Desktop and 390px governance pages preserve full-width content with internal table scrolling and leave grants, backup manifests and cleanup business records unchanged",
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
