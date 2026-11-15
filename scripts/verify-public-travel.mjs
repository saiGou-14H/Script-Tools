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
const output = path.resolve("output/verification/public-travel-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(localRoot, "public-travel-" + randomUUID());
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
const { AppController } = require("../apps/control-api/dist/app.controller.js");
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  PublicTravelService,
} = require("../apps/control-api/dist/public-travel.service.js");
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

async function verifyTravelDetail(context, currentPage, role, web) {
  const viewport = { width: role === "GUEST" ? 1814 : 1815, height: 867 };
  await currentPage.setViewportSize(viewport);
  await currentPage.goto(web + "/travel/attractions/demo");
  await expect(currentPage.locator(".travel-service-banner")).toContainText(
    "西湖博物馆",
  );
  const regions =
    role === "GUEST"
      ? [
          [
            ".travel-service-banner",
            { x: 257, y: 199, width: 1059, height: 194 },
          ],
          [".travel-rule-grid", { x: 257, y: 415, width: 1059, height: 412 }],
          [
            ".travel-purchase-card",
            { x: 1337, y: 199, width: 458, height: 572 },
          ],
        ]
      : [
          [
            ".travel-service-banner",
            { x: 254, y: 172, width: 1096, height: 150 },
          ],
          [
            ".travel-context-facts",
            { x: 254, y: 334, width: 1096, height: 94 },
          ],
          [".travel-rule-grid", { x: 254, y: 448, width: 1096, height: 387 }],
          [
            ".travel-purchase-card",
            { x: 1370, y: 172, width: 420, height: 538 },
          ],
        ];
  report.layouts[role + "-P05"] = [];
  for (const [selector, expected] of regions) {
    const actual = await currentPage.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    for (const coordinate of Object.keys(expected))
      assert(
        Math.abs(actual[coordinate] - expected[coordinate]) <= 3,
        JSON.stringify({ role, selector, expected, actual }),
      );
    report.layouts[role + "-P05"].push({
      selector,
      expected,
      actual,
      tolerance_px: 3,
    });
  }
  assert.equal(
    await currentPage.evaluate(() => document.documentElement.scrollHeight),
    viewport.height,
  );
  await expect(
    currentPage.locator(".travel-purchase-prices > div").first(),
  ).toHaveClass(
    role === "GUEST" ? "travel-price-ticket" : "travel-price-service",
  );
  await expect(currentPage.locator(".travel-prototype-note")).toContainText(
    "参数按发布者Schema填写",
  );
  await currentPage.screenshot({
    path: path.join(output, role + "-P05.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(role + "-P05");
  report.checks.push(
    role +
      " travel detail follows its own reference regions and price reading order while identifying its prototype conditions",
  );

  async function clipping() {
    return currentPage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      clipped: [
        ...document.querySelectorAll(
          ".travel-service-banner,.travel-context-facts,.travel-rule-card,.travel-purchase-prices,.travel-purchase-notice",
        ),
      ]
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.className),
      brand_right: document
        .querySelector(".brand strong")
        .getBoundingClientRect().right,
      actions_left: document
        .querySelector(".topbar-actions")
        .getBoundingClientRect().left,
    }));
  }
  const widths = [
    ...new Set([
      390,
      700,
      701,
      1000,
      1001,
      1050,
      1051,
      1400,
      1401,
      ...Array.from({ length: 41 }, (_, index) => 390 + index * 37),
    ]),
  ];
  const responsive = [];
  for (const width of widths) {
    await currentPage.setViewportSize({
      width,
      height: width <= 700 ? 844 : 900,
    });
    if (role === "USER")
      await expect(currentPage.locator(".workspace-button")).toHaveCSS(
        "font-size",
        width <= 700 ? "0px" : "14px",
      );
    const state = await clipping();
    assert(
      state.width <= width &&
        state.clipped.length === 0 &&
        state.brand_right <= state.actions_left,
      JSON.stringify({ role, width, ...state }),
    );
    responsive.push({ viewport_width: width, ...state });
    if (width === 390) {
      await currentPage.screenshot({
        path: path.join(output, role + "-P05-mobile.png"),
        fullPage: true,
        animations: "disabled",
      });
      report.screenshots.push(role + "-P05-mobile");
    }
  }
  report.layouts[role + "-P05-responsive"] = responsive;
  report.checks.push(
    role +
      " travel detail keeps headings, facts, rule cards, prices and purchase controls unclipped across 49 widths and breakpoint boundaries",
  );

  await currentPage.setViewportSize(viewport);
  await currentPage
    .getByRole("button", { name: "确认预约服务", exact: true })
    .click();
  await expect(currentPage).toHaveURL(
    role === "GUEST" ? /\/auth\?/ : /\/checkout\?/,
  );
  const destination =
    role === "GUEST"
      ? new URL(new URL(currentPage.url()).searchParams.get("returnTo"), web)
      : new URL(currentPage.url());
  assert(destination.searchParams.get("service"));
  for (const [key, value] of Object.entries({
    attraction: "westlake",
    date: "2026-11-20",
    slot: "上午",
    party_size: "1",
  }))
    assert.equal(destination.searchParams.get(key), value);
  await currentPage.goBack();
  await expect(currentPage.locator(".travel-context-facts")).toContainText(
    "2026-11-20",
  );
  report.checks.push(
    role +
      " travel purchase entry preserves its selected scene through authentication or checkout and browser return",
  );

  const duplicateSummary = "包含一次完整服务及同次必要接续";
  const longDelivery = "完整交付" + "schema/".repeat(80);
  await context.route("**/api/v1/services", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const service of body.data.filter(
      (item) => item.scene_key === "travel",
    )) {
      service.amount_minor = "9223372036854775807";
      service.max_service_seconds = 3600;
      service.resolution_seconds = 7200;
      service.refund_policy.summary = duplicateSummary;
      service.delivery_policy.summary = longDelivery;
    }
    await route.fulfill({ response, json: body });
  });
  const selection = new URLSearchParams({
    attraction: "westlake",
    date: "2026-11-21",
    slot: "场".repeat(100),
    party_size: "9007199254740991",
  });
  await currentPage.goto(web + "/travel/attractions/demo?" + selection);
  await expect(currentPage.locator(".travel-context-facts")).toContainText(
    selection.get("slot"),
  );
  await expect(currentPage.locator(".travel-context-facts")).toContainText(
    "9007199254740991人",
  );
  await expect(
    currentPage.locator(".travel-price-service strong"),
  ).toContainText("92233720368547758.07");
  await expect(currentPage.locator(".travel-purchase-notice")).toContainText(
    "单次执行最长1小时",
  );
  await expect(currentPage.locator(".travel-purchase-notice")).toContainText(
    "执行结束后最多核验2小时",
  );
  await expect(currentPage.locator(".travel-purchase-notice li")).toHaveCount(
    5,
  );
  await expect(
    currentPage
      .locator(".travel-purchase-notice")
      .getByText(duplicateSummary, { exact: true }),
  ).toHaveCount(2);
  await expect(
    currentPage.locator(".travel-rule-card").filter({ hasText: "服务范围" }),
  ).toContainText(longDelivery);
  for (const width of [viewport.width, 1051, 390]) {
    await currentPage.setViewportSize({ width, height: 844 });
    const state = await clipping();
    assert(
      state.width <= width && state.clipped.length === 0,
      JSON.stringify({ role, width, ...state }),
    );
  }
  await currentPage.screenshot({
    path: path.join(output, role + "-P05-long.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(role + "-P05-long");
  await context.unroute("**/api/v1/services");
  report.checks.push(
    role +
      " travel detail renders long selected conditions and publisher text, independent equal notices and exact BIGINT pricing with the returned service and verification durations",
  );
}

async function fixtures(database) {
  async function insert(table, values) {
    const record = { id: randomUUID(), ...values };
    const keys = Object.keys(record);
    await database.query(
      `INSERT INTO travel.${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
      keys.map((key) => {
        const value = record[key];
        return value && typeof value === "object" && !(value instanceof Date)
          ? JSON.stringify(value)
          : value;
      }),
    );
    return record.id;
  }
  const city = await insert("cities", {
    code: randomUUID(),
    name: "公开%_城市",
    enabled: true,
  });
  const disabledCity = await insert("cities", {
    code: randomUUID(),
    name: "未开放城市",
    enabled: false,
  });
  const attraction = await insert("attractions", {
    city_id: city,
    name: "综合%_展馆",
    description: "公开示例场馆",
    timezone: "Asia/Shanghai",
    enabled: true,
  });
  const unverifiedAttraction = await insert("attractions", {
    city_id: city,
    name: "未验证展馆",
    timezone: "Asia/Shanghai",
    enabled: true,
  });
  const unboundAttraction = await insert("attractions", {
    city_id: city,
    name: "待接入展馆",
    timezone: "Asia/Shanghai",
    enabled: true,
  });
  const disabledAttraction = await insert("attractions", {
    city_id: city,
    name: "未开放展馆",
    timezone: "Asia/Shanghai",
    enabled: false,
  });
  const hiddenAttraction = await insert("attractions", {
    city_id: disabledCity,
    name: "停用城市展馆",
    timezone: "Asia/Shanghai",
    enabled: true,
  });
  const catalog = await new AppController(database).services();
  const original = catalog.find((service) => service.scene_key === "travel");
  const originalService = (
    await database.query("SELECT * FROM travel.services WHERE id=$1", [
      original.id,
    ])
  ).rows[0];
  const release = (
    await database.query("SELECT * FROM travel.service_releases WHERE id=$1", [
      original.release_id,
    ])
  ).rows[0];
  const price = (
    await database.query("SELECT * FROM travel.price_plans WHERE id=$1", [
      original.price_plan_id,
    ])
  ).rows[0];
  function copy(row) {
    const { id, revision, created_at, updated_at, ...rest } = row;
    return rest;
  }
  const otherService = await insert("services", {
    ...copy(originalService),
    current_release_id: null,
    title: "第二景点服务",
  });
  const otherRelease = await insert("service_releases", {
    ...copy(release),
    service_id: otherService,
    title: "第二景点服务",
  });
  await insert("price_plans", {
    ...copy(price),
    service_release_id: otherRelease,
    unit_amount_minor: "9223372036854775807",
  });
  await database.query(
    "UPDATE travel.services SET current_release_id=$1 WHERE id=$2",
    [otherRelease, otherService],
  );
  const misboundService = await insert("services", {
    ...copy(originalService),
    title: "错误绑定的商品",
    current_release_id: original.release_id,
  });
  const channels = [];
  for (const status of [
    "UNVERIFIED",
    "MONITOR_ONLY",
    "BOOKING_SUPPORTED",
    "DEGRADED",
    "DISABLED",
  ]) {
    channels.push({
      id: await insert("channels", {
        attraction_id: attraction,
        name: status,
        official_url: "https://example.invalid",
        timezone: "Asia/Shanghai",
        adapter_status: status,
      }),
      status,
    });
  }
  const booking = channels.find(
    (channel) => channel.status === "BOOKING_SUPPORTED",
  ).id;
  const rule = await insert("channel_rule_versions", {
    channel_id: booking,
    version: 1,
    rules: { private: "private-rules-marker" },
    source_url: "https://example.invalid/public-rule",
    verified_at: "2020-01-01",
    evidence: { private: "private-evidence-marker" },
  });
  await database.query(
    "UPDATE travel.channels SET current_rule_version_id=$1 WHERE id=$2",
    [rule, booking],
  );
  const wrongChannel = await insert("channels", {
    attraction_id: attraction,
    name: "跨渠道规则绑定",
    official_url: "https://example.invalid",
    timezone: "Asia/Shanghai",
    adapter_status: "BOOKING_SUPPORTED",
    current_rule_version_id: rule,
  });
  const futureChannel = await insert("channels", {
    attraction_id: attraction,
    name: "未来验证时间",
    official_url: "https://example.invalid",
    timezone: "Asia/Shanghai",
    adapter_status: "BOOKING_SUPPORTED",
  });
  const futureRule = await insert("channel_rule_versions", {
    channel_id: futureChannel,
    version: 1,
    rules: {},
    source_url: "javascript:alert(1)",
    verified_at: "2099-01-01",
    evidence: {},
  });
  await database.query(
    "UPDATE travel.channels SET current_rule_version_id=$1 WHERE id=$2",
    [futureRule, futureChannel],
  );
  const unverifiedChannel = await insert("channels", {
    attraction_id: unverifiedAttraction,
    name: "待验证渠道",
    official_url: "https://example.invalid",
    timezone: "Asia/Shanghai",
    adapter_status: "UNVERIFIED",
  });
  const outsideChannel = await insert("channels", {
    attraction_id: disabledAttraction,
    name: "其他景点渠道",
    official_url: "https://example.invalid",
    timezone: "Asia/Shanghai",
    adapter_status: "BOOKING_SUPPORTED",
  });
  const nonTravel = catalog.find((service) => service.scene_key !== "travel");
  for (const [site, service, channel] of [
    [attraction, original.id, booking],
    [attraction, original.id, channels[0].id],
    [attraction, otherService, booking],
    [attraction, nonTravel.id, booking],
    [attraction, original.id, outsideChannel],
    [unverifiedAttraction, original.id, unverifiedChannel],
  ]) {
    await insert("attraction_service_links", {
      owner_user_id: originalService.owner_user_id,
      attraction_id: site,
      service_id: service,
      channel_id: channel,
    });
  }
  const cityIds = [];
  for (let index = 0; index < 23; index++) {
    const id = await insert("cities", {
      code: randomUUID(),
      name: "分页城市" + index,
      enabled: true,
      created_at: "2021-01-01 00:00:00.123456+00",
    });
    cityIds.push(id);
    await insert("attractions", {
      city_id: id,
      name: "分页场馆" + index,
      timezone: "Asia/Shanghai",
      enabled: true,
      created_at: "2021-01-01 00:00:00.123456+00",
    });
  }
  return {
    city,
    attraction,
    unverifiedAttraction,
    unboundAttraction,
    disabledAttraction,
    hiddenAttraction,
    original,
    otherService,
    misboundService,
    booking,
    wrongChannel,
    futureChannel,
  };
}

try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const database = app.get(DatabaseService);
  const guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  const webRoot = path.resolve("apps/web");
  server = await preview({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/api": { target: base } },
    },
  });
  const web = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await chromium.launch();
  async function get(url, status = 200) {
    const response = await guest.get("/api/v1" + url);
    assert.equal(response.status(), status, url);
    if (status === 200)
      assert.equal(response.headers()["cache-control"], "no-store");
    return response.json();
  }
  for (const role of ["GUEST", "USER"]) {
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    if (role === "USER")
      assert.equal(
        (
          await context.request.post(web + "/api/v1/auth/login", {
            data: {
              email: "consumer@example.invalid",
              password: "TravelTools2026!",
            },
          })
        ).status(),
        200,
      );
    page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(web + "/travel");
    await expect(page.locator(".attraction-card")).toHaveCount(3);
    if (role === "USER") {
      await expect(page.locator(".attraction-image")).toHaveCount(3);
      await page
        .locator(".attraction-image")
        .evaluateAll((images) =>
          Promise.all(images.map((image) => image.decode())),
        );
      assert(
        await page
          .locator(".attraction-image")
          .evaluateAll((images) =>
            images.every(
              (image) => image.naturalWidth > 0 && image.naturalHeight > 0,
            ),
          ),
      );
    }
    await page.screenshot({
      path: path.join(output, role + "-P04.png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(role + "-P04");
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      helpBottom: document
        .querySelector('.sidebar a[href^="/help"]')
        ?.getBoundingClientRect().bottom,
    }));
    report.layouts[role] = layout;
    assert.equal(layout.width, 1814);
    assert(layout.height <= 868, role + " desktop height " + layout.height);
    assert(layout.helpBottom <= 868, role + " navigation");
    if (role === "USER") {
      await page.keyboard.press("Control+k");
      await expect(page.locator(".global-search input")).toBeFocused();
      await page.getByRole("heading", { name: "城市与景点", level: 1 }).click();
    }
    await page.getByRole("button", { name: "北京", exact: true }).click();
    await expect(page.locator(".attraction-card")).toHaveCount(1);
    await page
      .getByRole("textbox", { name: "预约日期", exact: true })
      .fill("2026-11-21");
    await page
      .getByRole("textbox", { name: "预约日期", exact: true })
      .press("Enter");
    await page.reload();
    await expect(page.locator(".attraction-card")).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "预约日期", exact: true }),
    ).toHaveValue("2026-11-21");
    await page
      .locator(".attraction-action")
      .getByRole("button", { name: "查看服务", exact: true })
      .click();
    await expect(page.locator(".travel-service-banner")).toContainText(
      "城市历史馆",
    );
    await expect(page.locator(".travel-context-facts")).toContainText(
      "2026-11-21",
    );
    await page
      .locator(".retail-breadcrumb")
      .getByRole("link", { name: "城市与景点", exact: true })
      .click();
    await expect(page.locator(".attraction-card")).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "预约日期", exact: true }),
    ).toHaveValue("2026-11-21");
    await page
      .getByRole("textbox", { name: "搜索景点名称", exact: true })
      .fill("不存在");
    await expect(
      page.getByText("暂无匹配的景点", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(page.locator(".attraction-card")).toHaveCount(3);
    await page.goto(web + "/travel?date=2026-02-30");
    await expect(
      page.getByText("预约日期无效，请重新选择", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".attraction-card")).toHaveCount(0);
    await page.goto(web + "/travel");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".attraction-card")).toHaveCount(3);
    await page.screenshot({
      path: path.join(output, role + "-P04-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(role + "-P04-mobile");
    const box = await page.locator(".attractions-page").boundingBox();
    assert.equal(box.x, 16);
    assert.equal(box.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await verifyTravelDetail(context, page, role, web);
    await context.close();
    report.checks.push(
      `${role} travel directory restores its own reference layout, keeps city/date/search state through reload and service-detail return, preserves exact attraction identity and uses full-width 390px content`,
    );
  }

  const fixture = await fixtures(database);
  const catalog = await app.get(AppController).services();
  assert(!catalog.some((service) => service.id === fixture.misboundService));
  const ambiguous = await browser.newContext();
  const ambiguousPage = await ambiguous.newPage();
  await ambiguousPage.goto(web + "/travel");
  await expect(ambiguousPage.locator(".attraction-card")).toHaveCount(3);
  await expect(
    ambiguousPage.getByRole("button", { name: "查看服务", exact: true }),
  ).toHaveCount(0);
  await expect(
    ambiguousPage.getByRole("button", { name: "服务待接入", exact: true }),
  ).toHaveCount(2);
  await ambiguous.close();
  const detail = (
    await get(`/attractions/${fixture.attraction}?date=2026-11-21`)
  ).data;
  assert.equal(detail.requested_date, "2026-11-21");
  assert.equal(detail.inventory_status, "NOT_QUERIED");
  assert.equal(detail.ticket_price_minor, "0");
  assert.equal(detail.services.length, 2);
  assert(detail.services.every((service) => service.availability.can_purchase));
  assert.equal(
    detail.services.find((service) => service.id === fixture.otherService)
      .amount_minor,
    "9223372036854775807",
  );
  assert(
    !detail.channels.some((channel) => channel.adapter_status === "DISABLED"),
  );
  assert.equal(
    detail.channels.find((channel) => channel.id === fixture.wrongChannel)
      .current_rule_version,
    null,
  );
  assert.equal(
    detail.channels.find((channel) => channel.id === fixture.wrongChannel)
      .rule_verified,
    false,
  );
  assert.equal(
    detail.channels.find((channel) => channel.id === fixture.futureChannel)
      .rule_verified,
    false,
  );
  assert.equal(
    detail.channels.find((channel) => channel.id === fixture.futureChannel)
      .rule_source_url,
    null,
  );
  assert.equal(
    (await get(`/attractions/${fixture.unverifiedAttraction}`)).data.services[0]
      .availability.can_purchase,
    false,
  );
  assert.equal(
    (await get(`/attractions/${fixture.unboundAttraction}`)).data.services
      .length,
    0,
  );
  const listedServices = (
    await get(`/attractions/${fixture.attraction}/services?date=2026-11-21`)
  ).data;
  assert.equal(listedServices.length, 2);
  assert(
    listedServices.every(
      (service) =>
        service.input_schema &&
        service.input_schema_digest &&
        service.refund_policy,
    ),
  );
  assert.deepEqual(
    listedServices[0].input_schema,
    catalog.find((service) => service.id === listedServices[0].id).input_schema,
  );
  for (const marker of [
    "private-rules-marker",
    "private-evidence-marker",
    '"owner_user_id"',
    '"links"',
    '"evidence"',
    '"rules"',
  ])
    assert(!JSON.stringify(detail).includes(marker), marker);
  for (const id of [
    fixture.disabledAttraction,
    fixture.hiddenAttraction,
    "bad",
    randomUUID(),
  ])
    await get(`/attractions/${id}`, 404);
  report.checks.push(
    "Anonymous directory queries expose enabled cities/attractions, independently stored channel capabilities and current rule bindings, exact fee strings and only owner-consistent linked published travel services, while request dates retain NOT_QUERIED inventory state and malformed release bindings stay outside the public catalog",
  );

  for (const url of [
    "/cities?owner_user_id=other",
    "/cities?date=2026-11-20",
    "/cities?limit=0",
    "/cities?limit=101",
    "/cities?q=a&q=b",
    "/attractions?city_id=bad",
    "/attractions?date=2026-02-30",
    "/attractions?date=0000-01-01",
    "/attractions?date=a&date=b",
    "/attractions?unknown=1",
    `/attractions/${fixture.attraction}?q=a`,
    `/attractions/${fixture.attraction}/services?limit=10`,
  ])
    await get(url, 422);
  const literal = await get("/cities?q=" + encodeURIComponent("%_"));
  assert.equal(literal.data.length, 1);
  assert.equal(literal.data[0].id, fixture.city);
  const first = await get("/attractions?limit=1&date=2026-11-21");
  assert(first.next_cursor);
  const second = await get(
    "/attractions?limit=1&date=2026-11-21&cursor=" +
      encodeURIComponent(first.next_cursor),
  );
  assert.notEqual(first.data[0].id, second.data[0].id);
  for (const path of [
    "/attractions?limit=2&date=2026-11-21",
    "/attractions?limit=1&date=2026-11-22",
    "/cities?limit=1",
  ])
    await get(path + "&cursor=" + encodeURIComponent(first.next_cursor), 422);
  const [payload, signature] = first.next_cursor.split(".");
  const tampered = `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  await get(
    "/attractions?limit=1&date=2026-11-21&cursor=" +
      encodeURIComponent(tampered),
    422,
  );
  report.checks.push(
    "Public query contracts reject malformed, repeated and unknown filters, preserve literal wildcard searches and bind signed keyset cursors to resource, date, filters and page size",
  );

  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const adapter = {
    root: path.resolve("."),
    query: (sql, values) => connection.query(sql, values),
  };
  const realFixture = await fixtures(adapter);
  const realCatalog = await new AppController(adapter).services();
  const real = new PublicTravelService(adapter, new PaginationService(adapter));
  const realDetail = await real.attraction(
    realFixture.attraction,
    { date: "2026-11-21" },
    realCatalog,
  );
  assert.equal(realDetail.services.length, 2);
  assert.equal(
    realDetail.services.find(
      (service) => service.id === realFixture.otherService,
    ).amount_minor,
    "9223372036854775807",
  );
  assert(
    !realCatalog.some((service) => service.id === realFixture.misboundService),
  );
  const realPage = await real.attractions(
    { q: "分页场馆", limit: "1" },
    realCatalog,
  );
  assert(realPage.nextCursor);
  const realNext = await real.attractions(
    { q: "分页场馆", limit: "1", cursor: realPage.nextCursor },
    realCatalog,
  );
  assert.notEqual(realPage.items[0].id, realNext.items[0].id);
  await connection.query("ROLLBACK");
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 verifies public catalog binding, association projections, exact signed-64-bit prices and microsecond keyset pagination inside a fully rolled-back transaction",
  );

  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.data.data_mode = "live";
    await route.fulfill({ response, json: data });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(web + "/travel?date=2026-11-21");
  await expect(page.locator(".attraction-card")).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多景点", exact: true }).click();
  await expect(page.locator(".attraction-card")).toHaveCount(26);
  await expect(
    page.getByRole("button", { name: "更多城市", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "更多城市", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更多城市", exact: true }),
  ).toHaveCount(0);
  await context.route("**/api/v1/attractions?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const row of body.data)
      for (const service of row.services)
        service.availability = {
          can_purchase: false,
          reason: "当前服务不可售",
        };
    await route.fulfill({ response, json: body });
  });
  await page.goto(
    `${web}/travel?city=${fixture.city}&q=${encodeURIComponent("综合%_")}`,
  );
  await expect(page.locator(".attraction-card")).toHaveCount(1);
  await expect(page.locator(".attraction-card-heading .status")).toHaveText(
    "已接入",
  );
  await context.unroute("**/api/v1/attractions?**");
  await page.goto(
    `${web}/travel?date=2026-11-21&city=${fixture.city}&q=${encodeURIComponent("综合%_")}`,
  );
  await expect(page.locator(".attraction-card")).toHaveCount(1);
  await expect(page.locator(".attraction-card")).toContainText("¥8.00起/次");
  await page
    .locator(".attraction-action")
    .getByRole("button", { name: "查看服务", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".attraction-service-choice"),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("dialog").locator(".attraction-service-choice"),
  ).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText("92233720368547758.07");
  await page
    .getByRole("dialog")
    .getByRole("link")
    .filter({ hasText: "查看此服务" })
    .first()
    .click();
  await expect(page.locator(".travel-service-banner")).toContainText(
    "综合%_展馆",
  );
  await expect(page.locator(".travel-context-facts")).toContainText(
    "2026-11-21",
  );
  await context.route(
    `**/api/v1/attractions/${fixture.attraction}**`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "UNAVAILABLE", message: "景点详情暂时不可用" },
        }),
      }),
  );
  await page.reload();
  await expect(
    page.getByText("景点详情加载失败", { exact: true }),
  ).toBeVisible();
  await context.unroute(`**/api/v1/attractions/${fixture.attraction}**`);
  await page.getByRole("button", { name: "重试景点详情", exact: true }).click();
  await expect(page.locator(".travel-service-banner")).toContainText(
    "综合%_展馆",
  );
  await page
    .locator(".retail-breadcrumb")
    .getByRole("link", { name: "城市与景点", exact: true })
    .click();
  await expect(page.locator(".attraction-card")).toHaveCount(1);
  assert.equal(new URL(page.url()).searchParams.get("city"), fixture.city);
  assert.equal(new URL(page.url()).searchParams.get("date"), "2026-11-21");
  await page.screenshot({
    path: path.join(output, "GUEST-P04-live.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("GUEST-P04-live");
  await page.goto(
    `${web}/travel/attractions/${fixture.original.id}?attraction=${fixture.unverifiedAttraction}`,
  );
  await expect(page.locator(".service-purchase-button")).toBeDisabled();
  await page.goto(
    `${web}/travel/attractions/${fixture.original.id}?attraction=${fixture.unboundAttraction}`,
  );
  await expect(
    page.getByText("该景点未关联此服务", { exact: true }),
  ).toBeVisible();
  await page.goto(
    `${web}/travel/attractions/${fixture.original.id}?attraction=${fixture.disabledAttraction}`,
  );
  await expect(
    page.getByText("景点不存在或暂未开放", { exact: true }),
  ).toBeVisible();
  const other = catalog.find((service) => service.scene_key !== "travel");
  await page.goto(
    `${web}/travel/attractions/${other.id}?attraction=${fixture.attraction}`,
  );
  await expect(
    page.getByText("服务不存在或已失效", { exact: true }),
  ).toBeVisible();
  await page.goto(`${web}/travel?services=${randomUUID()}`);
  await expect(page.getByRole("dialog")).toContainText("暂无可查看服务");
  report.checks.push(
    "LIVE directory pages paginate cities and attractions, restore exact multi-service dialogs, preserve minor-unit price precision and take the selected attraction/date through linked service details and back while unknown bindings remain unavailable",
  );
  const member = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  assert.equal(
    (
      await member.request.post(web + "/api/v1/auth/login", {
        data: {
          email: "consumer@example.invalid",
          password: "TravelTools2026!",
        },
      })
    ).status(),
    200,
  );
  await member.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  const memberPage = await member.newPage();
  memberPage.on("pageerror", (error) => report.errors.push(error.message));
  await memberPage.goto(
    `${web}/travel/attractions/${fixture.original.id}?attraction=${fixture.attraction}&date=2026-11-21`,
  );
  await expect(memberPage.locator(".travel-service-banner")).toContainText(
    "综合%_展馆",
  );
  await expect(
    memberPage.locator(".travel-service-banner h2"),
  ).not.toContainText("（示例）");
  await memberPage.screenshot({
    path: path.join(output, "USER-P05-live.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("USER-P05-live");
  await member.close();

  await context.route("**/api/v1/attractions?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "目录暂时不可用" },
      }),
    }),
  );
  await page.goto(web + "/travel");
  await expect(
    page.getByText("景点目录加载失败", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".attraction-card")).toHaveCount(0);
  await context.unroute("**/api/v1/attractions?**");
  await page.getByRole("button", { name: "重试景点查询", exact: true }).click();
  await expect(page.locator(".attraction-card")).toHaveCount(20);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "GUEST-P04-live-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("GUEST-P04-live-mobile");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await context.close();
  report.checks.push(
    "Failed public directory reads expose retryable errors without prototype substitution, and real metadata layouts retain internal width at 390px",
  );
  assert.deepEqual(report.errors, []);
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
