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
const output = path.resolve("output/verification/admin-delivery-settings");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "admin-delivery-settings-" + randomUUID(),
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
  const seed = (
    await database.query(
      "SELECT id,owner_user_id FROM travel.script_versions WHERE content_status='READY' ORDER BY id LIMIT 1",
    )
  ).rows[0];
  const owner = { owner_user_id: seed.owner_user_id };
  const payload = await insert("private_payloads", {
    ...owner,
    purpose: "delivery-fixture",
    key_version: "fixture",
    ciphertext: Buffer.from("private-message-body"),
    content_hmac: randomUUID(),
    size_bytes: 20,
  });
  const nextVersion = Number(
    (
      await database.query(
        "SELECT COALESCE(max(version),0)+1 AS n FROM travel.runtime_policies",
      )
    ).rows[0].n,
  );
  const policyIds = [];
  for (const [version, effective] of [
    [nextVersion, "2020-01-01"],
    [nextVersion + 1, "2021-01-01"],
    [nextVersion + 2, "2099-01-01"],
  ])
    policyIds.push(
      await insert("runtime_policies", {
        version,
        effective_at: new Date(effective),
        created_by: seed.owner_user_id,
        policy: JSON.stringify({ private: "private-policy-marker" }),
      }),
    );
  const authorization = await insert("execution_authorizations", {
    ...owner,
    script_version_id: seed.id,
    action: "process",
    grants: "{}",
    expires_at: new Date("2099-01-01"),
  });
  const task = await insert("tasks", {
    ...owner,
    name: "private-task-marker",
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
    input_digest: "fixture",
    schema_digest: "fixture",
    schedule: "{}",
    execution: "{}",
    authorization_id: authorization,
    config_digest: "fixture",
  });
  const run = await insert("runs", {
    ...owner,
    task_id: task,
    config_version: 1,
    script_version_id: seed.id,
    action: "process",
    original_input_ref: payload,
    schema_digest: "fixture",
    trigger_kind: "manual",
    trigger_key: randomUUID(),
    run_mode: "finite",
    status: "SUCCEEDED",
  });
  await insert("continuations", {
    ...owner,
    run_id: run,
    number: 0,
    script_version_id: seed.id,
    action: "process",
    input_ref: payload,
    schema_digest: "fixture",
    authorization_id: authorization,
    credential_snapshot: "{}",
  });
  const node = await insert("nodes", {
    name: "notification-fixture",
    certificate_fingerprint: randomUUID(),
  });
  const attempt = await insert("attempts", {
    ...owner,
    run_id: run,
    attempt_no: 1,
    continuation_number: 0,
    node_id: node,
    lease_generation: 1,
    requested_execution_mode: "docker",
    runtime_policy_id: policyIds[1],
    status: "EXITED",
    exit_code: 0,
  });
  const invocation = await insert("hook_invocations", {
    ...owner,
    attempt_id: attempt,
    script_version_id: seed.id,
    action: "process",
    purpose: "BUSINESS",
    input_ref: payload,
    schema_digest: "fixture",
  });
  const series = await insert("output_series", {
    ...owner,
    run_id: run,
    task_id: task,
    config_version: 1,
    scope: "RUN",
    dedup_expires_at: new Date("2099-01-01"),
  });
  const emission = await insert("output_generations", {
    ...owner,
    invocation_id: invocation,
    output_series_id: series,
    sequence: 0,
    producer_kind: "HOOK",
    reason: "explicit",
    deadline: new Date("2099-01-01"),
  });
  const batch = await insert("output_batches", {
    ...owner,
    output_series_id: series,
    batch_key: randomUUID(),
    invocation_id: invocation,
    emission_id: emission,
    phase: "OUTPUT_HOOK",
  });
  const output = await insert("script_outputs", {
    ...owner,
    batch_id: batch,
    output_key: "message",
    kind: "message",
    title: "private-output-title",
    payload_id: payload,
    content_digest: "fixture",
    media_type: "application/json",
    size_bytes: 20,
    expires_at: new Date("2099-01-01"),
    status: "READY",
  });
  const bindings = [];
  for (const channel of ["IN_APP", "EMAIL", "WEBHOOK", "PUSH"])
    bindings.push(
      await insert("notification_bindings", {
        ...owner,
        channel,
        display_name: "private-binding-name",
        target_payload_id: payload,
        masked_target: "u****@example.invalid",
        verified_at: new Date(),
        policy: JSON.stringify({ private: "private-channel-policy" }),
      }),
    );
  const deliveryIds = [];
  for (const [i, status] of [
    "PENDING",
    "SENDING",
    "SENT",
    "UNKNOWN",
    "FAILED",
    "SUPPRESSED",
  ].entries()) {
    const event = await insert("outbox_events", {
      ...owner,
      aggregate_type: "fixture",
      aggregate_id: randomUUID(),
      aggregate_revision: 1,
      event_type: "custom.%_" + status,
      payload: JSON.stringify({ private: "private-event-payload" }),
      request_id: randomUUID(),
      occurred_at: new Date(),
    });
    const notification = await insert("notifications", {
      ...owner,
      event_id: event,
      channel: ["IN_APP", "EMAIL", "WEBHOOK", "PUSH"][i % 4],
      content_ref: payload,
      read_at: status === "SENT" ? new Date() : null,
      expires_at: new Date(
        status === "SUPPRESSED" ? "2020-01-01" : "2099-01-01",
      ),
    });
    const delivery = await insert("notification_deliveries", {
      ...owner,
      notification_id: notification,
      channel_binding_id: bindings[i === 0 ? 3 : i % 4],
      delivery_key: "private-delivery-key-" + randomUUID(),
      status,
      attempt_count: i === 0 ? 0 : 2,
      provider_ref: i === 0 ? null : i === 1 ? "123" : "private-provider-ABCD",
      failure_code: status === "FAILED" ? "PROVIDER_REJECTED" : null,
      dependency_deadline: status === "PENDING" ? new Date("2099-01-01") : null,
      created_at: new Date("2020-01-01T00:00:00.123456Z"),
    });
    deliveryIds.push(delivery);
    if (i !== 0)
      for (const number of [1, 2])
        await insert("delivery_attempts", {
          ...owner,
          delivery_id: delivery,
          attempt_no: number,
          provider_ref: "private-attempt-EFGH",
          status:
            number === 1
              ? "FAILED"
              : status === "SUPPRESSED"
                ? "UNKNOWN"
                : status,
          sent_at: new Date(),
          duplicate_risk: number === 2 && status === "UNKNOWN",
        });
  }
  const notification = await insert("notifications", {
    ...owner,
    message_output_id: output,
    channel: "EMAIL",
    content_ref: payload,
    expires_at: new Date("2099-01-01"),
  });
  const outputDelivery = await insert("notification_deliveries", {
    ...owner,
    notification_id: notification,
    message_output_id: output,
    channel_binding_id: bindings[1],
    delivery_key: randomUUID(),
    status: "SENT",
    provider_ref: "private-output-receipt-IJKL",
  });
  deliveryIds.push(outputDelivery);
  const secondEmission = await insert("output_generations", {
    ...owner,
    invocation_id: invocation,
    output_series_id: series,
    sequence: 1,
    producer_kind: "HOOK",
    reason: "interval",
    deadline: new Date("2099-01-01"),
  });
  const secondBatch = await insert("output_batches", {
    ...owner,
    output_series_id: series,
    batch_key: randomUUID(),
    invocation_id: invocation,
    emission_id: secondEmission,
    phase: "OUTPUT_HOOK",
  });
  const secondOutput = await insert("script_outputs", {
    ...owner,
    batch_id: secondBatch,
    output_key: "message",
    kind: "message",
    payload_id: payload,
    content_digest: "fixture-second",
    media_type: "application/json",
    size_bytes: 20,
    expires_at: new Date("2099-01-01"),
    status: "READY",
  });
  const secondNotification = await insert("notifications", {
    ...owner,
    message_output_id: secondOutput,
    channel: "EMAIL",
    content_ref: payload,
    expires_at: new Date("2099-01-01"),
  });
  deliveryIds.push(
    await insert("notification_deliveries", {
      ...owner,
      notification_id: secondNotification,
      message_output_id: secondOutput,
      channel_binding_id: bindings[1],
      delivery_key: randomUUID(),
      status: "SENT",
    }),
  );

  const featureIds = [];
  for (const [i, phase] of ["P0", "P1", "P2", "SCENE"].entries())
    featureIds.push(
      await insert("platform_features", {
        key: "feature.%_" + phase,
        enabled: i % 2 === 0,
        phase,
        evidence:
          i === 0
            ? JSON.stringify({ private: "private-feature-evidence" })
            : "{}",
        updated_by: seed.owner_user_id,
        revision: "9007199254740993",
      }),
    );
  const networkIds = [];
  for (const key of ["network.%_first", "network.%_second"])
    for (const [version, effective] of [
      [1, "2020-01-01"],
      [2, "2021-01-01"],
      [3, "2099-01-01"],
    ])
      networkIds.push(
        await insert("network_policies", {
          policy_key: key,
          version,
          rules: JSON.stringify({ private: "private-network-rules" }),
          effective_at: new Date(effective),
          created_by: seed.owner_user_id,
        }),
      );
  const profiles = [];
  for (const [version, retired] of [
    [1, new Date("2020-01-01")],
    [2, null],
  ])
    profiles.push(
      await insert("resource_profiles", {
        name: "resource.%_",
        version,
        limits: JSON.stringify({ private: "private-resource-limits" }),
        retired_at: retired,
      }),
    );
  return {
    deliveryIds,
    outputDelivery,
    featureIds,
    networkIds,
    profiles,
    policyIds,
    nextVersion,
    ownerId: seed.owner_user_id,
    bindings,
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
    "notification-deliveries",
    "notification-deliveries/" + fixture.deliveryIds[0],
    "features",
    "network-policies",
    "runtime-policies",
    "resource-profiles",
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
  await database.query(
    "INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason) VALUES($1,$2,ARRAY['observability.manage'],'Delivery settings verification')",
    [randomUUID(), consumerId],
  );
  expect(
    (await consumer.get("/api/v1/admin/notification-deliveries")).status(),
  ).toBe(200);
  expect((await consumer.get("/api/v1/admin/features")).status()).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['runtime.manage'] WHERE owner_user_id=$1",
    [consumerId],
  );
  expect((await consumer.get("/api/v1/admin/features")).status()).toBe(200);
  expect(
    (await consumer.get("/api/v1/admin/notification-deliveries")).status(),
  ).toBe(403);
  report.checks.push(
    "HTTP access separates observability.manage delivery metadata from runtime.manage configuration records and rechecks updated management grants",
  );
  async function get(endpoint) {
    const response = await admin.get("/api/v1/admin/" + endpoint);
    expect(response.status(), endpoint + " " + (await response.text())).toBe(
      200,
    );
    expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const deliveries = await get("notification-deliveries?limit=100");
  assert.equal(deliveries.data.length, 8);
  assert.equal(new Set(deliveries.data.map((row) => row.status)).size, 6);
  const zero = deliveries.data.find((row) => row.id === fixture.deliveryIds[0]);
  assert.equal(zero.attempt_count, 0);
  assert.equal(zero.latest_attempt, null);
  assert.ok(zero.dependency_deadline);
  const sent = deliveries.data.find((row) => row.id === fixture.deliveryIds[2]);
  assert.ok(sent.read_at);
  assert.equal(sent.status, "SENT");
  assert.equal(sent.receipt_mask, "****ABCD");
  assert.equal(sent.latest_attempt.attempt_no, 2);
  assert.equal(sent.latest_attempt.receipt_mask, "****EFGH");
  assert.equal(
    deliveries.data.find((row) => row.id === fixture.deliveryIds[1])
      .receipt_mask,
    "****",
  );
  assert.equal(
    deliveries.data.find((row) => row.id === fixture.deliveryIds[3])
      .latest_attempt.duplicate_risk,
    true,
  );
  assert.equal(
    deliveries.data.find((row) => row.id === fixture.deliveryIds[5])
      .notification_expired,
    true,
  );
  const outputRow = deliveries.data.find(
    (row) => row.id === fixture.outputDelivery,
  );
  assert.equal(outputRow.source, "OUTPUT");
  assert.equal(outputRow.read_at, null);
  assert.equal(outputRow.output_binding_matches, true);
  assert.equal(
    (await get("notification-deliveries?source=OUTPUT")).data.length,
    2,
  );
  assert.equal(
    (await get("notification-deliveries?channel=WEBHOOK&status=SENT")).data
      .length,
    1,
  );
  assert.equal((await get("notification-deliveries?q=%25_")).data.length, 6);
  assert.equal(
    (
      await get(
        "notification-deliveries?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z",
      )
    ).data.length,
    6,
  );
  assert.equal(
    (
      await get(
        "notification-deliveries/" + fixture.outputDelivery.toUpperCase(),
      )
    ).data.id,
    fixture.outputDelivery,
  );
  for (const marker of [
    "private-message-body",
    "content_ref",
    "target_payload_id",
    "private-provider-",
    "private-attempt-",
    "private-output-title",
    "private-channel-policy",
    "private-delivery-key-",
    "private-event-payload",
  ])
    assert.ok(!JSON.stringify(deliveries).includes(marker), marker);
  report.checks.push(
    "Delivery metadata retains six transport states, independent read and expiry times, zero attempts, latest sending evidence and repeated-output source identity while masking receipts and excluding message, target and policy bodies",
  );
  assert.equal(
    (await get("notification-deliveries/" + fixture.deliveryIds[0])).data
      .binding_state,
    "CHANNEL_MISMATCH",
  );
  const features = await get("features?limit=100");
  assert.equal(features.data.length, 4);
  assert.ok(features.data.every((row) => row.revision === "9007199254740993"));
  assert.equal((await get("features?enabled=true")).data.length, 2);
  assert.equal((await get("features?phase=P2")).data[0].has_evidence, false);
  const runtime = await get("runtime-policies");
  assert.equal(runtime.data.filter((row) => row.is_current).length, 1);
  assert.equal(
    runtime.data.find((row) => row.is_current).version,
    fixture.nextVersion + 1,
  );
  assert.ok(
    runtime.data.find((row) => row.version === fixture.nextVersion + 2)
      .is_future,
  );
  const network = await get("network-policies");
  assert.equal(network.data.filter((row) => row.is_current).length, 2);
  assert.equal(network.data.filter((row) => row.is_future).length, 2);
  const profiles = await get("resource-profiles?q=resource.%25_");
  assert.equal(profiles.data.length, 2);
  assert.equal(profiles.data.filter((row) => row.retired_at).length, 1);
  for (const marker of [
    "private-feature-evidence",
    "private-policy-marker",
    "private-network-rules",
    "private-resource-limits",
  ])
    assert.ok(
      !JSON.stringify([features, runtime, network, profiles]).includes(marker),
    );
  report.checks.push(
    "Configuration metadata preserves exact revisions, feature flags and evidence presence, per-key active policy versions, future effective dates and resource retirement independently of policy bodies and control execution",
  );
  for (const endpoint of [
    "notification-deliveries?status=bad",
    "notification-deliveries?channel=bad",
    "notification-deliveries?source=bad",
    "notification-deliveries?status=SENT&status=FAILED",
    "notification-deliveries?from=2020-02-30T00:00:00Z",
    "notification-deliveries?from=2020-01-02T00:00:00Z&to=2020-01-01T00:00:00Z",
    "notification-deliveries/invalid",
    "notification-deliveries/" + fixture.outputDelivery + "?q=x",
    "features?enabled=1",
    "features?phase=bad",
    "features?limit=0",
    "runtime-policies?enabled=true",
    "resource-profiles?status=ACTIVE",
    "network-policies?owner_user_id=x",
  ])
    expect(
      (await admin.get("/api/v1/admin/" + endpoint)).status(),
      endpoint,
    ).toBe(422);
  expect(
    (
      await admin.get("/api/v1/admin/notification-deliveries/" + randomUUID())
    ).status(),
  ).toBe(404);
  for (const endpoint of [
    "notification-deliveries",
    "features",
    "runtime-policies",
    "network-policies",
    "resource-profiles",
  ]) {
    const first = await get(endpoint + "?limit=1");
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
    "Strict query validation and signed keyset cursors reject unsupported filters, repeated fields, invalid dates and changed list scopes while direct UUID details preserve unavailable identities",
  );
  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const adapter = {
      root: database.root,
      query: (sql, values) => connection.query(sql, values),
    },
    pgFixture = await fixtures(adapter);
  const metadata = new AdminMetadataService(
    adapter,
    new PaginationService(adapter),
  );
  const actor = {
    id: pgFixture.ownerId,
    roles: ["ADMIN"],
    capabilities: ["runtime.manage", "observability.manage"],
    security_revision: "1",
  };
  assert.equal(
    (await metadata.delivery(actor, pgFixture.outputDelivery, {})).source,
    "OUTPUT",
  );
  assert.equal(
    (
      await metadata.configuration(actor, "features", {
        q: pgFixture.featureIds[0],
      })
    ).items[0].revision,
    "9007199254740993",
  );
  for (const [kind, id] of [
    ["runtime-policies", pgFixture.policyIds[1]],
    ["network-policies", pgFixture.networkIds[1]],
    ["resource-profiles", pgFixture.profiles[1]],
  ])
    assert.equal(
      (await metadata.configuration(actor, kind, { q: id })).items.length,
      1,
    );
  const cursor = (await metadata.deliveries(actor, { limit: "1" })).nextCursor;
  await assert.rejects(
    metadata.deliveries(
      { ...actor, security_revision: "2" },
      { limit: "1", cursor },
    ),
    (error) => error.status === 422,
  );
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query(
        "SELECT id FROM travel.notification_deliveries WHERE id=$1",
        [pgFixture.outputDelivery],
      )
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 verifies delivery/output joins, decimal-string configuration metadata and security-revision cursors inside fully rolled-back transactions",
  );
  await database.query(
    `INSERT INTO travel.platform_features(id,key,phase,updated_by,created_at) SELECT gen_random_uuid(),'paged-feature-'||i,'P1',$1,'2019-01-01' FROM generate_series(1,23)i`,
    [fixture.ownerId],
  );
  await database.query(
    `INSERT INTO travel.network_policies(id,policy_key,version,rules,effective_at,created_by,created_at) SELECT gen_random_uuid(),'paged-network-'||i,1,'{}','2020-01-01',$1,'2019-01-01' FROM generate_series(1,23)i`,
    [fixture.ownerId],
  );
  async function businessSnapshot() {
    return (
      await database.query(
        `SELECT jsonb_build_object('deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM travel.notification_deliveries d),'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM travel.notifications n),'features',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM travel.platform_features f),'network',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM travel.network_policies n)) AS state`,
      )
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
    await scope.getByRole("combobox", { name: label, exact: true }).click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText(value, { exact: true })
      .click();
    await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  }
  await page.goto(web + "/admin/deliveries");
  await capture("ADMIN-O17");
  await page.goto(
    web + "/admin/deliveries?type=运行&channel=邮件&status=FAILED",
  );
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(10);
  await page.goto(web + "/admin/deliveries?delivery=D05");
  await expect(page.getByRole("dialog")).toContainText("MSG-****F64B");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("MSG-****F64B");
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("查询原服务商回执");
  await page
    .getByRole("button", { name: "确认操作预览", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  const unknown = page
    .locator(".admin-delivery-table .ant-table-row")
    .filter({ hasText: "MSG-****F64B" });
  await expect(unknown).toContainText("UNKNOWN");
  await expect(
    unknown.getByRole("button", { name: "核验待处理", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "权限与操作审计" })
    .click();
  await expect(
    page
      .locator(".admin-access-columns .ant-table-row")
      .filter({ hasText: "查询原服务商回执" }),
  ).toHaveCount(1);
  await page.goto(web + "/admin/deliveries?delivery=missing");
  await expect(page.getByRole("dialog")).toContainText("投递 missing 不可用");
  report.checks.push(
    "Prototype delivery filters and selected original receipts restore from URL, reset clears applied filters and unknown-receipt reconciliation keeps UNKNOWN while preventing duplicate preview requests",
  );
  await page.goto(web + "/admin/settings");
  await capture("ADMIN-O18");
  await page.getByRole("button", { name: "销售保护", exact: true }).click();
  await expect(page).toHaveURL(/tab=protection/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "销售保护", exact: true }),
  ).toHaveClass(/ant-btn-primary/);
  await page.getByRole("switch", { name: "暂停新销售", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("处理理由", { exact: true })
    .fill("维护期间控制新销售");
  await page
    .getByRole("button", { name: "确认操作预览", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole("switch", { name: "暂停新销售", exact: true }),
  ).toBeChecked();
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "通知投递" })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "平台设置" })
    .click();
  await expect(
    page.getByRole("switch", { name: "暂停新销售", exact: true }),
  ).toBeChecked();
  await page
    .locator(".sidebar")
    .getByRole("link")
    .filter({ hasText: "权限与操作审计" })
    .click();
  await expect(
    page
      .locator(".admin-access-columns .ant-table-row")
      .filter({ hasText: "维护期间控制新销售" }),
  ).toHaveCount(1);
  report.checks.push(
    "Prototype platform tabs persist through reload while confirmed protection previews retain their state across normal in-app navigation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, id] of [
    ["/admin/deliveries", "ADMIN-O17-prototype-mobile"],
    ["/admin/settings", "ADMIN-O18-prototype-mobile"],
  ]) {
    await page.goto(web + route);
    await capture(id);
    const bounds = await page.locator(".admin-page").boundingBox();
    assert.equal(bounds.x, 16);
    assert.equal(bounds.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    const brand = await page.locator(".brand strong").boundingBox(),
      actions = await page.locator(".topbar-actions").boundingBox();
    assert.ok(brand.x + brand.width <= actions.x);
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  await ui.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  let failDelivery = true;
  await ui.route("**/api/v1/admin/notification-deliveries?**", (route) =>
    failDelivery
      ? route.fulfill({
          status: 503,
          json: { error: { message: "unavailable" } },
        })
      : route.continue(),
  );
  await page.goto(web + "/admin/deliveries");
  await expect(page.getByText("投递查询失败", { exact: true })).toBeVisible();
  failDelivery = false;
  await page.getByRole("button", { name: "重试投递查询", exact: true }).click();
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(8);
  await capture("ADMIN-O17-live");
  await choose(page, "投递状态筛选", "服务商已接受");
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(3);
  await page.reload();
  await expect(
    page.locator(".admin-delivery-table .ant-table-row"),
  ).toHaveCount(3);
  await page.goto(web + "/admin/deliveries?delivery=" + fixture.outputDelivery);
  await expect(page.getByRole("dialog")).toContainText("脚本产物");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(fixture.outputDelivery);
  await page.goto(web + "/admin/deliveries?delivery=" + randomUUID());
  await expect(page.getByText("投递详情不可用", { exact: true })).toBeVisible();
  report.checks.push(
    "LIVE delivery queries retry errors, preserve transport filters and direct message identities across reloads, retain separate read state and leave unavailable records explicit",
  );
  let failFeatures = true;
  await ui.route("**/api/v1/admin/features?**", (route) =>
    failFeatures
      ? route.fulfill({
          status: 503,
          json: { error: { message: "unavailable" } },
        })
      : route.continue(),
  );
  await page.goto(web + "/admin/settings");
  await expect(
    page.getByText("能力配置查询失败", { exact: true }),
  ).toBeVisible();
  failFeatures = false;
  await page.getByRole("button", { name: "重试能力查询", exact: true }).click();
  await expect(page.locator("#platform-basic .ant-table-row")).toHaveCount(20);
  await page
    .getByRole("button", { name: "加载更多能力配置", exact: true })
    .click();
  await expect(page.locator("#platform-basic .ant-table-row")).toHaveCount(27);
  await page
    .getByRole("searchbox", { name: "功能键搜索", exact: true })
    .fill("feature.%_");
  await page
    .getByRole("searchbox", { name: "功能键搜索", exact: true })
    .press("Enter");
  await expect(page.locator("#platform-basic .ant-table-row")).toHaveCount(4);
  await page
    .getByRole("button", { name: "加载更多网络策略", exact: true })
    .click();
  await expect(page.locator("#platform-network .ant-table-row")).toHaveCount(
    29,
  );
  await expect(page.locator("#platform-protection")).toContainText(
    "状态待接入",
  );
  await capture("ADMIN-O18-live");
  await page
    .getByRole("button", { name: "查看执行策略版本", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("待生效");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("当前生效");
  await page.getByRole("button", { name: "关闭策略详情", exact: true }).click();
  await page
    .getByRole("button", { name: "查看资源模板版本", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("resource.%_");
  await page.getByRole("button", { name: "关闭策略详情", exact: true }).click();
  report.checks.push(
    "LIVE platform settings paginate and search literal feature keys, retry failed reads, preserve active and future policy versions and restore metadata dialogs from URL without asserting unimplemented protection controls",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, id] of [
    ["/admin/deliveries", "ADMIN-O17-mobile"],
    ["/admin/settings", "ADMIN-O18-mobile"],
  ]) {
    await page.goto(web + route);
    await capture(id);
    const bounds = await page.locator(".admin-page").boundingBox();
    assert.equal(bounds.x, 16);
    assert.equal(bounds.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    report.layouts[id] = { left: bounds.x, width: bounds.width };
  }
  assert.deepEqual(await businessSnapshot(), before);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "Desktop and 390px prototype/LIVE routes retain full-width layouts and internal table scrolling while metadata interactions leave notification and platform business records unchanged",
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
