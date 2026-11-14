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
const output = path.resolve("output/verification/admin-diagnostics-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "admin-diagnostics-pages-" + randomUUID(),
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
      `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, index) => "$" + (index + 1)).join(",")})`,
      Object.values(record),
    );
    return record.id;
  }
  const nodeId = await insert("nodes", {
    name: "runtime-node-%_",
    status: "ONLINE",
    certificate_fingerprint: randomUUID(),
    capabilities: JSON.stringify({
      cpu_cores: "8",
      memory_mib: 32768,
      private_data: "raw-capability-marker",
    }),
    clock_offset_ms: "-9007199254740993",
    isolation_epoch: "9007199254740993",
  });
  const otherNodes = [];
  for (const [status, cpu, memory] of [
    ["REGISTERING", 0, "0"],
    ["DRAINING", "9223372036854775807", "9007199254740993"],
    ["OFFLINE", "bad", "9223372036854775808"],
    ["QUARANTINED", {}, -1],
  ])
    otherNodes.push(
      await insert("nodes", {
        name: "runtime-" + status,
        status,
        certificate_fingerprint: randomUUID(),
        capabilities: JSON.stringify({ cpu_cores: cpu, memory_mib: memory }),
      }),
    );
  const imageIds = [];
  for (const status of ["DRAFT", "READY", "RETIRED", "REVOKED"])
    imageIds.push(
      await insert("runtime_images", {
        name: "runtime-image-" + status,
        digest:
          "sha256:" +
          randomUUID().replaceAll("-", "") +
          randomUUID().replaceAll("-", ""),
        language: "node",
        version: "1.0",
        modes: ["docker", "qemu_tcg"],
        status,
        evidence: JSON.stringify({
          private_data: "raw-image-evidence",
          development_fixture: true,
        }),
      }),
    );
  await database.query(
    `INSERT INTO travel.quota_accounts(id,scope,scope_key,resource_key,window_start,limit_amount,reserved_amount,consumed_amount)
    VALUES($1,'GLOBAL','runtime','memory_mib',now()-interval '1 day',9223372036854775807,10,20),
      ($2,'GLOBAL','runtime','memory_mib',now()-interval '2 days',99,0,0),
      ($3,'GLOBAL','runtime','memory_mib',now()+interval '1 day',1,0,0),
      ($4,'NODE',$5,'executions',now()-interval '1 day',100,3,7),
      ($6,'USER',$5,'private.user.quota',now()-interval '1 day',200,0,0)`,
    [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      nodeId,
      randomUUID(),
    ],
  );
  const seed = (
    await database.query(
      "SELECT id,owner_user_id FROM travel.script_versions WHERE content_status='READY' ORDER BY id LIMIT 1",
    )
  ).rows[0];
  const owner = { owner_user_id: seed.owner_user_id };
  const payload = await insert("private_payloads", {
    ...owner,
    purpose: "runtime-metadata-verification",
    key_version: "verification",
    ciphertext: Buffer.from("inert-encrypted-fixture"),
    content_hmac: randomUUID(),
    size_bytes: 23,
  });
  const authorization = await insert("execution_authorizations", {
    ...owner,
    script_version_id: seed.id,
    action: "process",
    grants: "{}",
    expires_at: new Date(Date.now() + 86400000),
  });
  async function createTask() {
    const task = await insert("tasks", {
      ...owner,
      name: "runtime long-running fixture",
      execution_context: "PRIVATE_SELF_USE",
    });
    await insert("task_config_versions", {
      ...owner,
      task_id: task,
      version: 1,
      execution_context: "PRIVATE_SELF_USE",
      script_version_id: seed.id,
      action: "process",
      input_payload_id: payload,
      input_digest: "verification",
      schema_digest: "verification",
      schedule: "{}",
      execution: "{}",
      authorization_id: authorization,
      config_digest: "verification",
    });
    await database.query(
      "UPDATE travel.tasks SET current_config_version=1,status='ACTIVE' WHERE id=$1",
      [task],
    );
    return task;
  }
  const version = (
    await database.query(
      "SELECT COALESCE(max(version),0)+1 AS next FROM travel.runtime_policies",
    )
  ).rows[0].next;
  const policy = await insert("runtime_policies", {
    version,
    policy: "{}",
    effective_at: new Date(),
    created_by: seed.owner_user_id,
  });
  const attempts = [];
  for (const [mode, expires, revoked, generation, attemptStatus, runStatus] of [
    ["docker", 1, false, 1, "RUNNING", "RUNNING"],
    ["docker", -1, false, 1, "RUNNING", "RUNNING"],
    ["docker", 1, true, 1, "RUNNING", "RUNNING"],
    ["docker", 1, false, 2, "RUNNING", "RUNNING"],
    ["docker", 1, false, 1, "LOST", "RUNNING"],
    ["docker", 1, false, 1, "RUNNING", "SUCCEEDED"],
    [null, 1, false, 1, "RUNNING", "RUNNING"],
    ["qemu_kvm", 1, false, 1, "RUNNING", "STOPPING"],
    ...[
      "PREPARING",
      "READY",
      "WAITING_INPUT",
      "RECONCILING",
      "FAILED",
      "TIMED_OUT",
      "CANCELLED",
      "EXPIRED",
      "CLOSED_UNRESOLVED",
    ].map((status) => ["docker", 1, false, 1, "EXITED", status]),
  ]) {
    const task = await createTask();
    const run = await insert("runs", {
      ...owner,
      task_id: task,
      config_version: 1,
      script_version_id: seed.id,
      action: "process",
      original_input_ref: payload,
      schema_digest: "verification",
      trigger_kind: "manual",
      trigger_key: randomUUID(),
      run_mode: "continuous",
      status: runStatus,
      effect_status:
        runStatus === "CLOSED_UNRESOLVED" ? "UNKNOWN" : "NONE_OBSERVED",
      current_continuation: "9007199254740993",
      created_at: new Date("2020-01-01"),
    });
    await insert("continuations", {
      ...owner,
      run_id: run,
      number: 0,
      script_version_id: seed.id,
      action: "process",
      input_ref: payload,
      schema_digest: "verification",
      authorization_id: authorization,
      credential_snapshot: "{}",
    });
    const attempt = await insert("attempts", {
      ...owner,
      run_id: run,
      attempt_no: 1,
      continuation_number: 0,
      node_id: nodeId,
      lease_generation: 1,
      requested_execution_mode: "docker",
      actual_execution_mode: mode,
      runtime_policy_id: policy,
      status: attemptStatus,
    });
    attempts.push(attempt);
    await insert("execution_leases", {
      ...owner,
      run_id: run,
      attempt_id: attempt,
      generation,
      expires_at: new Date(Date.now() + expires * 86400000),
      revoked_at: revoked ? new Date() : null,
      last_heartbeat_at: new Date(),
    });
  }
  await insert("runs", {
    ...owner,
    task_id: await createTask(),
    config_version: 1,
    script_version_id: seed.id,
    action: "process",
    original_input_ref: payload,
    schema_digest: "verification",
    trigger_kind: "manual",
    trigger_key: randomUUID(),
    run_mode: "finite",
    status: "QUEUED",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[0],
    node_id: nodeId,
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "PENDING",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[1],
    node_id: nodeId,
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "FAILED",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[2],
    node_id: otherNodes[0],
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "FAILED",
  });

  await database.query(
    `INSERT INTO travel.attempts(id,owner_user_id,run_id,attempt_no,continuation_number,node_id,lease_generation,requested_execution_mode,actual_execution_mode,runtime_policy_id,status,exit_code)
    SELECT gen_random_uuid(),owner_user_id,run_id,2,continuation_number,node_id,2,requested_execution_mode,NULL,runtime_policy_id,'EXITED',0
    FROM travel.attempts WHERE id=$1`,
    [attempts[4]],
  );
  const runs = (
    await database.query(
      "SELECT id,status,task_id FROM travel.runs ORDER BY created_at DESC,id DESC",
    )
  ).rows;
  const logIds = [];
  for (const archive of ["COMMITTED", "MISSING", "DELETED"]) {
    logIds.push(
      await insert("platform_log_segments", {
        source_instance_id: "platform-%_-" + archive,
        sequence_start: "9007199254740993",
        sequence_end: "9007199254740995",
        object_key: "private-object-key-" + randomUUID(),
        checksum: "private-checksum",
        size_bytes: "9223372036854775807",
        started_at: new Date("2020-01-01T00:00:00Z"),
        ended_at: new Date("2020-01-02T00:00:00Z"),
        archive_status: archive,
        index_status: archive === "COMMITTED" ? "INDEXED" : "FAILED",
        expires_at: new Date(
          archive === "DELETED" ? "2020-01-03" : "2099-01-01",
        ),
      }),
    );
  }
  const alerts = [];
  for (const [status, severity, recovered] of [
    ["FIRING", "CRITICAL", null],
    ["ACKNOWLEDGED", "WARNING", null],
    ["RECOVERED", "INFO", new Date()],
  ]) {
    const rule = await insert("alert_rules", {
      rule_key: "platform-%_-" + status,
      version: 1,
      expression: "private-rule-expression",
      severity,
      for_seconds: 60,
      receiver_policy: JSON.stringify({ private_receiver: "receiver-marker" }),
    });
    const alert = await insert("alert_instances", {
      rule_id: rule,
      fingerprint: "private-fingerprint",
      occurrence: "9007199254740993",
      first_seen_at: new Date("2020-01-01"),
      last_seen_at: new Date(),
      recovered_at: recovered,
      status,
    });
    alerts.push(alert);
    await insert("alert_events", {
      instance_id: alert,
      event_type: "OBSERVATION",
      note: "private-event-note",
      evidence: JSON.stringify({ private_marker: "private-alert-evidence" }),
    });
  }
  return { nodeId, otherNodes, imageIds, runs, logIds, alerts };
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
    consumer = await login("consumer@example.invalid");
  const guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  const fixture = await fixtures(database);
  const endpoints = [
    "/admin/runs",
    `/admin/runs/${fixture.runs[0].id}`,
    "/admin/observability/logs?view=segments",
    "/admin/observability/alerts",
  ];
  for (const endpoint of endpoints) {
    expect((await guest.get("/api/v1" + endpoint)).status()).toBe(401);
    expect((await consumer.get("/api/v1" + endpoint)).status()).toBe(403);
  }
  const consumerId = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized='consumer@example.invalid'",
    )
  ).rows[0].id;
  await database.query(
    "INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason) VALUES($1,$2,ARRAY['runtime.observe'],'Diagnostics verification')",
    [randomUUID(), consumerId],
  );
  expect(
    (
      await consumer.get("/api/v1/admin/observability/logs?view=segments")
    ).status(),
  ).toBe(200);
  expect(
    (await consumer.get("/api/v1/admin/observability/alerts")).status(),
  ).toBe(200);
  expect((await consumer.get("/api/v1/admin/runs")).status()).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['runtime.manage'] WHERE owner_user_id=$1",
    [consumerId],
  );
  expect((await consumer.get("/api/v1/admin/runs")).status()).toBe(200);
  expect(
    (await consumer.get("/api/v1/admin/observability/alerts")).status(),
  ).toBe(403);
  report.checks.push(
    "HTTP access separates runtime.manage run metadata from runtime.observe platform logs and alerts, and rechecks changed grants",
  );
  async function get(endpoint) {
    const response = await admin.get("/api/v1" + endpoint);
    expect(response.status(), endpoint + " " + (await response.text())).toBe(
      200,
    );
    expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const runs = await get("/admin/runs?limit=100");
  assert.equal(new Set(runs.data.map((row) => row.status)).size, 13);
  assert.ok(
    runs.data.some(
      (row) =>
        row.status === "CLOSED_UNRESOLVED" && row.effect_status === "UNKNOWN",
    ),
  );
  assert.ok(
    runs.data.some(
      (row) =>
        row.run_mode === "continuous" &&
        row.current_continuation === "9007199254740993",
    ),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.lease_state === "MISMATCHED"),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.lease_state === "REVOKED"),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.lease_state === "EXPIRED"),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.lease_state === "INACTIVE"),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.actual_execution_mode === null),
  );
  assert.ok(
    runs.data.some((row) => row.latest_attempt?.cleanup_status === "FAILED"),
  );
  assert.equal(
    runs.data.filter((row) => row.latest_attempt?.cleanup_status === "FAILED")
      .length,
    1,
  );
  for (const state of new Set(runs.data.map((row) => row.status)))
    assert.ok(
      (await get("/admin/runs?status=" + state)).data.every(
        (row) => row.status === state,
      ),
    );
  assert.ok(
    runs.data.some(
      (row) =>
        row.latest_attempt?.attempt_no === 2 &&
        row.latest_attempt.exit_code === 0 &&
        row.latest_attempt.lease_state === "MISMATCHED",
    ),
  );
  const runId = runs.data.find((row) => row.status === "RUNNING").id;
  assert.equal(
    (await get("/admin/runs/" + runId.toUpperCase())).data.id,
    runId,
  );
  const serialized = JSON.stringify(runs);
  for (const marker of [
    "original_input_ref",
    "private-workspace-marker",
    "raw-capability-marker",
    "runtime long-running fixture",
    "input_ref",
    "credential_snapshot",
  ])
    assert.ok(!serialized.includes(marker), marker);
  report.checks.push(
    "Run reads preserve thirteen states, continuous-run precision, current lease generations, absent actual modes and independently stored cleanup states without private runtime bodies",
  );
  const logs = await get("/admin/observability/logs?view=segments&limit=100");
  assert.equal(logs.data.length, 3);
  assert.ok(
    logs.data.every(
      (row) =>
        row.size_bytes === "9223372036854775807" &&
        row.sequence_start === "9007199254740993",
    ),
  );
  assert.equal(
    logs.data.find((row) => row.archive_status === "DELETED").expired,
    true,
  );
  assert.equal(
    (await get("/admin/observability/logs?view=segments&q=%25_")).data.length,
    3,
  );
  assert.equal(
    (
      await get(
        "/admin/observability/logs?view=segments&from=2020-01-01T12:00:00Z&to=2020-01-01T18:00:00Z",
      )
    ).data.length,
    3,
  );
  assert.equal(
    (
      await get(
        "/admin/observability/logs?view=segments&from=2020-01-02T00:00:01Z",
      )
    ).data.length,
    0,
  );
  const audit = (
    await database.query(
      "SELECT summary FROM travel.audit_events WHERE action='ops.logs.segments.read' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  assert.equal(audit.summary.returned, 0);
  assert.ok(!JSON.stringify(logs).includes("private-object-key"));
  assert.ok(!JSON.stringify(logs).includes("checksum"));
  report.checks.push(
    "Platform log segment metadata preserves 64-bit ranges, overlap windows, missing/deleted archives and expiry, excludes object keys and records successful reads in audit events",
  );
  const alerts = await get("/admin/observability/alerts?limit=100");
  assert.equal(alerts.data.length, 3);
  assert.ok(
    alerts.data.every(
      (row) =>
        row.occurrence === "9007199254740993" &&
        row.event_count === "1" &&
        row.evidence_event_count === "1",
    ),
  );
  assert.equal(
    alerts.data.find((row) => row.status === "ACKNOWLEDGED").recovered_at,
    null,
  );
  assert.equal(
    (await get("/admin/observability/alerts?status=FIRING&severity=CRITICAL"))
      .data.length,
    1,
  );
  for (const marker of [
    "private-rule-expression",
    "receiver-marker",
    "private-fingerprint",
    "private-alert-evidence",
    "private-event-note",
  ])
    assert.ok(!JSON.stringify(alerts).includes(marker));
  report.checks.push(
    "Alert status, recovered time, occurrence and evidence counts remain independent while receiver policies, event notes and evidence bodies stay outside metadata",
  );
  for (const endpoint of [
    "/admin/runs?status=bad",
    "/admin/runs?node_id=bad",
    "/admin/runs?run_mode=bad",
    "/admin/runs?limit=01",
    "/admin/runs?status=RUNNING&status=READY",
    "/admin/runs/unknown",
    `/admin/runs/${runId}?q=x`,
    "/admin/observability/logs",
    "/admin/observability/logs?view=segments&from=2020-02-30T00:00:00Z",
    "/admin/observability/logs?view=segments&from=2020-01-01",
    "/admin/observability/logs?view=segments&from=2020-01-02T00:00:00Z&to=2020-01-01T00:00:00Z",
    "/admin/observability/alerts?severity=bad",
    "/admin/observability/alerts?owner_user_id=x",
  ])
    expect((await admin.get("/api/v1" + endpoint)).status(), endpoint).toBe(
      422,
    );
  expect((await admin.get("/api/v1/admin/runs/" + randomUUID())).status()).toBe(
    404,
  );
  for (const endpoint of [
    "/admin/runs",
    "/admin/observability/logs?view=segments",
    "/admin/observability/alerts",
  ]) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const first = await get(endpoint + separator + "limit=1");
    const next = await get(
      endpoint + separator + "limit=1&cursor=" + first.next_cursor,
    );
    assert.notEqual(first.data[0].id, next.data[0].id);
    expect(
      (
        await admin.get(
          "/api/v1" +
            endpoint +
            separator +
            "limit=1&q=changed&cursor=" +
            first.next_cursor,
        )
      ).status(),
    ).toBe(422);
    expect(
      (
        await admin.get(
          "/api/v1" +
            endpoint +
            separator +
            "limit=1&cursor=" +
            first.next_cursor +
            "x",
        )
      ).status(),
    ).toBe(422);
  }
  report.checks.push(
    "Strict filters reject malformed and repeated input, detail misses stay explicit, and signed keyset cursors bind their query scope without duplicate records",
  );
  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const adapter = {
    root: database.root,
    query: (sql, values) => connection.query(sql, values),
  };
  const pgFixture = await fixtures(adapter);
  const metadata = new AdminMetadataService(
    adapter,
    new PaginationService(adapter),
  );
  const actor = {
    id: consumerId,
    roles: ["ADMIN"],
    capabilities: ["runtime.manage", "runtime.observe"],
    security_revision: "1",
  };
  // Audit actors must exist in the PostgreSQL transaction independently of isolated seeds.
  actor.id = (
    await connection.query("SELECT id FROM travel.users ORDER BY id LIMIT 1")
  ).rows[0].id;
  assert.ok((await metadata.runs(actor, { limit: "100" })).items.length >= 18);
  assert.equal(
    (
      await metadata.run(
        actor,
        pgFixture.runs.find((row) => row.status === "CLOSED_UNRESOLVED").id,
        {},
      )
    ).effect_status,
    "UNKNOWN",
  );
  assert.equal(
    (
      await metadata.platformLogSegments(actor, {
        view: "segments",
        q: pgFixture.logIds[0],
      })
    ).items[0].size_bytes,
    "9223372036854775807",
  );
  assert.equal(
    (await metadata.alerts(actor, { q: pgFixture.alerts[0] })).items[0]
      .occurrence,
    "9007199254740993",
  );
  const first = await metadata.runs(actor, { limit: "1" });
  await assert.rejects(
    metadata.runs(
      { ...actor, security_revision: "2" },
      { limit: "1", cursor: first.nextCursor },
    ),
    (error) => error.status === 422,
  );
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query(
        "SELECT id FROM travel.platform_log_segments WHERE id=$1",
        [pgFixture.logIds[0]],
      )
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 verifies run, log and alert projections, security-revision cursor binding and audited reads inside fully rolled-back transactions",
  );
  // Equal timestamps exercise the UUID tie-breaker during browser pagination.
  await database.query(`INSERT INTO travel.platform_log_segments(id,source_instance_id,sequence_start,sequence_end,object_key,checksum,size_bytes,started_at,ended_at,archive_status,expires_at,created_at)
    SELECT gen_random_uuid(),'paged-platform-'||i,0,1,gen_random_uuid()::text,'private',10,now(),now(),'COMMITTED',now()+interval '1 day','2019-01-01' FROM generate_series(1,23)i`);
  async function businessSnapshot() {
    return (
      await database.query(`SELECT jsonb_build_object(
      'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM travel.runs r),
      'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM travel.execution_leases l),
      'alerts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM travel.alert_instances a),
      'rules',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM travel.alert_rules a),
      'segments',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM travel.platform_log_segments s)
    ) AS state`)
    ).rows[0].state;
  }
  const before = await businessSnapshot();
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
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
    });
    report.screenshots.push(id);
  }
  async function choose(scope, label, value) {
    await scope.getByRole("combobox", { name: label, exact: true }).click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText(value, { exact: true })
      .click();
    await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  }
  await page.goto(web + "/admin/runs?run=Run082");
  await expect(page.getByRole("dialog")).toContainText("kvm02");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Run082");
  await page.getByRole("button", { name: "关闭运行详情", exact: true }).click();
  await page.goto(web + "/admin/runs?run=unknown");
  await expect(page.getByRole("dialog")).toContainText("运行 unknown 不可用");
  await page
    .getByRole("button", { name: "受控停止", exact: true })
    .isDisabled()
    .then(assert.ok);
  await page.goto(web + "/admin/runs");
  await capture("ADMIN-O15");
  await page.goto(
    web + "/admin/observability?log_service=景点预约服务&alert_minutes=5",
  );
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(2);
  await expect(page.locator(".admin-alert-panel .ant-table-row")).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(2);
  await page.goto(web + "/admin/observability");
  await capture("ADMIN-O16");
  const firstAlert = page
    .locator(".admin-alert-panel .ant-table-row")
    .filter({ hasText: "支付回调积压" });
  await firstAlert
    .getByRole("button", { name: "规则设置", exact: true })
    .click();
  await choose(page.getByRole("dialog"), "严重级别", "低");
  await page
    .getByRole("dialog")
    .getByLabel("持续秒数", { exact: true })
    .fill("120");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("诊断规则版本校验");
  await page.getByRole("button", { name: "保存预览", exact: true }).click();
  await firstAlert
    .getByRole("button", { name: "规则设置", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("持续秒数", { exact: true }),
  ).toHaveValue("120");
  await choose(page.getByRole("dialog"), "规则", "节点租约过期");
  await expect(
    page.getByRole("dialog").getByLabel("持续秒数", { exact: true }),
  ).toHaveValue("60");
  await choose(page.getByRole("dialog"), "规则", "支付回调积压");
  await expect(
    page.getByRole("dialog").getByLabel("持续秒数", { exact: true }),
  ).toHaveValue("120");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("诊断规则第三版");
  await page.getByRole("button", { name: "保存预览", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "权限与操作审计" })
    .click();
  await expect(page.locator(".admin-page")).toContainText("规则草稿v3");
  report.checks.push(
    "Prototype run selection and independent log/alert filters restore from URL, unknown runs remain unavailable and switching rule drafts restores every field while successive saves advance versions",
  );
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "日志与告警" })
    .click();
  await page.clock.install();
  await firstAlert
    .getByRole("button", { name: "限时静默", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("静默分钟数", { exact: true })
    .fill("1");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("验证静默自动过期");
  await page.getByRole("button", { name: "保存预览", exact: true }).click();
  await expect(firstAlert).toContainText("结束静默");
  await page.clock.fastForward(61000);
  await expect(firstAlert).not.toContainText("结束静默");
  await expect(firstAlert).toContainText("队列积压已回落");
  report.checks.push(
    "Prototype silence controls expire on an idle page at their actual deadline while recovery evidence remains unchanged",
  );
  await page.clock.resume();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, id] of [
    ["/admin/runs", "ADMIN-O15-prototype-mobile"],
    ["/admin/observability", "ADMIN-O16-prototype-mobile"],
  ]) {
    await page.goto(web + route);
    await capture(id);
    if (id === "ADMIN-O16-prototype-mobile") {
      const brand = await page.locator(".brand strong").boundingBox();
      const actions = await page.locator(".topbar-actions").boundingBox();
      assert.ok(brand.x + brand.width <= actions.x);
      const content = page.locator(".admin-alert-panel .ant-table-content");
      await content.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const action = await page
        .locator(".admin-alert-panel .ant-table-row")
        .first()
        .getByRole("button", { name: "规则设置", exact: true })
        .boundingBox();
      assert.ok(action.x >= 16 && action.x + action.width <= 374);
    }
    const bounds = await page.locator(".admin-page").boundingBox();
    assert.equal(bounds.x, 16);
    assert.equal(bounds.width, 358);
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
  let failRuns = true;
  await ui.route("**/api/v1/admin/runs?**", async (route) =>
    failRuns
      ? route.fulfill({
          status: 503,
          json: { error: { message: "unavailable" } },
        })
      : route.continue(),
  );
  await page.goto(web + "/admin/runs");
  await expect(page.getByText("运行查询失败", { exact: true })).toBeVisible();
  failRuns = false;
  await page.getByRole("button", { name: "重试运行查询", exact: true }).click();
  await expect(page.locator(".admin-runs-table .ant-table-row")).toHaveCount(
    18,
  );
  await page.goto(web + "/admin/runs?run=" + runId);
  await expect(page.getByRole("dialog")).toContainText("9007199254740993");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "受控停止", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(runId);
  await page.goto(web + "/admin/runs?run=" + randomUUID());
  await expect(page.getByText("运行详情不可用", { exact: true })).toBeVisible();
  await page.goto(web + "/admin/runs");
  await capture("ADMIN-O15-live");
  report.checks.push(
    "LIVE run queries retry errors, restore exact details from URL and expose pending controls with unknown selections kept explicit",
  );
  let failObservation = true;
  await ui.route("**/api/v1/admin/observability/**", async (route) =>
    failObservation
      ? route.fulfill({
          status: 503,
          json: { error: { message: "unavailable" } },
        })
      : route.continue(),
  );
  await page.goto(web + "/admin/observability");
  await expect(
    page.getByText("日志分段查询失败", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("告警查询失败", { exact: true })).toBeVisible();
  failObservation = false;
  await page.getByRole("button", { name: "重试日志查询", exact: true }).click();
  await page.getByRole("button", { name: "重试告警查询", exact: true }).click();
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(20);
  await page
    .getByRole("button", { name: "加载更多日志分段", exact: true })
    .click();
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(26);
  await page
    .getByRole("searchbox", { name: "平台日志来源搜索", exact: true })
    .fill("platform-%_");
  await page
    .getByRole("searchbox", { name: "平台日志来源搜索", exact: true })
    .press("Enter");
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(3);
  await expect(page.locator(".admin-log-panel")).toContainText(
    "9223372036854775807",
  );
  await choose(page, "告警状态筛选", "已确认");
  await expect(page.locator(".admin-alert-panel .ant-table-row")).toHaveCount(
    1,
  );
  await expect(page.locator(".admin-alert-panel")).toContainText(
    "ACKNOWLEDGED",
  );
  await expect(page.locator(".admin-alert-panel")).toContainText("未记录");
  await page.reload();
  await expect(page.locator(".admin-alert-panel .ant-table-row")).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "限时静默", exact: true }),
  ).toBeDisabled();
  await choose(page, "平台日志时间范围", "近1小时");
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(0);
  await expect(page.locator(".admin-log-panel")).toContainText("查询时间");
  await choose(page, "平台日志时间范围", "全部时间");
  await expect(page.locator(".admin-log-panel .ant-table-row")).toHaveCount(3);
  await capture("ADMIN-O16-live");
  report.checks.push(
    "LIVE logs paginate and search literal source IDs with exact BIGINT values, and alert filters preserve acknowledged states and missing recovery times across reloads",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/admin/runs", "/admin/observability"]) {
    await page.goto(web + route);
    await expect(page.locator(".admin-page h1")).toBeVisible();
    const bounds = await page.locator(".admin-page").boundingBox();
    assert.equal(bounds.x, 16);
    assert.equal(bounds.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    const id = route.endsWith("runs") ? "ADMIN-O15-mobile" : "ADMIN-O16-mobile";
    await capture(id);
    report.layouts[id] = { left: bounds.x, width: bounds.width };
  }
  assert.deepEqual(await businessSnapshot(), before);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "Desktop and 390px LIVE routes retain full-width content and internal table scrolling while metadata reads leave runtime business records unchanged",
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
