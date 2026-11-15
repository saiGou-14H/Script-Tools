import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";

loadEnvFile(path.resolve(process.argv[2] || ".env"));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const require = createRequire(import.meta.url);
const {
  PublisherOverviewService,
} = require("../apps/control-api/dist/publisher/publisher-overview.service.js");
const output = path.resolve("output/verification/publisher-overview");
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    "production-built S01, isolated HTTP seed API, rolled-back PostgreSQL 18 financial fixtures and controlled live responses",
  visual_acceptance: "pending",
};
let application, server, browser, connection, page, releaseOverview;
async function insert(table, fields) {
  const record = { id: randomUUID(), ...fields };
  const columns = Object.keys(record);
  await connection.query(
    `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    Object.values(record),
  );
  return record.id;
}
async function rejected(work, status) {
  await assert.rejects(work, (error) => error.getStatus() === status);
}
try {
  application = await startVerificationApp("publisher-overview");
  const root = path.resolve("apps/web");
  server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      proxy: { "/api": { target: application.url } },
    },
  });
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  const endpoint = base + "/api/v1/publisher/overview";
  assert.equal((await context.request.get(endpoint)).status(), 401);
  for (const name of ["consumer", "admin"]) {
    const other = await browser.newContext();
    assert.equal(
      (
        await other.request.post(base + "/api/v1/auth/login", {
          data: {
            email: `${name}@example.invalid`,
            password: "TravelTools2026!",
          },
        })
      ).status(),
      200,
    );
    assert.equal((await other.request.get(endpoint)).status(), 403);
    await other.close();
  }
  assert.equal(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          email: "publisher@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
    200,
  );
  const response = await context.request.get(endpoint);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["cache-control"], "no-store");
  const envelope = await response.json();
  const seed = envelope.data;
  assert.ok(envelope.request_id);
  assert.equal(seed.counts.services, "4");
  assert.equal(seed.counts.ready_deployments, "4");
  assert.equal(seed.deployment_basis, "registered_status");
  assert.equal(seed.balance_scope, "publisher_current");
  assert.equal(seed.window.timezone, "UTC");
  assert.equal(seed.finances[0].pending_minor, "0");
  assert.equal(seed.services.length, 4);
  for (const value of Object.values(seed.counts)) assert.match(value, /^\d+$/);
  report.checks.push(
    "HTTP authentication, enabled publisher ownership, no-store envelope, explicit UTC window and registered deployment basis pass on isolated PGlite data",
  );

  for (const query of [
    "owner=other",
    "from=2026-02-30T00:00:00Z",
    "to=invalid",
    "to=0001-01-01T00:00:00Z",
    "from=2026-11-16",
    "from=2026-11-16T00:00:00Z&to=2026-11-15T00:00:00Z",
    "version=0",
    "version=1.2",
    "version=2147483648",
    "version=1&version=2",
    "service_id=wrong",
    "q=" + "x".repeat(201),
    "status=READY",
    "status=ACTIVE&status=DRAFT",
  ]) {
    assert.equal(
      (await context.request.get(endpoint + "?" + query)).status(),
      422,
      query,
    );
  }
  assert.equal(
    (
      await context.request.get(endpoint + "?service_id=" + randomUUID())
    ).status(),
    404,
  );
  const escaped = (
    await (await context.request.get(endpoint + "?q=%25")).json()
  ).data;
  assert.equal(escaped.counts.matching_services, "0");
  assert.equal(escaped.counts.services, "4");
  report.checks.push(
    "unknown, repeated and malformed parameters, invalid calendar dates and service identifiers are rejected, while literal wildcard searches affect only matching service rows",
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
    (item) => item.email_normalized === "publisher@example.invalid",
  ).id;
  const buyer = accounts.find(
    (item) => item.email_normalized === "consumer@example.invalid",
  ).id;
  const service = new PublisherOverviewService(connection);
  const source = (
    await connection.query(
      "SELECT r.*,p.id AS plan_id,p.commerce_policy_id,p.validity_seconds,p.currency,p.version AS plan_version FROM travel.service_releases r JOIN travel.price_plans p ON p.service_release_id=r.id WHERE r.owner_user_id=$1 ORDER BY r.id,p.version DESC LIMIT 1",
      [publisher],
    )
  ).rows[0];
  const owner = { owner_user_id: publisher };
  const baseline = await service.get(publisher);
  await insert("publisher_profiles", {
    owner_user_id: buyer,
    public_name: "overview-private-foreign",
    terms_version: "test",
  });
  const isolated = await service.get(buyer);
  assert.equal(isolated.counts.services, "0");
  assert.deepEqual(isolated.finances, []);
  assert.deepEqual(isolated.refunds, []);
  await rejected(
    () => service.get(buyer, { service_id: source.service_id }),
    404,
  );
  await connection.query("SAVEPOINT disabled_profile");
  await connection.query(
    "UPDATE travel.publisher_profiles SET enabled=false WHERE owner_user_id=$1",
    [publisher],
  );
  await rejected(() => service.get(publisher), 403);
  await connection.query("ROLLBACK TO SAVEPOINT disabled_profile");
  report.checks.push(
    "PostgreSQL owner isolation and disabled publisher checks prevent foreign service discovery, refunds and balances",
  );

  const category = (
    await connection.query(
      "SELECT category_id FROM travel.services WHERE id=$1",
      [source.service_id],
    )
  ).rows[0].category_id;
  for (let index = 0; index < 9; index++)
    await insert("services", {
      ...owner,
      title: `overview-bounded-${index}`,
      description: "test",
      category_id: category,
    });
  const bounded = await service.get(publisher, {
    q: "overview-bounded-",
    status: "DRAFT",
  });
  assert.equal(bounded.counts.matching_services, "9");
  assert.equal(bounded.services.length, 6);
  const again = await service.get(publisher, {
    q: "overview-bounded-",
    status: "DRAFT",
  });
  assert.deepEqual(
    bounded.services.map((item) => item.id),
    again.services.map((item) => item.id),
  );
  assert.ok(
    bounded.services.every(
      (item) => item.script_name === null && item.amount_minor === null,
    ),
  );
  assert.equal(
    (await service.get(publisher, { q: "overview-bounded-", status: "ACTIVE" }))
      .counts.matching_services,
    "0",
  );
  report.checks.push(
    "six-row summaries expose exact matching counts, stable tie-break ordering, server-side search and sale-state filtering, including unreleased drafts",
  );

  const {
    id: sourceId,
    created_at,
    updated_at,
    revision,
    plan_id,
    commerce_policy_id,
    validity_seconds,
    currency,
    plan_version,
    ...releaseFields
  } = source;
  const releaseVersion = (
    await connection.query(
      "SELECT max(version)+1 AS next FROM travel.service_releases WHERE service_id=$1",
      [source.service_id],
    )
  ).rows[0].next;
  const release = await insert("service_releases", {
    ...releaseFields,
    version: releaseVersion,
  });
  const filtered = await service.get(publisher, {
    service_id: source.service_id,
    version: String(releaseVersion),
  });
  assert.equal(filtered.services.length, 1);
  assert.equal(filtered.services[0].release_id, release);
  assert.equal(filtered.services[0].release_version, releaseVersion);
  assert.equal(filtered.counts.deployments, "1");
  assert.equal(
    (await service.get(publisher, { version: "2147483647" })).counts.services,
    "0",
  );
  const onlyService = await service.get(publisher, {
    service_id: source.service_id,
  });
  assert.equal(onlyService.counts.deployments, "1");
  await connection.query(
    "UPDATE travel.deployments SET status='DEGRADED' WHERE id=$1",
    [source.deployment_id],
  );
  const abnormal = await service.get(publisher, {
    service_id: source.service_id,
  });
  assert.equal(abnormal.counts.abnormal_deployments, "1");
  assert.equal(abnormal.alerts[0].id, source.deployment_id);
  assert.equal(abnormal.services[0].deployment_status, "DEGRADED");
  report.checks.push(
    "service release version filters include historical releases and deduplicate shared deployments, with persisted degraded status kept separate from health evidence",
  );

  const privatePayload = await insert("private_payloads", {
    owner_user_id: buyer,
    purpose: "overview-test",
    key_version: "test",
    ciphertext: Buffer.from("private-buyer-body"),
    content_hmac: randomUUID(),
    size_bytes: 18,
  });
  const authorization = await insert("execution_authorizations", {
    owner_user_id: buyer,
    script_version_id: source.script_version_id,
    action: source.action,
    grants: "{}",
    expires_at: new Date(Date.now() + 86_400_000),
  });
  const huge = "9223372036854775807";
  const now = (await connection.query("SELECT now() AS value")).rows[0].value;
  const plan = await insert("price_plans", {
    ...owner,
    service_release_id: release,
    version: 1,
    commerce_policy_id,
    unit_amount_minor: huge,
    currency,
    validity_seconds,
  });
  async function fundedOrder(amount, funded = true) {
    const quote = await insert("quotes", {
      owner_user_id: buyer,
      publisher_id: publisher,
      service_release_id: release,
      price_plan_id: plan,
      authorization_id: authorization,
      input_payload_id: privatePayload,
      input_digest: "private-input-digest",
      amount_minor: amount,
      currency,
      terms_snapshot: JSON.stringify({ private: "buyer-private-terms" }),
      snapshot_digest: "test",
      expires_at: new Date(Date.now() + 86_400_000),
    });
    const order = await insert("service_orders", {
      owner_user_id: buyer,
      publisher_id: publisher,
      quote_id: quote,
      service_release_id: release,
      price_plan_id: plan,
      amount_minor: amount,
      currency,
      terms_snapshot: JSON.stringify({ private: "buyer-private-terms" }),
      terms_digest: "test",
      payment_deadline: new Date(Date.now() + 86_400_000),
    });
    if (!funded) return { order };
    const payment = await insert("payments", {
      owner_user_id: buyer,
      order_id: order,
      attempt_no: 1,
      provider: "test",
      merchant_account: "test",
      provider_request_id: randomUUID(),
      amount_minor: amount,
      currency,
      status: "PAID",
    });
    const receipt = await insert("provider_receipts", {
      provider: "test",
      merchant_account: "test",
      event_kind: "PAYMENT",
      provider_event_id: randomUUID(),
      payload_digest: "test",
      key_version: "test",
      signature_valid: true,
      expires_at: new Date(Date.now() + 86_400_000),
    });
    const transaction = await insert("payment_transactions", {
      owner_user_id: buyer,
      payment_id: payment,
      order_id: order,
      receipt_id: receipt,
      provider: "test",
      merchant_account: "test",
      provider_transaction_id: randomUUID(),
      amount_minor: amount,
      currency,
      received_at: now,
      allocation: "FUNDING",
    });
    await connection.query(
      "UPDATE travel.service_orders SET funding_payment_id=$1,funding_transaction_id=$2,paid_at=$3,status='ACTIVE' WHERE id=$4",
      [payment, transaction, now, order],
    );
    return { order, payment, transaction };
  }
  const first = await fundedOrder(huge);
  await fundedOrder(huge);
  await fundedOrder(huge, false);
  const query = {
    service_id: source.service_id,
    version: String(releaseVersion),
    from: new Date(now.getTime() - 1000).toISOString(),
    to: new Date(now.getTime() + 1000).toISOString(),
  };
  let financial = await service.get(publisher, query);
  assert.equal(financial.counts.window_sales, "2");
  assert.equal(financial.services[0].sold_count, "2");
  assert.equal(
    financial.finances.find((item) => item.currency === currency).funded_minor,
    (BigInt(huge) * 2n).toString(),
  );
  const exclusive = await service.get(publisher, {
    ...query,
    to: now.toISOString(),
  });
  assert.equal(exclusive.counts.window_sales, "0");
  report.checks.push(
    "funded sales use publisher ownership across a different buyer, exclude unpaid orders and preserve sums above signed 64-bit and JavaScript safe integer limits",
  );

  for (const state of ["PROCESSING", "FAILED", "SUCCEEDED"])
    await insert("refunds", {
      owner_user_id: buyer,
      order_id: first.order,
      payment_id: first.payment,
      payment_transaction_id: first.transaction,
      request_key: randomUUID(),
      reason: "buyer-private-refund-reason",
      amount_minor: state === "SUCCEEDED" ? huge : "1",
      currency,
      reserved_at: now,
      succeeded_at: state === "SUCCEEDED" ? now : null,
      status: state,
    });
  financial = await service.get(publisher, query);
  assert.equal(financial.counts.processing_refunds, "1");
  assert.equal(financial.refunds.length, 2);
  assert.equal(
    financial.finances.find((item) => item.currency === currency)
      .refunded_minor,
    huge,
  );
  assert.equal((await service.get(buyer)).refunds.length, 0);
  const historical = await service.get(publisher, {
    ...query,
    from: "2000-01-01T00:00:00Z",
    to: "2000-02-01T00:00:00Z",
  });
  assert.equal(historical.counts.window_sales, "0");
  assert.equal(historical.counts.processing_refunds, "1");
  assert.deepEqual(historical.refunds, []);
  report.checks.push(
    "refund amounts require confirmed success timestamps, processing counts remain current, and historical windows preserve current deployment and refund-state counts",
  );

  async function ledgerAccount(code, codeCurrency, party = publisher) {
    return insert("ledger_accounts", {
      party_key: randomUUID(),
      party_user_id: party,
      code,
      currency: codeCurrency,
    });
  }
  const pending = await ledgerAccount("PUBLISHER_PENDING", currency);
  const clearing = await ledgerAccount("BUYER_LIABILITY", currency, buyer);
  async function ledger(
    kind,
    amount,
    credit,
    account = pending,
    debitAccount = clearing,
    codeCurrency = currency,
    posted = now,
    order = first.order,
  ) {
    const event = await insert("outbox_events", {
      owner_user_id: publisher,
      aggregate_type: "verification",
      aggregate_id: randomUUID(),
      aggregate_revision: 1,
      event_type: kind,
      payload: "{}",
      request_id: randomUUID(),
      occurred_at: posted,
    });
    const transaction = await insert("ledger_transactions", {
      source_event_id: event,
      currency: codeCurrency,
      kind,
      order_id: order,
      posted_at: posted,
    });
    await insert("ledger_entries", {
      transaction_id: transaction,
      line_no: 1,
      account_id: account,
      currency: codeCurrency,
      order_id: order,
      publisher_id: publisher,
      credit_minor: credit ? amount : "0",
      debit_minor: credit ? "0" : amount,
    });
    await insert("ledger_entries", {
      transaction_id: transaction,
      line_no: 2,
      account_id: debitAccount,
      currency: codeCurrency,
      order_id: order,
      publisher_id: publisher,
      debit_minor: credit ? amount : "0",
      credit_minor: credit ? "0" : amount,
    });
  }
  await ledger("ALLOCATION", huge, true);
  await ledger("ALLOCATION", huge, true);
  await ledger("MATURITY", "10", false);
  await ledger(
    "ALLOCATION",
    "999",
    true,
    pending,
    clearing,
    currency,
    new Date(now.getTime() + 86_400_000),
  );
  const foreignPending = await ledgerAccount(
    "PUBLISHER_PENDING",
    currency,
    buyer,
  );
  await ledger("ALLOCATION", "77", true, foreignPending);
  const usd = await ledgerAccount("PUBLISHER_PENDING", "USD");
  const usdClearing = await ledgerAccount("BUYER_LIABILITY", "USD", buyer);
  await ledger("ALLOCATION", "12345", true, usd, usdClearing, "USD", now, null);
  const settlement = {
    ...owner,
    currency,
    period_start: new Date(now.getTime() - 86_400_000),
    period_end: now,
    policy_snapshot: "{}",
    amount_minor: huge,
  };
  await insert("settlement_batches", {
    ...settlement,
    status: "SETTLED",
    settled_at: now,
  });
  await insert("settlement_batches", { ...settlement, status: "PROCESSING" });
  await insert("settlement_batches", {
    ...settlement,
    status: "SETTLED",
    settled_at: new Date(now.getTime() + 86_400_000),
  });
  financial = await service.get(publisher, query);
  const cny = financial.finances.find((item) => item.currency === currency);
  assert.equal(cny.pending_minor, (BigInt(huge) * 2n - 10n).toString());
  assert.equal(cny.allocated_minor, (BigInt(huge) * 2n).toString());
  assert.equal(cny.settled_minor, huge);
  const dollar = financial.finances.find((item) => item.currency === "USD");
  assert.equal(dollar.pending_minor, "12345");
  assert.equal(dollar.today_allocated_minor, "12345");
  assert.equal(dollar.allocated_minor, "0");
  const oldWindow = await service.get(publisher, {
    ...query,
    from: "2000-01-01T00:00:00Z",
    to: "2000-02-01T00:00:00Z",
  });
  assert.equal(
    oldWindow.finances.find((item) => item.currency === currency).pending_minor,
    cny.pending_minor,
  );
  assert.equal(
    oldWindow.finances.find((item) => item.currency === currency)
      .allocated_minor,
    "0",
  );
  report.checks.push(
    "posted ledger balances, allocation-only income, maturity debits and confirmed settlements preserve exact per-currency amounts, exclude future and foreign facts, and retain declared global balance scope under service and historical filters",
  );
  const publicBody = JSON.stringify(financial);
  for (const secret of [
    buyer,
    privatePayload,
    "buyer-private-terms",
    "buyer-private-refund-reason",
    "private-input-digest",
    "ciphertext",
    "runtime_snapshot",
    '"health_evidence":',
  ])
    assert.ok(!publicBody.includes(secret), secret);
  report.checks.push(
    "summary projection omits buyer identity, credentials, private payloads, input and terms digests, refund reasons and raw runtime or health evidence",
  );
  await connection.query("ROLLBACK");
  connection.release();
  connection = null;

  await context.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const gate = new Promise((resolve) => {
    releaseOverview = resolve;
  });
  await context.route("**/api/v1/publisher/overview?*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(base + "/publisher", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".publisher-dashboard .ant-skeleton")).toHaveCount(
    1,
  );
  await expect(page.locator(".publisher-stats strong")).toHaveText([
    "—",
    "—",
    "—",
    "—",
  ]);
  const loaded = page.waitForResponse((response) =>
    response.url().includes("/publisher/overview?"),
  );
  releaseOverview();
  await loaded;
  await context.unroute("**/api/v1/publisher/overview?*");
  report.checks.push(
    "pending LIVE requests display loading feedback and unavailable counters until the summary arrives",
  );
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    4,
  );
  await expect(page.locator(".publisher-stats strong")).toHaveText([
    "4",
    "0",
    "¥0.00",
    "0",
  ]);
  await expect(
    page.getByText("暂无登记异常部署", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("统计期内暂无退款记录", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("示例数据", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: path.join(output, "PUBLISHER-S01-live.png"),
    fullPage: true,
  });
  report.screenshots.push("PUBLISHER-S01-live");
  await page.getByRole("textbox", { name: "搜索工作台服务" }).fill("表格");
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    1,
  );
  await page.reload();
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    1,
  );
  await page.getByRole("textbox", { name: "搜索工作台服务" }).fill("no-match");
  await expect(
    page.getByText("暂无符合条件的服务", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "LIVE S01 reads its actual owner-scoped API, renders zero-valued financial facts and current states, and restores server-side service search after reload",
  );

  let fail = true;
  await context.route("**/api/v1/publisher/overview?*", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "TEMPORARY", message: "controlled-overview-failure" },
        },
      });
    else await route.continue();
  });
  await page.goto(base + "/publisher");
  await expect(
    page.getByText("经营概况加载失败", { exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    4,
  );
  await expect(page.getByText("经营概况加载失败", { exact: true })).toHaveCount(
    0,
  );
  await context.unroute("**/api/v1/publisher/overview?*");
  report.checks.push(
    "failed LIVE summary reads expose retry feedback and recover through the normal request path",
  );

  const controlled = structuredClone(seed);
  controlled.finances = [
    {
      ...seed.finances[0],
      pending_minor: huge,
      settled_minor: huge,
      funded_minor: huge,
      allocated_minor: huge,
    },
    { ...seed.finances[0], currency: "USD", pending_minor: "12345" },
  ];
  controlled.services[0].title = "跨格式长期处理脚本".repeat(14);
  controlled.services[0].script_name = "continuous_custom_processor_".repeat(
    12,
  );
  controlled.services[0].sold_count = huge;
  controlled.services[0].sales = [{ currency: "USD", funded_minor: huge }];
  controlled.counts.abnormal_deployments = "1";
  controlled.counts.ready_deployments = "3";
  controlled.alerts = [
    {
      id: seed.services[0].deployment_id,
      script_name: "长期脚本部署",
      status: "DEGRADED",
      updated_at: seed.as_of,
    },
  ];
  controlled.refunds = [
    {
      id: randomUUID(),
      order_id: randomUUID(),
      title: "可重复产物服务",
      status: "PROCESSING",
      amount_minor: huge,
      currency: "USD",
      created_at: seed.as_of,
    },
  ];
  await context.route("**/api/v1/publisher/overview?*", (route) =>
    route.fulfill({ json: { data: controlled } }),
  );
  await page.reload();
  await expect(page.locator(".publisher-services .ant-table-row")).toHaveCount(
    4,
  );
  await expect(page.locator(".publisher-stats strong").nth(2)).toHaveText(
    "¥92233720368547758.07",
  );
  await page.getByRole("combobox", { name: "收益币种" }).click();
  await page.getByTitle("USD", { exact: true }).click();
  await expect(page.locator(".publisher-stats strong").nth(2)).toHaveText(
    "USD 123.45",
  );
  await expect(
    page.locator(".publisher-services .ant-table-row").first(),
  ).toContainText("USD 92233720368547758.07");
  await expect(page.locator(".publisher-alert a")).toHaveAttribute(
    "href",
    `/publisher/deployments?deployment=${controlled.alerts[0].id}`,
  );
  await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  for (const width of [390, 700, 1000, 1450, 1814]) {
    await page.setViewportSize({ width, height: 868 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  await page.evaluate(async () => {
    scrollTo(0, 0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.screenshot({
    path: path.join(output, "PUBLISHER-S01-live-multicurrency.png"),
    fullPage: true,
  });
  report.screenshots.push("PUBLISHER-S01-live-multicurrency");
  report.checks.push(
    "controlled LIVE responses keep exact large numeric strings, long script names and multiple currencies distinct, with current deployment identity links and five responsive widths",
  );
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "publisher overview API and dashboard complete without browser exceptions",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack;
  process.exitCode = 1;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  releaseOverview?.();
  if (connection) {
    await connection.query("ROLLBACK");
    connection.release();
  }
  await pool.end();
  await browser?.close();
  await server?.close();
  await application?.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
