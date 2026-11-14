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
const output = path.resolve("output/verification/admin-travel-metadata");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "admin-travel-metadata-" + randomUUID(),
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

async function fixtures(database, prefix) {
  const cityId = randomUUID(),
    otherCityId = randomUUID();
  const attractionId = randomUUID(),
    otherAttractionId = randomUUID();
  await database.query(
    `INSERT INTO travel.cities(id,code,name,enabled,created_at)
    VALUES($1,$2,$3,true,'2020-01-01'),($4,$5,$6,false,'2020-01-01')`,
    [
      cityId,
      prefix + "-city",
      prefix + "%_",
      otherCityId,
      prefix + "-other",
      prefix + "停用城市",
    ],
  );
  await database.query(
    `INSERT INTO travel.attractions(id,city_id,name,timezone,enabled)
    VALUES($1,$2,'公开展馆','Asia/Shanghai',true),($3,$4,'停用城市展馆','Asia/Shanghai',true)`,
    [attractionId, cityId, otherAttractionId, otherCityId],
  );
  const statuses = [
    "UNVERIFIED",
    "MONITOR_ONLY",
    "BOOKING_SUPPORTED",
    "DEGRADED",
    "DISABLED",
  ];
  const channels = [];
  for (const status of statuses) {
    const id = randomUUID();
    channels.push({ id, status });
    await database.query(
      `INSERT INTO travel.channels(id,attraction_id,name,official_url,timezone,adapter_status)
      VALUES($1,$2,$3,'https://example.invalid/official','Asia/Shanghai',$4)`,
      [id, attractionId, "渠道-" + status, status],
    );
  }
  const currentRule = randomUUID(),
    newRule = randomUUID();
  const bookingChannel = channels.find(
    (channel) => channel.status === "BOOKING_SUPPORTED",
  ).id;
  await database.query(
    `INSERT INTO travel.channel_rule_versions(id,channel_id,version,rules,source_url,verified_at,evidence)
    VALUES($1,$2,1,'{"private_rules":"raw-rule-marker"}','https://example.invalid/rules',now(),'{"private_evidence":"raw-evidence-marker"}'),
      ($3,$2,2,'{"private_rules":"raw-rule-marker"}','javascript:alert(1)',NULL,'{}')`,
    [currentRule, bookingChannel, newRule],
  );
  await database.query(
    "UPDATE travel.channels SET current_rule_version_id=$1 WHERE id=$2",
    [currentRule, bookingChannel],
  );
  const invalidChannel = channels.find(
    (channel) => channel.status === "DISABLED",
  ).id;
  await database.query(
    "UPDATE travel.channels SET current_rule_version_id=$1 WHERE id=$2",
    [currentRule, invalidChannel],
  );
  const otherChannel = randomUUID();
  await database.query(
    `INSERT INTO travel.channels(id,attraction_id,name,official_url,timezone)
    VALUES($1,$2,'其他景点渠道','https://example.invalid/other','Asia/Shanghai')`,
    [otherChannel, otherAttractionId],
  );
  const services = (
    await database.query(
      "SELECT id,owner_user_id FROM travel.services ORDER BY id LIMIT 2",
    )
  ).rows;
  assert.equal(services.length, 2);
  await database.query(
    `INSERT INTO travel.attraction_service_links(id,owner_user_id,attraction_id,service_id,channel_id)
    VALUES($1,$2,$3,$4,$5),($6,$2,$3,$4,$7),($8,$9,$3,$10,$11)`,
    [
      randomUUID(),
      services[0].owner_user_id,
      attractionId,
      services[0].id,
      bookingChannel,
      randomUUID(),
      channels[0].id,
      randomUUID(),
      services[1].owner_user_id,
      services[1].id,
      otherChannel,
    ],
  );
  return {
    cityId,
    otherCityId,
    attractionId,
    otherAttractionId,
    channels,
    bookingChannel,
    invalidChannel,
    currentRule,
    newRule,
    serviceId: services[0].id,
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
  const guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  const admin = await login("admin@example.invalid"),
    consumer = await login("consumer@example.invalid");
  const fixture = await fixtures(database, "验证目录");
  for (const path of [
    "/admin/cities",
    "/admin/attractions",
    "/admin/channels",
    `/admin/channels/${fixture.bookingChannel}/rules`,
  ]) {
    expect((await guest.get("/api/v1" + path)).status()).toBe(401);
    expect((await consumer.get("/api/v1" + path)).status()).toBe(403);
  }
  const consumerId = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized='consumer@example.invalid'",
    )
  ).rows[0].id;
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason)
    VALUES($1,$2,ARRAY['user.manage'],'Travel metadata verification')`,
    [randomUUID(), consumerId],
  );
  expect((await consumer.get("/api/v1/admin/channels")).status()).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['catalog.manage'] WHERE owner_user_id=$1",
    [consumerId],
  );
  expect((await consumer.get("/api/v1/admin/channels")).status()).toBe(200);
  report.checks.push(
    "travel catalog and rule-version HTTP routes require an authenticated ADMIN with catalog.manage, independently of user.manage",
  );

  async function get(path, status = 200, context = admin) {
    const response = await context.get("/api/v1" + path);
    expect(response.status(), path).toBe(status);
    if (status === 200)
      expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const city = (await get("/admin/cities?q=" + fixture.cityId)).data[0];
  assert.equal(city.attraction_count, "1");
  assert.equal(typeof city.revision, "string");
  assert.equal(
    (await get("/admin/cities?q=" + encodeURIComponent("%_"))).data.length,
    1,
  );
  assert.equal(
    (await get("/admin/cities?enabled=false")).data[0].id,
    fixture.otherCityId,
  );
  const attraction = (await get("/admin/attractions?city_id=" + fixture.cityId))
    .data[0];
  assert.equal(attraction.channel_count, "5");
  assert.equal(attraction.rule_source_count, "1");
  assert.equal(attraction.linked_service_count, "1");
  assert.equal(attraction.ticket_price_kind, "FREE");
  const linked = (
    await get("/admin/services?attraction_id=" + fixture.attractionId)
  ).data;
  assert.deepEqual(
    linked.map((item) => item.id),
    [fixture.serviceId],
  );
  assert.equal(
    (
      await get(
        "/admin/services?view=versions&attraction_id=" + fixture.attractionId,
      )
    ).data.length,
    1,
  );
  report.checks.push(
    "city and attraction counts retain string precision, literal wildcard search and FREE ticket policy while duplicate links and cross-attraction channel links cannot inflate associated services",
  );

  const channels = (
    await get("/admin/channels?attraction_id=" + fixture.attractionId)
  ).data;
  assert.equal(channels.length, 5);
  assert.deepEqual(
    new Set(channels.map((item) => item.adapter_status)),
    new Set(fixture.channels.map((item) => item.status)),
  );
  const booking = channels.find(
    (channel) => channel.id === fixture.bookingChannel,
  );
  assert.equal(booking.rule_version, 1);
  assert.equal(booking.has_evidence, true);
  assert.equal(booking.rule_binding_state, "BOUND");
  const invalid = channels.find(
    (channel) => channel.id === fixture.invalidChannel,
  );
  assert.equal(invalid.rule_binding_state, "INVALID");
  assert.equal(invalid.rule_version, null);
  assert.equal(invalid.verified_at, null);
  assert.equal(invalid.has_evidence, false);
  const unbound = channels.find(
    (channel) => channel.adapter_status === "UNVERIFIED",
  );
  assert.equal(unbound.rule_binding_state, "UNBOUND");
  const rules = (await get(`/admin/channels/${fixture.bookingChannel}/rules`))
    .data;
  assert.equal(rules.length, 2);
  assert.equal(
    rules.find((row) => row.id === fixture.currentRule).is_current,
    true,
  );
  assert.equal(
    rules.find((row) => row.id === fixture.newRule).is_current,
    false,
  );
  assert.equal(
    rules.find((row) => row.id === fixture.newRule).has_evidence,
    false,
  );
  for (const forbidden of [
    "raw-rule-marker",
    "raw-evidence-marker",
    '"rules"',
    '"evidence"',
    "credential_version_id",
    "account_key_hmac",
  ])
    assert.equal(
      JSON.stringify([...channels, ...rules]).includes(forbidden),
      false,
    );
  report.checks.push(
    "all five adapter states come from storage, current rules remain bound to their own channel and metadata history excludes raw rules, evidence payloads and account credentials",
  );

  for (const endpoint of [
    "/admin/cities?status=ACTIVE",
    "/admin/cities?enabled=1",
    "/admin/cities?q=a&q=b",
    "/admin/cities?limit=101",
    "/admin/attractions?city_id=bad",
    "/admin/attractions?enabled=TRUE",
    "/admin/channels?status=VERIFIED",
    "/admin/channels?attraction_id=bad",
    "/admin/channels?unknown=1",
    "/admin/services?attraction_id=bad",
    "/admin/channels/bad/rules",
    `/admin/channels/${fixture.bookingChannel}/rules?q=a`,
  ])
    await get(endpoint, 422);
  await get(`/admin/channels/${randomUUID()}/rules`, 404);
  report.checks.push(
    "strict travel query validation rejects unknown and repeated parameters, unsupported preview states, malformed references and missing rule resources",
  );

  await database.query(`INSERT INTO travel.cities(id,code,name,created_at)
    SELECT gen_random_uuid(),'cursor-'||i::text,'分页城市'||i::text,'2021-01-01 00:00:00.123456+00' FROM generate_series(1,23) i`);
  const first = await get(
    "/admin/cities?q=" + encodeURIComponent("分页城市") + "&limit=1",
  );
  const cursor = encodeURIComponent(first.next_cursor);
  const second = await get(
    "/admin/cities?q=" +
      encodeURIComponent("分页城市") +
      "&limit=1&cursor=" +
      cursor,
  );
  assert.notEqual(first.data[0].id, second.data[0].id);
  for (const endpoint of [
    "/admin/cities?limit=1",
    "/admin/cities?enabled=false&limit=1",
    "/admin/attractions?limit=1",
    "/admin/channels?limit=1",
  ])
    await get(endpoint + "&cursor=" + cursor, 422);
  await get(
    "/admin/cities?q=" +
      encodeURIComponent("分页城市") +
      "&limit=1&cursor=" +
      cursor,
    422,
    consumer,
  );
  const rulesFirst = await get(
    `/admin/channels/${fixture.bookingChannel}/rules?limit=1`,
  );
  assert.equal(
    (
      await get(
        `/admin/channels/${fixture.bookingChannel}/rules?limit=1&cursor=` +
          encodeURIComponent(rulesFirst.next_cursor),
      )
    ).data.length,
    1,
  );
  await get(
    `/admin/channels/${fixture.invalidChannel}/rules?limit=1&cursor=` +
      encodeURIComponent(rulesFirst.next_cursor),
    422,
  );
  const channelFirst = await get(
    `/admin/channels?attraction_id=${fixture.attractionId}&limit=1`,
  );
  await get(
    `/admin/channels?attraction_id=${fixture.otherAttractionId}&limit=1&cursor=` +
      encodeURIComponent(channelFirst.next_cursor),
    422,
  );
  const serviceFirst = await get("/admin/services?limit=1");
  await get(
    `/admin/services?limit=1&attraction_id=${fixture.attractionId}&cursor=` +
      encodeURIComponent(serviceFirst.next_cursor),
    422,
  );
  report.checks.push(
    "travel and service cursors retain timestamp ties and reject changes to actor, parent city, attraction, channel history, filters and resource kind",
  );

  connection = await pool.connect();
  await connection.query("BEGIN");
  const pgFixture = await fixtures(connection, "pg-travel-" + randomUUID());
  const adapter = {
    root: database.root,
    query: (sql, values) => connection.query(sql, values),
  };
  const service = new AdminMetadataService(
    adapter,
    new PaginationService(adapter),
  );
  const actor = {
    id: consumerId,
    security_revision: "1",
    roles: ["ADMIN"],
    capabilities: ["catalog.manage"],
  };
  assert.equal(
    (await service.cities(actor, { q: pgFixture.cityId })).items[0]
      .attraction_count,
    "1",
  );
  assert.equal(
    (await service.attractions(actor, { city_id: pgFixture.cityId })).items[0]
      .linked_service_count,
    "1",
  );
  assert.equal(
    (
      await service.channels(actor, { attraction_id: pgFixture.attractionId })
    ).items.find((row) => row.id === pgFixture.invalidChannel)
      .rule_binding_state,
    "INVALID",
  );
  assert.equal(
    (await service.channelRules(actor, pgFixture.bookingChannel, {})).items
      .length,
    2,
  );
  assert.deepEqual(
    (
      await service.catalog(actor, { attraction_id: pgFixture.attractionId })
    ).items.map((row) => row.id),
    [pgFixture.serviceId],
  );
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query("SELECT id FROM travel.cities WHERE id=$1", [
        pgFixture.cityId,
      ])
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 executes the same city, attraction, channel, rule-history and scoped service queries with complete transaction rollback",
  );

  const snapshot = async () =>
    (
      await database.query(`SELECT jsonb_build_object(
    'cities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM travel.cities c),
    'attractions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM travel.attractions a),
    'channels',(SELECT jsonb_agg(to_jsonb(ch) ORDER BY ch.id) FROM travel.channels ch),
    'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM travel.channel_rule_versions r)
  ) AS state`)
    ).rows[0].state;
  const before = await snapshot();
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
  const address = server.httpServer.address();
  assert.equal(typeof address, "object");
  const web = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
  const ui = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await ui.request.post(web + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  async function capture(id, width = 1814) {
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
    });
    report.screenshots.push(id);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      left: document.querySelector(".admin-page").getBoundingClientRect().left,
      contentWidth: document
        .querySelector(".admin-page")
        .getBoundingClientRect().width,
      actionsRight: document
        .querySelector(".topbar-actions")
        .getBoundingClientRect().right,
    }));
    assert.equal(layout.width, width);
    if (width === 390) {
      assert.equal(layout.left, 16);
      assert.equal(layout.contentWidth, 358);
      assert.ok(layout.actionsRight <= 390);
    }
    if (width === 1814 && !id.endsWith("-live"))
      assert.equal(layout.height, 868);
    report.layouts[id] = layout;
  }
  await page.goto(web + "/admin/travel/catalog");
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(3);
  await capture("ADMIN-O04");
  await page.getByRole("button", { name: "北京", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "景点列表（北京）", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "景点列表（北京）", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "杭州", exact: false }).click();
  await page
    .getByRole("button", { name: "城市历史馆（示例）", exact: true })
    .click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("景点名称", { exact: true })
    .fill("编辑目标快照展馆");
  await page.goBack();
  await page.getByRole("button", { name: "保存目录预览", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "景点列表（北京）", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "杭州", exact: false }).click();
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(3);
  await expect(page.locator(".admin-attraction-columns")).toContainText(
    "编辑目标快照展馆",
  );
  // A fresh route load clears local examples before the city-edit regression.
  await page.goto(web + "/admin/travel/catalog");
  await page.getByRole("button", { name: "北京", exact: false }).click();
  await page.getByRole("button", { name: "杭州", exact: false }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("tab", { name: "城市信息", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("城市名称", { exact: true })
    .fill("杭州编辑快照");
  await page.goBack();
  await page
    .getByRole("button", { name: "保存目录预览", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "景点列表（北京）", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-city-list button")).toHaveCount(3);
  await page
    .getByRole("button", { name: "杭州编辑快照", exact: false })
    .click();
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(3);
  report.checks.push(
    "preview attraction and city edits retain their captured target across browser Back navigation and duplicate confirmations cannot create another city or attraction",
  );
  await page.goto(web + "/admin/travel/catalog?city=missing");
  await expect(
    page.getByText("所选城市不存在或已失效。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(0);
  await page.goto(web + "/admin/travel/channels");
  await expect(page.locator(".admin-channel-main .ant-table-row")).toHaveCount(
    3,
  );
  await capture("ADMIN-O05");
  await page
    .locator(".admin-channel-main .ant-table-row")
    .first()
    .getByRole("checkbox")
    .check();
  await page
    .getByRole("textbox", { name: "渠道名称", exact: true })
    .fill("渠道B");
  await page
    .locator(".admin-channel-main")
    .getByRole("button", { name: "查询", exact: true })
    .click();
  await page.getByRole("button", { name: "更新规则", exact: true }).click();
  await expect(
    page.getByText("请先选择一个渠道", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "渠道名称", exact: true }),
  ).toHaveValue("渠道B");
  await expect(page.locator(".admin-channel-main .ant-table-row")).toHaveCount(
    1,
  );
  report.checks.push(
    "prototype city and channel search persist in the URL, unavailable cities retain their own identity and filtered-out selections cannot trigger a channel mutation",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, route] of [
    ["ADMIN-O04-mobile", "/admin/travel/catalog"],
    ["ADMIN-O05-mobile", "/admin/travel/channels"],
  ]) {
    await page.goto(web + route);
    await expect(
      page.locator(".admin-page .ant-table-row").first(),
    ).toBeVisible();
    await capture(id, 390);
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  report.checks.push(
    "both reference layouts fit the desktop viewport and preserve full-width content with internally scrollable tables at 390 pixels",
  );

  await ui.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  await page.goto(
    web + "/admin/travel/catalog?city=" + fixture.cityId.toUpperCase(),
  );
  await expect(
    page.locator(".admin-attraction-columns .ant-table-row"),
  ).toHaveCount(1);
  await expect(page.locator(".admin-city-list")).toContainText("验证目录%_");
  await expect(
    page.getByRole("button", { name: "新增景点", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "公开展馆", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(fixture.attractionId);
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(
    5,
  );
  await page.getByRole("tab", { name: "关联服务", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator("[role=tabpanel]:visible .ant-table-row"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "关闭景点资料", exact: true }).click();
  await capture("ADMIN-O04-live");
  await page.getByRole("button", { name: "加载更多城市", exact: true }).click();
  await expect(
    page.locator(".admin-city-list button").filter({ hasText: "分页城市" }),
  ).toHaveCount(23);
  await page.goto(web + "/admin/travel/catalog?city=" + randomUUID());
  await expect(
    page.getByText("所选城市不存在或已失效。", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "LIVE city selection resolves records beyond the first cursor page, supports uppercase UUID links and opens actual attraction, channel and scoped service metadata without enabling pending maintenance",
  );

  let failChannels = true;
  await ui.route("**/api/v1/admin/channels?**", async (route) => {
    if (failChannels)
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "UNAVAILABLE", message: "验证渠道查询暂不可用" },
        },
      });
    else await route.continue();
  });
  await page.goto(web + "/admin/travel/channels");
  await expect(
    page.getByText("渠道目录查询失败", { exact: true }),
  ).toBeVisible();
  failChannels = false;
  await page.getByRole("button", { name: "重试渠道查询", exact: true }).click();
  await expect(page.locator(".admin-channel-main .ant-table-row")).toHaveCount(
    6,
  );
  await page.getByRole("button", { name: "有证据记录", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".ant-table-row")).toHaveCount(
    2,
  );
  await expect(page.getByRole("dialog")).toContainText("规则v1（当前绑定）");
  await expect(page.getByRole("dialog")).toContainText("暂无验证时间");
  await expect(page.getByRole("dialog").getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("来源网址暂不可用");
  await page.getByRole("button", { name: "关闭验证记录", exact: true }).click();
  await capture("ADMIN-O05-live");
  await expect(
    page.getByRole("button", { name: "更新规则", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "渠道名称", exact: true })
    .fill("MONITOR_ONLY");
  await page
    .locator(".admin-channel-main")
    .getByRole("button", { name: "查询", exact: true })
    .click();
  await expect(page.locator(".admin-channel-main .ant-table-row")).toHaveCount(
    1,
  );
  await expect(page.locator(".admin-channel-main")).toContainText("仅监控");
  await page.reload();
  await expect(page.locator(".admin-channel-main .ant-table-row")).toHaveCount(
    1,
  );
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "LIVE channel queries recover from failure, preserve filters, display stored capability states and version-bound history, suppress unsafe source URLs and leave catalog business records unchanged",
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
