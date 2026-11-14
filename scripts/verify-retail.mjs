import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";

loadEnvFile(path.resolve(process.argv[2] || ".env"));
const output = path.resolve("output/verification/retail-pages");
await mkdir(output, { recursive: true });
const base = "http://127.0.0.1:5174";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch();
const report = {
  date: new Date().toISOString(),
  baseURL: base,
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
};
const require = createRequire(import.meta.url);
const { AppController } = require("../apps/control-api/dist/app.controller.js");
let connection;
async function contextFor(role = "GUEST") {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  if (role === "USER") {
    const login = await context.request.post(base + "/api/v1/auth/login", {
      data: { email: "consumer@example.invalid", password: "TravelTools2026!" },
    });
    expect(login.status()).toBe(200);
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  return { context, page };
}
async function capture(page, name, selector) {
  await expect(page.locator(selector)).toBeVisible();
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
  const response = await fetch(base + "/api/v1/services");
  assert.equal(response.status, 200);
  const envelope = await response.json();
  const services = envelope.data;
  assert.equal(
    new Set(services.map((service) => service.id)).size,
    services.length,
  );
  for (const service of services) {
    assert.equal(typeof service.amount_minor, "string");
    assert.equal(typeof service.max_service_seconds, "string");
    assert.equal(typeof service.resolution_seconds, "string");
    assert.equal(typeof service.validity_seconds, "string");
    assert.equal(typeof service.script_version, "string");
    assert.equal(typeof service.availability.can_purchase, "boolean");
    assert.ok(
      service.published_at && service.updated_at && service.output_schema,
    );
  }
  const table = services.find(
    (service) => service.input_schema_digest === "schema-table",
  );
  const travel = services.find((service) => service.scene_key === "travel");
  assert.ok(table && travel);
  report.checks.push(
    "public catalog returns unique published services with immutable release content, version, schemas, integer price and duration strings, timestamps and purchase availability",
  );

  connection = await pool.connect();
  await connection.query("BEGIN");
  const controller = new AppController(connection, undefined, undefined);
  const original = (await controller.services()).find(
    (service) => service.id === table.id,
  );
  const ownership = (
    await connection.query(
      "SELECT owner_user_id,current_release_id FROM travel.services WHERE id=$1",
      [table.id],
    )
  ).rows[0];
  await connection.query(
    "UPDATE travel.services SET title='Unpublished editing title',description='Unpublished editing description' WHERE id=$1",
    [table.id],
  );
  assert.equal(
    (await controller.services()).find((service) => service.id === table.id)
      .title,
    original.title,
  );
  const priceId = randomUUID();
  await connection.query(
    `INSERT INTO travel.price_plans(id,owner_user_id,service_release_id,version,commerce_policy_id,unit_amount_minor,currency,validity_seconds)
    SELECT $1,owner_user_id,service_release_id,(SELECT max(version)+1 FROM travel.price_plans WHERE service_release_id=$2),commerce_policy_id,unit_amount_minor+1,currency,validity_seconds FROM travel.price_plans WHERE id=$3`,
    [priceId, ownership.current_release_id, original.price_plan_id],
  );
  const revised = (await controller.services()).filter(
    (service) => service.id === table.id,
  );
  assert.equal(revised.length, 1);
  assert.equal(revised[0].price_plan_id, priceId);
  assert.equal(
    BigInt(revised[0].amount_minor),
    BigInt(original.amount_minor) + 1n,
  );
  report.checks.push(
    "an unpublished title edit cannot replace release content, and multiple active price versions resolve to one latest plan without duplicate service cards",
  );
  await connection.query(
    "UPDATE travel.publisher_profiles SET enabled=false WHERE owner_user_id=$1",
    [ownership.owner_user_id],
  );
  assert.equal(
    (await controller.services()).find((service) => service.id === table.id)
      .availability.can_purchase,
    false,
  );
  await connection.query(
    "UPDATE travel.publisher_profiles SET enabled=true WHERE owner_user_id=$1",
    [ownership.owner_user_id],
  );
  await connection.query("SAVEPOINT version_availability");
  await connection.query(
    "UPDATE travel.script_versions SET content_status='REVOKED' WHERE id=$1",
    [table.script_version_id],
  );
  assert.equal(
    (await controller.services()).find((service) => service.id === table.id)
      .availability.can_purchase,
    false,
  );
  await connection.query("ROLLBACK TO SAVEPOINT version_availability");
  const deploymentId = (
    await connection.query(
      "SELECT deployment_id FROM travel.service_releases WHERE id=$1",
      [table.release_id],
    )
  ).rows[0].deployment_id;
  await connection.query("SAVEPOINT deployment_availability");
  await connection.query(
    "UPDATE travel.deployments SET status='STOPPED' WHERE id=$1",
    [deploymentId],
  );
  assert.equal(
    (await controller.services()).find((service) => service.id === table.id)
      .availability.can_purchase,
    false,
  );
  await connection.query("ROLLBACK TO SAVEPOINT deployment_availability");
  const oldMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(
      (await controller.services()).find((service) => service.id === table.id)
        .availability.can_purchase,
      false,
    );
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
  }
  await connection.query("ROLLBACK");
  connection.release();
  connection = undefined;
  report.checks.push(
    "publisher disablement, revoked script, stopped deployment and production-mode development fixtures all prevent purchasing, with verification changes rolled back",
  );

  for (const role of ["GUEST", "USER"]) {
    const { context, page } = await contextFor(role);
    await page.goto(base + "/market");
    await expect(page.locator(".service-card")).toHaveCount(services.length);
    await capture(page, `${role}-P02`, ".market-page");
    await page.goto(base + `/services/${table.id}`);
    await expect(page.locator(".retail-service-banner")).toContainText(
      table.delivery_policy.publisher_name,
    );
    await expect(page.locator(".service-parameter-examples")).toContainText(
      "去重字段",
    );
    await expect(page.locator(".service-parameter-examples")).not.toContainText(
      "空值处理",
    );
    await capture(page, `${role}-P03`, ".service-detail-page");
    await page.getByRole("tab", { name: "输入与输出", exact: true }).click();
    await expect(page.locator(".service-schema-tab")).toContainText(
      "output_format",
    );
    await page.getByRole("tab", { name: "购买规则", exact: true }).click();
    await expect(page.locator(".service-rules-tab")).toContainText(
      table.refund_policy.summary,
    );
    const scene = new URLSearchParams({
      attraction: "beijing",
      date: "2026-11-21",
      slot: "下午",
      party_size: "2",
    });
    await page.goto(base + `/travel/attractions/${travel.id}?${scene}`);
    await expect(page.locator(".travel-service-banner")).toContainText(
      "城市历史馆",
    );
    await expect(page.locator(".travel-context-facts")).toContainText(
      "2026-11-21",
    );
    await expect(page.locator(".travel-rule-card")).toHaveCount(4);
    await capture(page, `${role}-P05`, ".travel-service-page");
    await page
      .getByRole("button", { name: "确认预约服务", exact: true })
      .click();
    await expect(page).toHaveURL(
      role === "GUEST" ? /\/auth\?/ : /\/checkout\?/,
    );
    const checkout =
      role === "GUEST"
        ? new URL(new URL(page.url()).searchParams.get("returnTo"), base)
        : new URL(page.url());
    expect(checkout.searchParams.get("service")).toBe(travel.id);
    for (const [key, value] of scene)
      expect(checkout.searchParams.get(key)).toBe(value);
    if (role === "GUEST") {
      await page
        .getByLabel("邮箱", { exact: true })
        .fill("consumer@example.invalid");
      await page.getByLabel("密码", { exact: true }).fill("TravelTools2026!");
      await page
        .locator(".auth-card")
        .getByRole("button", { name: "登录", exact: true })
        .click();
      await expect(page).toHaveURL(/\/checkout\?/);
      for (const [key, value] of scene)
        expect(new URL(page.url()).searchParams.get(key)).toBe(value);
      await expect(page.locator(".checkout-travel-context")).toContainText(
        "城市历史馆",
      );
    }
    if (role === "USER") {
      await expect(page.locator(".checkout-travel-context")).toContainText(
        "城市历史馆",
      );
      await expect(page.locator("form #root_source")).toBeVisible();
      await expect(page.locator("form #root_limit")).toBeVisible();
      expect(
        await page
          .locator(
            "form #root_visit_date, form #root_party_size, form #root_time_slot",
          )
          .count(),
      ).toBe(0);
      await page
        .getByLabel("数据来源", { exact: true })
        .fill("public-reference");
      await page.getByRole("button", { name: "提交订单", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "收银台", exact: true }),
      ).toBeVisible();
    }
    await page.goto(
      base + `/travel/attractions/${travel.id}?attraction=suzhou`,
    );
    await expect(page.locator(".service-purchase-button")).toBeDisabled();
    await page.goto(base + `/travel/attractions/${travel.id}?date=2026-02-30`);
    await expect(
      page.getByText("景点或预约条件无效，请返回城市与景点重新选择"),
    ).toBeVisible();
    await context.close();
    report.checks.push(
      `${role} market and service pages render their role-specific regions, published rules and schema examples, preserve travel context through purchase or authentication, and reject closed or invalid attractions`,
    );
  }

  const fixture = await contextFor("USER");
  const eight = [
    ...services,
    ...services.map((service) => ({
      ...service,
      id: randomUUID(),
      title: `${service.title}扩展示例`,
    })),
  ];
  await fixture.page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: eight } }),
  );
  await fixture.page.goto(base + "/market");
  await expect(fixture.page.locator(".consumer-market-card")).toHaveCount(8);
  const rows = await fixture.page
    .locator(".consumer-market-card")
    .evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().y)),
    );
  assert.equal(new Set(rows).size, 2);
  await capture(fixture.page, "USER-P02-eight-record-layout", ".market-page");
  report.checks.push(
    "a browser-only eight-record catalog fixture verifies the consumer reference four-column two-row layout while persisted catalog content stays unchanged",
  );
  await fixture.context.close();

  const boundary = await contextFor("USER");
  const largePrices = ["9007199254740993", "9007199254740992"];
  const expensive = largePrices.map((amount_minor, index) => ({
    ...table,
    id: `boundary-${index}`,
    title: `金额边界${index}`,
    amount_minor,
  }));
  await boundary.page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: expensive } }),
  );
  await boundary.page.goto(base + "/market");
  await boundary.page
    .getByRole("combobox", { name: "服务排序", exact: true })
    .click();
  await boundary.page.getByText("价格从低到高", { exact: true }).click();
  await expect(
    boundary.page.locator(".consumer-market-card h2").first(),
  ).toHaveText("金额边界1");
  await expect(
    boundary.page.locator(".consumer-market-price").first(),
  ).toContainText("90071992547409.92");
  report.checks.push(
    "prices above Number.MAX_SAFE_INTEGER sort and display exactly as integer minor units",
  );
  await boundary.context.close();

  const unavailable = await contextFor("USER");
  await unavailable.page.route("**/api/v1/services", (route) =>
    route.fulfill({
      json: {
        ...envelope,
        data: [
          {
            ...table,
            availability: { can_purchase: false, reason: "部署当前不可用" },
          },
        ],
      },
    }),
  );
  await unavailable.page.goto(base + `/services/${table.id}`);
  await expect(
    unavailable.page.locator(".service-purchase-button"),
  ).toBeDisabled();
  await unavailable.page.goto(base + `/checkout?service=${table.id}`);
  await expect(
    unavailable.page.getByRole("button", { name: "提交订单", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "purchase availability disables detail and direct checkout entry points consistently",
  );
  await unavailable.context.close();
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
