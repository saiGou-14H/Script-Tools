import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";

loadEnvFile(".env");
const output = path.resolve("output/verification/consumer-overview");
await mkdir(output, { recursive: true });
const base = "http://127.0.0.1:5174";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch();
const require = createRequire(import.meta.url);
const {
  MonitoringService,
} = require("../apps/control-api/dist/monitoring/monitoring.service.js");
const {
  OutputQueryService,
} = require("../apps/control-api/dist/outputs/output-query.service.js");
const {
  PaginationService,
} = require("../apps/control-api/dist/common/pagination.service.js");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
};
let connection;
async function insert(table, values) {
  const record = { id: randomUUID(), ...values };
  const columns = Object.keys(record);
  await connection.query(
    `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    Object.values(record),
  );
  return record.id;
}
async function contextFor(live = false) {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  expect(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "consumer@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
  ).toBe(200);
  if (live)
    await context.route("**/api/v1/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.data_mode = "live";
      await route.fulfill({ json: body });
    });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  return { context, page };
}
async function capture(page, name, selector) {
  await page.locator(selector).waitFor();
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
  });
  report.screenshots.push(name);
  report.layouts[name] = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  expect(report.layouts[name].documentWidth).toBe(1814);
  expect(report.layouts[name].documentHeight).toBe(868);
}
try {
  const guest = await browser.newContext();
  expect(
    (await guest.request.get(base + "/api/v1/monitoring/overview")).status(),
  ).toBe(401);
  await guest.close();
  const authenticated = await contextFor();
  const response = await authenticated.context.request.get(
    base + "/api/v1/monitoring/overview",
  );
  expect(response.status()).toBe(200);
  const liveEnvelope = await response.json();
  assert.ok(
    liveEnvelope.data.as_of &&
      liveEnvelope.data.window.from &&
      liveEnvelope.data.window.to,
  );
  for (const count of Object.values(liveEnvelope.data.counts))
    assert.match(count, /^\d+$/);
  for (const query of [
    "owner=other",
    "from=2026-02-30T00:00:00Z",
    "from=2026-11-15T00:00:00Z&to=2026-11-14T00:00:00Z",
    "from=2026-11-13",
    "to=invalid",
  ]) {
    expect(
      (
        await authenticated.context.request.get(
          base + `/api/v1/monitoring/overview?${query}`,
        )
      ).status(),
    ).toBe(422);
  }
  await authenticated.context.close();
  report.checks.push(
    "personal overview requires authentication, returns its effective window and as_of, preserves integer counts and rejects owner selection and invalid dates",
  );

  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const accounts = (
    await connection.query(
      "SELECT id,email_normalized FROM travel.users WHERE email_normalized=ANY($1::text[])",
      [["publisher@example.invalid", "consumer@example.invalid"]],
    )
  ).rows;
  const publisher = accounts.find(
    (user) => user.email_normalized === "publisher@example.invalid",
  ).id;
  const consumer = accounts.find(
    (user) => user.email_normalized === "consumer@example.invalid",
  ).id;
  const version = (
    await connection.query(
      "SELECT id FROM travel.script_versions WHERE owner_user_id=$1 AND content_status='READY' ORDER BY id LIMIT 1",
      [publisher],
    )
  ).rows[0].id;
  const owner = { owner_user_id: publisher };
  const monitoring = new MonitoringService(connection);
  const baseline = await monitoring.overview(publisher);
  const payload = await insert("private_payloads", {
    ...owner,
    purpose: "overview-verification",
    key_version: "verification",
    ciphertext: Buffer.from("inert-encrypted-fixture"),
    content_hmac: randomUUID(),
    size_bytes: 23,
  });
  const authorization = await insert("execution_authorizations", {
    ...owner,
    script_version_id: version,
    action: "process",
    grants: "{}",
    expires_at: new Date(Date.now() + 86_400_000),
  });
  const oldDate = new Date(Date.now() - 60 * 86_400_000);
  const task = await insert("tasks", {
    ...owner,
    name: "overview long-running verification",
    execution_context: "PRIVATE_SELF_USE",
    created_at: oldDate,
  });
  await insert("task_config_versions", {
    ...owner,
    task_id: task,
    version: 1,
    execution_context: "PRIVATE_SELF_USE",
    script_version_id: version,
    action: "process",
    input_payload_id: payload,
    input_digest: "verification",
    schema_digest: "verification",
    schedule: "{}",
    execution: "{}",
    authorization_id: authorization,
    config_digest: "verification",
  });
  await connection.query(
    "UPDATE travel.tasks SET current_config_version=1,status='ACTIVE' WHERE id=$1",
    [task],
  );
  const run = await insert("runs", {
    ...owner,
    task_id: task,
    config_version: 1,
    script_version_id: version,
    action: "process",
    original_input_ref: payload,
    schema_digest: "verification",
    trigger_kind: "manual",
    trigger_key: randomUUID(),
    run_mode: "continuous",
    status: "RUNNING",
    created_at: oldDate,
  });
  await insert("tasks", {
    owner_user_id: consumer,
    name: "another owner's draft",
    execution_context: "PRIVATE_SELF_USE",
  });
  let overview = await monitoring.overview(publisher);
  assert.equal(
    BigInt(overview.counts.in_progress),
    BigInt(baseline.counts.in_progress) + 1n,
  );
  assert.equal(overview.counts.tasks, baseline.counts.tasks);
  assert.equal(overview.counts.runs, baseline.counts.runs);
  assert.ok(overview.activity.some((item) => item.id === run));
  report.checks.push(
    "current running counters retain a continuous run created before the history window, while history totals respect the window and another owner's task stays excluded",
  );

  await insert("continuations", {
    ...owner,
    run_id: run,
    number: 0,
    script_version_id: version,
    action: "process",
    input_ref: payload,
    schema_digest: "verification",
    authorization_id: authorization,
    credential_snapshot: "{}",
  });
  const node = await insert("nodes", {
    name: "overview verification",
    certificate_fingerprint: randomUUID(),
  });
  const policyVersion = (
    await connection.query(
      "SELECT COALESCE(max(version),0)+1 AS next FROM travel.runtime_policies",
    )
  ).rows[0].next;
  const policy = await insert("runtime_policies", {
    version: policyVersion,
    policy: "{}",
    effective_at: new Date(),
    created_by: publisher,
  });
  const attempt = await insert("attempts", {
    ...owner,
    run_id: run,
    attempt_no: 1,
    continuation_number: 0,
    node_id: node,
    lease_generation: 1,
    requested_execution_mode: "docker",
    runtime_policy_id: policy,
  });
  const invocation = await insert("hook_invocations", {
    ...owner,
    attempt_id: attempt,
    script_version_id: version,
    action: "process",
    purpose: "BUSINESS",
    input_ref: payload,
    schema_digest: "verification",
  });
  const series = await insert("output_series", {
    ...owner,
    run_id: run,
    task_id: task,
    config_version: 1,
    scope: "RUN",
    dedup_expires_at: new Date(Date.now() + 86_400_000),
  });
  const generation = await insert("output_generations", {
    ...owner,
    invocation_id: invocation,
    output_series_id: series,
    sequence: 0,
    producer_kind: "ACTION",
    reason: "explicit",
    deadline: new Date(Date.now() + 86_400_000),
  });
  const batch = await insert("output_batches", {
    ...owner,
    output_series_id: series,
    batch_key: "committed",
    invocation_id: invocation,
    emission_id: generation,
    phase: "ACTION",
  });
  const outputValues = {
    ...owner,
    batch_id: batch,
    kind: "text",
    payload_id: payload,
    content_digest: "verification",
    media_type: "text/plain",
    size_bytes: 23,
    expires_at: new Date(Date.now() + 86_400_000),
    status: "READY",
  };
  const ready = await insert("script_outputs", {
    ...outputValues,
    output_key: "ready",
    title: "ready output",
  });
  await insert("script_outputs", {
    ...outputValues,
    output_key: "expired",
    expires_at: new Date(Date.now() - 86_400_000),
  });
  await insert("script_outputs", {
    ...outputValues,
    output_key: "staged",
    status: "STAGED",
  });
  await insert("script_outputs", {
    ...outputValues,
    output_key: "deleted",
    status: "DELETED",
    deleted_at: new Date(),
  });
  const storage = await insert("storage_objects", {
    ...owner,
    purpose: "output",
    bucket_alias: "private",
    object_key: randomUUID(),
    sha256: "verification",
    size_bytes: 1,
    key_version: "verification",
    status: "QUARANTINED",
  });
  const upload = await insert("output_uploads", {
    ...owner,
    output_series_id: series,
    batch_id: batch,
    invocation_id: invocation,
    phase: "ACTION",
    upload_key: "quarantined",
    expected_size: 1,
    expected_sha256: "verification",
    object_id: storage,
    expires_at: new Date(Date.now() + 86_400_000),
    status: "UPLOADED",
  });
  await insert("script_outputs", {
    ...owner,
    batch_id: batch,
    output_key: "quarantined",
    kind: "file",
    upload_id: upload,
    object_id: storage,
    content_digest: "verification",
    file_name: "quarantined.txt",
    media_type: "text/plain",
    size_bytes: 1,
    expires_at: new Date(Date.now() + 86_400_000),
    status: "READY",
  });
  await connection.query(
    "UPDATE travel.output_batches SET commit_status='COMMITTED',payload_digest='verification',producer_outcome='COMPLETED',committed_at=now(),aggregate_status='PARTIAL' WHERE id=$1",
    [batch],
  );
  const openGeneration = await insert("output_generations", {
    ...owner,
    invocation_id: invocation,
    output_series_id: series,
    sequence: 1,
    producer_kind: "HOOK",
    reason: "interval",
    deadline: new Date(Date.now() + 86_400_000),
  });
  const openBatch = await insert("output_batches", {
    ...owner,
    output_series_id: series,
    batch_key: "open",
    invocation_id: invocation,
    emission_id: openGeneration,
    phase: "OUTPUT_HOOK",
  });
  const secondOutput = await insert("script_outputs", {
    ...outputValues,
    batch_id: openBatch,
    output_key: "uncommitted",
  });
  overview = await monitoring.overview(publisher);
  assert.equal(
    BigInt(overview.counts.ready_outputs),
    BigInt(baseline.counts.ready_outputs) + 1n,
  );
  assert.ok(overview.results.some((item) => item.id === ready));
  assert.equal(
    overview.results.some((item) => item.file_name === "quarantined.txt"),
    false,
  );
  const metadata = JSON.stringify(overview);
  for (const secret of [
    "owner_user_id",
    "payload_id",
    "input_ref",
    "object_key",
    "bucket_alias",
    "ciphertext",
    "schema_digest",
  ])
    assert.equal(metadata.includes(secret), false);
  const queryDatabase = {
    root: process.cwd(),
    query: (...args) => connection.query(...args),
  };
  const outputs = new OutputQueryService(
    queryDatabase,
    new PaginationService(queryDatabase),
  );
  const outputPage = await outputs.list(publisher, { limit: "2" });
  assert.equal(outputPage.items.length, 2);
  assert.equal(typeof outputPage.nextCursor, "string");
  const nextPage = await outputs.list(publisher, {
    limit: "2",
    cursor: outputPage.nextCursor,
  });
  assert.equal(nextPage.items.length, 2);
  assert.equal(
    new Set([...outputPage.items, ...nextPage.items].map((item) => item.id))
      .size,
    4,
  );
  const actualOutput = await outputs.get(publisher, ready);
  assert.equal(actualOutput.availability, "READY");
  assert.equal(actualOutput.run_status, "RUNNING");
  assert.equal(actualOutput.content_access_configured, false);
  assert.deepEqual(actualOutput.deliveries, []);
  const quarantined = [...outputPage.items, ...nextPage.items].find(
    (item) => item.file_name === "quarantined.txt",
  );
  assert.equal(quarantined.availability, "QUARANTINED");
  assert.ok(
    [...outputPage.items, ...nextPage.items].some(
      (item) => item.availability === "EXPIRED",
    ),
  );
  for (const secret of [
    "owner_user_id",
    "payload_id",
    "object_id",
    "object_key",
    "bucket_alias",
    "ciphertext",
    "cursor_created_at",
  ])
    assert.equal(JSON.stringify(outputPage.items).includes(secret), false);
  await assert.rejects(
    outputs.get(consumer, ready),
    (error) => error.getStatus() === 404,
  );
  await assert.rejects(
    outputs.get(publisher, secondOutput),
    (error) => error.getStatus() === 404,
  );
  await assert.rejects(
    outputs.list(consumer, {}, run),
    (error) => error.getStatus() === 404,
  );
  report.checks.push(
    "output metadata queries expose only the current owner's committed batches while the process runs, retain independent availability and delivery facts and hide storage references and uncommitted or deleted records",
  );
  for (const [actor, query] of [
    [consumer, { limit: "2", cursor: outputPage.nextCursor }],
    [publisher, { limit: "2", kind: "file", cursor: outputPage.nextCursor }],
    [
      publisher,
      { limit: "2", cursor: outputPage.nextCursor.slice(0, -2) + "AA" },
    ],
    [publisher, { owner: consumer }],
    [publisher, { limit: "101" }],
    [publisher, { kind: ["file"] }],
    [publisher, { from: "2026-02-30T00:00:00Z" }],
  ])
    await assert.rejects(
      outputs.list(actor, query),
      (error) => error.getStatus() === 422,
    );
  const ranged = await outputs.list(
    publisher,
    {
      kind: "text",
      from: "2020-01-01T00:00:00+23:00",
      to: "2090-01-01T00:00:00Z",
    },
    run,
  );
  assert.ok(ranged.items.some((item) => item.id === ready));
  report.checks.push(
    "signed output cursors bind the owner and normalized filters, retain deterministic timestamp and UUID pagination, and reject malformed filters, dates and tampering",
  );
  await connection.query(
    "UPDATE travel.output_batches SET commit_status='COMMITTED',payload_digest='verification-hook',producer_outcome='COMPLETED',committed_at=now(),aggregate_status='READY' WHERE id=$1",
    [openBatch],
  );
  const repeated = await monitoring.overview(publisher);
  assert.equal(
    BigInt(repeated.counts.ready_outputs),
    BigInt(baseline.counts.ready_outputs) + 2n,
  );
  assert.ok(repeated.results.some((item) => item.id === ready));
  assert.ok(repeated.results.some((item) => item.id === secondOutput));
  assert.equal(repeated.counts.in_progress, overview.counts.in_progress);
  report.checks.push(
    "a running continuous process exposes successive action and output-hook batches as they commit, while open batches, expired or deleted outputs and quarantined files stay excluded and private storage references stay absent",
  );
  const pendingId = await insert("pending_actions", {
    ...owner,
    run_id: run,
    invocation_id: invocation,
    reason: "verification-open",
    instructions_ref: payload,
    expires_at: new Date(Date.now() + 86_400_000),
  });
  await insert("pending_actions", {
    ...owner,
    run_id: run,
    invocation_id: invocation,
    reason: "verification-expired",
    status: "EXPIRED",
    instructions_ref: payload,
    expires_at: new Date(Date.now() - 86_400_000),
  });
  overview = await monitoring.overview(publisher);
  assert.equal(
    BigInt(overview.counts.pending_actions),
    BigInt(baseline.counts.pending_actions) + 1n,
  );
  assert.equal(overview.pending.length, 1);
  await connection.query("SAVEPOINT pending_expiry");
  await connection.query(
    "UPDATE travel.pending_actions SET expires_at=now()-interval '1 day' WHERE id=$1",
    [pendingId],
  );
  assert.equal(
    (await monitoring.overview(publisher)).counts.pending_actions,
    baseline.counts.pending_actions,
  );
  await connection.query("ROLLBACK TO SAVEPOINT pending_expiry");
  const historical = await monitoring.overview(publisher, {
    from: "2000-01-01T00:00:00Z",
    to: "2000-02-01T00:00:00Z",
  });
  assert.deepEqual(historical.results, []);
  assert.equal(historical.counts.in_progress, overview.counts.in_progress);
  const sourcePlan = (
    await connection.query(
      "SELECT p.*,r.id AS release_id FROM travel.price_plans p JOIN travel.service_releases r ON r.id=p.service_release_id WHERE r.script_version_id=$1 ORDER BY p.version DESC LIMIT 1",
      [version],
    )
  ).rows[0];
  const nextPriceVersion = (
    await connection.query(
      "SELECT max(version)+1 AS next FROM travel.price_plans WHERE service_release_id=$1",
      [sourcePlan.release_id],
    )
  ).rows[0].next;
  const hugeAmount = "9223372036854775807";
  const pricePlan = await insert("price_plans", {
    ...owner,
    service_release_id: sourcePlan.release_id,
    version: nextPriceVersion,
    commerce_policy_id: sourcePlan.commerce_policy_id,
    unit_amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    validity_seconds: sourcePlan.validity_seconds,
  });
  const quote = await insert("quotes", {
    ...owner,
    publisher_id: publisher,
    service_release_id: sourcePlan.release_id,
    price_plan_id: pricePlan,
    authorization_id: authorization,
    input_payload_id: payload,
    input_digest: "verification",
    amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    terms_snapshot: "{}",
    snapshot_digest: "verification",
    expires_at: new Date(Date.now() + 86_400_000),
  });
  const order = await insert("service_orders", {
    ...owner,
    publisher_id: publisher,
    quote_id: quote,
    service_release_id: sourcePlan.release_id,
    price_plan_id: pricePlan,
    amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    terms_snapshot: "{}",
    terms_digest: "verification",
    payment_deadline: new Date(Date.now() + 86_400_000),
  });
  const payment = await insert("payments", {
    ...owner,
    order_id: order,
    attempt_no: 1,
    provider: "verification",
    merchant_account: "isolated-fixture",
    provider_request_id: randomUUID(),
    amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    status: "PAID",
  });
  const receipt = await insert("provider_receipts", {
    provider: "verification",
    merchant_account: "isolated-fixture",
    event_kind: "PAYMENT",
    provider_event_id: randomUUID(),
    payload_digest: "verification",
    key_version: "verification",
    signature_valid: true,
    expires_at: new Date(Date.now() + 86_400_000),
  });
  const paymentTransaction = await insert("payment_transactions", {
    ...owner,
    payment_id: payment,
    order_id: order,
    receipt_id: receipt,
    provider: "verification",
    merchant_account: "isolated-fixture",
    provider_transaction_id: randomUUID(),
    amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    received_at: new Date(),
    allocation: "FUNDING",
  });
  await connection.query(
    "UPDATE travel.service_orders SET funding_payment_id=$1,funding_transaction_id=$2,paid_at=now(),status='ACTIVE' WHERE id=$3",
    [payment, paymentTransaction, order],
  );
  const entitlement = randomUUID();
  const entitlementValues = {
    ...owner,
    id: entitlement,
    order_id: order,
    service_release_id: sourcePlan.release_id,
    valid_until: new Date(Date.now() + 86_400_000),
    status: "ACTIVE",
  };
  await connection.query("SAVEPOINT entitlement_expiry");
  await insert("entitlements", entitlementValues);
  let funded = await monitoring.overview(publisher);
  assert.equal(
    BigInt(funded.counts.unused_entitlements),
    BigInt(baseline.counts.unused_entitlements) + 1n,
  );
  await connection.query("ROLLBACK TO SAVEPOINT entitlement_expiry");
  await insert("entitlements", {
    ...entitlementValues,
    valid_until: new Date(Date.now() - 86_400_000),
  });
  assert.equal(
    (await monitoring.overview(publisher)).counts.unused_entitlements,
    baseline.counts.unused_entitlements,
  );
  await connection.query("ROLLBACK TO SAVEPOINT entitlement_expiry");
  await insert("entitlements", entitlementValues);
  await insert("refunds", {
    ...owner,
    order_id: order,
    payment_id: payment,
    payment_transaction_id: paymentTransaction,
    request_key: randomUUID(),
    reason: "isolated overview verification",
    amount_minor: hugeAmount,
    currency: sourcePlan.currency,
    reserved_at: new Date(),
    succeeded_at: new Date(),
    status: "SUCCEEDED",
  });
  await connection.query(
    "UPDATE travel.payment_transactions SET refunded_amount_minor=$1 WHERE id=$2",
    [hugeAmount, paymentTransaction],
  );
  await connection.query(
    "UPDATE travel.entitlements SET status='REVOKED',revoked_at=now() WHERE id=$1",
    [entitlement],
  );
  funded = await monitoring.overview(publisher);
  const fee = funded.fees.find((item) => item.currency === sourcePlan.currency);
  const originalFee = baseline.fees.find(
    (item) => item.currency === sourcePlan.currency,
  );
  assert.equal(
    BigInt(fee.funded_service_fee_minor),
    BigInt(originalFee?.funded_service_fee_minor || "0") + BigInt(hugeAmount),
  );
  assert.equal(
    BigInt(fee.refunded_service_fee_minor),
    BigInt(originalFee?.refunded_service_fee_minor || "0") + BigInt(hugeAmount),
  );
  assert.equal(
    funded.counts.unused_entitlements,
    baseline.counts.unused_entitlements,
  );
  report.checks.push(
    "owned funded entitlements respect expiry and revocation, and per-currency service fee and confirmed-refund aggregates preserve signed 64-bit minor-unit precision using rolled-back financial fixtures",
  );
  const messageGeneration = await insert("output_generations", {
    ...owner,
    invocation_id: invocation,
    output_series_id: series,
    sequence: 2,
    producer_kind: "HOOK",
    reason: "interval",
    deadline: new Date(Date.now() + 86_400_000),
  });
  const messageBatch = await insert("output_batches", {
    ...owner,
    output_series_id: series,
    batch_key: "message-group",
    invocation_id: invocation,
    emission_id: messageGeneration,
    phase: "OUTPUT_HOOK",
  });
  const messageOutput = await insert("script_outputs", {
    ...outputValues,
    batch_id: messageBatch,
    output_key: "message-group",
    kind: "message",
    title: "grouped message",
    media_type: "application/json",
  });
  await connection.query(
    "UPDATE travel.output_batches SET commit_status='COMMITTED',payload_digest='verification-message',producer_outcome='COMPLETED',committed_at=now(),aggregate_status='READY' WHERE id=$1",
    [messageBatch],
  );
  const grouped = [];
  let groupedCursor;
  do {
    const page = await outputs.list(publisher, {
      run_id: run,
      kinds: groupedCursor ? "text,message" : "message,text,text",
      limit: "1",
      ...(groupedCursor ? { cursor: groupedCursor } : {}),
    });
    grouped.push(...page.items);
    groupedCursor = page.nextCursor;
  } while (groupedCursor);
  assert(grouped.some((item) => item.id === messageOutput));
  assert(grouped.some((item) => item.id === ready));
  assert(grouped.every((item) => ["text", "message"].includes(item.kind)));
  assert.equal(new Set(grouped.map((item) => item.id)).size, grouped.length);
  const groupPage = await outputs.list(publisher, {
    kinds: "text,message",
    limit: "1",
  });
  for (const query of [
    { kinds: "text," },
    { kinds: ["text"] },
    { kinds: "unknown" },
    { kinds: "text,message", kind: "file" },
    { kinds: "text,json", limit: "1", cursor: groupPage.nextCursor },
  ])
    await assert.rejects(
      outputs.list(publisher, query),
      (error) => error.getStatus() === 422,
    );
  await assert.rejects(
    outputs.list(consumer, {
      kinds: "text,message",
      limit: "1",
      cursor: groupPage.nextCursor,
    }),
    (error) => error.getStatus() === 422,
  );
  report.checks.push(
    "text and message output queries paginate as one normalized kind set and reject invalid groups, changed filters and cross-owner cursor replay in a rolled-back PostgreSQL transaction",
  );
  await connection.query("ROLLBACK");
  connection.release();
  connection = undefined;
  report.checks.push(
    "pending totals exclude expired requests, bounded lists remain deterministic, and historical filters retain current-state counters with all synthetic database changes rolled back",
  );

  const prototype = await contextFor();
  await prototype.page.goto(base + "/me/home");
  await expect(prototype.page.locator(".recommend-item")).toHaveCount(3);
  await capture(prototype.page, "USER-C01", ".consumer-home");
  await expect(prototype.page.locator(".home-stat").nth(2)).toContainText("2");
  await expect(
    prototype.page.locator(".consumer-sidebar-footer"),
  ).toBeVisible();
  const orderLinks = await prototype.page
    .locator(".recent-order")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(orderLinks).toEqual([
    "/me/orders/OD202611130001",
    "/me/orders/OD202611130002",
    "/me/orders/OD202611130003",
  ]);
  const downloadPromise = prototype.page.waitForEvent("download");
  await prototype.page
    .locator(".home-results-panel")
    .getByRole("button", { name: "下载", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cleaned.csv");
  assert.ok(
    (await readFile(await download.path(), "utf8")).includes("name,email"),
  );
  await prototype.page.locator(".home-stat").first().click();
  await expect(prototype.page.locator(".purchased-card")).toHaveCount(2);
  report.checks.push(
    "consumer home restores the reference regions within 1814 by 868, derives preview counts, links each order to its own detail, downloads the selected existing file and opens the corresponding entitlement filter",
  );
  await prototype.page.goto(base + "/checkout");
  await expect(prototype.page.locator(".checkout-input-summary")).toBeVisible();
  await capture(prototype.page, "USER-C02", ".checkout-page");
  await prototype.page
    .getByRole("button", { name: "提交订单", exact: true })
    .click();
  await expect(
    prototype.page.getByRole("heading", { name: "收银台", exact: true }),
  ).toBeVisible();
  const previewId = new URL(prototype.page.url()).pathname.split("/")[2];
  await prototype.page
    .getByRole("button", { name: "取消订单", exact: true })
    .click();
  await prototype.page
    .getByRole("button", { name: "确认取消", exact: true })
    .click();
  await prototype.page
    .locator(".sidebar")
    .getByRole("link", { name: "我的首页", exact: true })
    .click();
  await expect(prototype.page.locator(".recent-order").first()).toHaveAttribute(
    "href",
    `/me/orders/${previewId}`,
  );
  await expect(prototype.page.locator(".recent-order").first()).toContainText(
    "已关闭",
  );
  report.checks.push(
    "checkout keeps the reference viewport and a newly cancelled preview order immediately updates the home summary without fabricating a payment confirmation",
  );
  await prototype.context.close();

  const live = await contextFor(true);
  await live.page.goto(base + "/me/home");
  await expect(
    live.page.locator(".consumer-home[data-mode=live]"),
  ).toBeVisible();
  await expect(live.page.locator(".recent-order")).toHaveCount(
    liveEnvelope.data.orders.length,
  );
  await expect(live.page.locator(".home-preview-label")).toHaveCount(0);
  await expect(live.page.locator(".home-stat").nth(2)).toContainText(
    liveEnvelope.data.counts.pending_actions,
  );
  await live.page.goto(base + "/checkout");
  await expect(live.page.locator("form.rjsf")).toBeVisible();
  await expect(live.page.getByRole("checkbox")).not.toBeChecked();
  report.checks.push(
    "live home reads the authenticated overview and shows actual empty records while checkout requires explicit terms consent and renders the publisher form",
  );
  await live.context.close();

  const recovery = await contextFor(true);
  let failOverview = true;
  await recovery.page.route("**/api/v1/monitoring/overview", (route) =>
    failOverview
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: "UNAVAILABLE", message: "verification outage" },
          },
        })
      : route.fulfill({
          json: {
            ...liveEnvelope,
            data: {
              ...liveEnvelope.data,
              counts: {
                ...liveEnvelope.data.counts,
                in_progress: "9007199254740993",
              },
            },
          },
        }),
  );
  await recovery.page.goto(base + "/me/home");
  await expect(
    recovery.page.getByText("个人概况暂时无法加载", { exact: true }),
  ).toBeVisible();
  failOverview = false;
  await recovery.page
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(recovery.page.locator(".home-stat").nth(1)).toContainText(
    "9007199254740993",
  );
  report.checks.push(
    "overview errors expose a working retry, and counters above Number.MAX_SAFE_INTEGER retain their exact text",
  );
  await recovery.context.close();

  const changed = await contextFor();
  const catalogEnvelope = await (
    await changed.context.request.get(base + "/api/v1/services")
  ).json();
  const service = catalogEnvelope.data.find(
    (item) => item.input_schema_digest === "schema-table",
  );
  const changedService = structuredClone(service);
  changedService.input_schema.properties.output_format.enum = ["JSON"];
  changedService.input_ui_schema = {};
  await changed.page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...catalogEnvelope, data: [changedService] } }),
  );
  await changed.page.goto(base + `/checkout?service=${service.id}`);
  await expect(changed.page.locator(".checkout-schema-change")).toBeVisible();
  await expect(changed.page.locator(".checkout-input-summary")).toHaveCount(0);
  await changed.page
    .getByRole("button", { name: "提交订单", exact: true })
    .click();
  await expect(
    changed.page.locator(".ant-form-item-explain-error").first(),
  ).toBeVisible();
  await changed.page.getByLabel("上传文件", { exact: true }).fill("manual.csv");
  await changed.page.getByLabel("去重字段", { exact: true }).click();
  await changed.page.getByText("邮箱", { exact: true }).last().click();
  await changed.page.getByLabel("输出格式", { exact: true }).click();
  await changed.page.getByText("JSON", { exact: true }).last().click();
  await changed.page
    .getByRole("button", { name: "提交订单", exact: true })
    .click();
  await expect(
    changed.page.getByRole("heading", { name: "收银台", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "a changed publisher schema invalidates the old example, opens an editable form, blocks missing required fields and accepts corrected parameters through the normal purchase entry",
  );
  await changed.context.close();
  expect(report.errors).toEqual([]);
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  if (connection) {
    await connection.query("ROLLBACK");
    connection.release();
  }
  await pool.end();
  await browser.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
