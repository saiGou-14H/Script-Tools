import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";

const output = path.resolve("output/verification/market-navigation");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  layouts: {},
  scope:
    "isolated public catalog, production-built role routes and controlled catalog responses",
  visual_acceptance: "pending",
};
const manifest = JSON.parse(
  await readFile(
    "output/prototypes/2026-11-13-v5-commercial/manifest.json",
    "utf8",
  ),
);
let application, server, browser, page;
async function capture(role, id, name = `${role}-${id}`) {
  const reference = manifest.items[`${role}-${id}`];
  await page.setViewportSize({
    width: reference.width,
    height: reference.height,
  });
  await expect(
    page
      .locator(id === "P02" ? ".service-card" : ".retail-service-banner")
      .first(),
  ).toBeVisible();
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll_width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewport_height: innerHeight,
  }));
  assert.equal(layout.width, layout.scroll_width);
  assert.equal(layout.height, layout.viewport_height);
  report.layouts[name] = layout;
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(name);
}
async function sortByPrice() {
  await page.getByRole("combobox", { name: "服务排序", exact: true }).click();
  await page.getByText("价格从低到高", { exact: true }).click();
}
try {
  await mkdir(output, { recursive: true });
  application = await startVerificationApp("market-navigation");
  const root = path.resolve("apps/web");
  server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/api": { target: application.url } },
    },
  });
  const base = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await chromium.launch();
  const request = await browser.newContext();
  const envelope = await (
    await request.request.get(base + "/api/v1/services")
  ).json();
  const services = envelope.data;
  const table = services.find((item) => item.delivery_policy.icon === "table");
  const travel = services.find((item) => item.scene_key === "travel");
  assert(table && travel);
  await request.close();
  async function contextFor(role = "GUEST") {
    const context = await browser.newContext({
      viewport: { width: 1814, height: 868 },
    });
    if (role === "USER")
      assert.equal(
        (
          await context.request.post(base + "/api/v1/auth/login", {
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
    return context;
  }
  for (const role of ["GUEST", "USER"]) {
    const context = await contextFor(role);
    await page.goto(base + "/market");
    await capture(role, "P02");
    const search = page.getByPlaceholder(
      "搜索用途或服务，如：表格清洗、文件批量处理",
      { exact: true },
    );
    await search.fill("全部");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("全部");
    await expect(page.locator(".global-search input")).toHaveValue("全部");
    await search.fill(table.title);
    await page
      .locator(".category-buttons")
      .getByRole("button", { name: table.category, exact: true })
      .click();
    await sortByPrice();
    await expect(page.locator(".service-card")).toHaveCount(1);
    await page.reload();
    await expect(search).toHaveValue(table.title);
    await expect(
      page.getByRole("combobox", { name: "服务排序", exact: true }),
    ).toHaveText("");
    await expect(page.locator(".sort-control")).toContainText("价格从低到高");
    await expect(page.locator(".service-card")).toHaveCount(1);
    const marketUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    await page.getByRole("button", { name: "查看详情", exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get("returnTo"), marketUrl);
    await page.getByRole("tab", { name: "输入与输出", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "输入与输出", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("region", { name: "服务输入Schema", exact: true }),
    ).toContainText("source_file");
    await page.getByRole("tab", { name: "购买规则", exact: true }).click();
    await expect(page.locator(".service-rules-tab")).toContainText(
      table.refund_policy.summary,
    );
    await page
      .locator(".retail-breadcrumb")
      .getByRole("link", { name: "脚本市场", exact: true })
      .click();
    assert.equal(
      new URL(page.url()).pathname + new URL(page.url()).search,
      marketUrl,
    );
    await expect(page.locator(".service-card")).toHaveCount(1);
    await page.goto(
      base +
        `/travel/attractions/${travel.id}?${new URLSearchParams({ returnTo: marketUrl })}`,
    );
    await page
      .locator(".retail-breadcrumb")
      .getByRole("link", { name: "脚本市场", exact: true })
      .click();
    assert.equal(
      new URL(page.url()).pathname + new URL(page.url()).search,
      marketUrl,
    );
    await page.goto(base + `/services/${table.id}`);
    await capture(role, "P03");
    if (role === "USER") {
      await page.keyboard.press("Control+k");
      await expect(page.locator(".global-search input")).toBeFocused();
    }
    await page.getByRole("button", { name: "购买一次", exact: true }).click();
    await expect(page).toHaveURL(
      role === "GUEST" ? /\/auth\?/ : /\/checkout\?/,
    );
    const target =
      role === "GUEST"
        ? new URL(new URL(page.url()).searchParams.get("returnTo"), base)
        : new URL(page.url());
    assert.equal(target.searchParams.get("service"), table.id);
    assert.deepEqual([...target.searchParams.keys()], ["service"]);
    await context.close();
    report.checks.push(
      `${role} reference regions, filter and sort reload, service tabs, general/travel return paths and purchase identity remain consistent`,
    );
  }

  const states = await contextFor();
  let data;
  await page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: [data] } }),
  );
  for (const [status, label] of [
    ["READY", "已部署"],
    ["PENDING", "部署待处理"],
    ["DEPLOYING", "部署中"],
    ["FAILED", "部署失败"],
    ["DEGRADED", "部署降级"],
    ["STOPPED", "部署已停止"],
    ["__proto__", "部署状态未登记"],
  ]) {
    data = {
      ...table,
      deployment_status: status,
      availability: { can_purchase: false, reason: "发布者当前不可售" },
    };
    await page.goto(base + "/market");
    await expect(page.locator(".service-card-top")).toContainText("暂不可用");
    await expect(page.locator(".service-card-metrics")).toContainText(label);
    await page.goto(base + `/services/${table.id}`);
    await expect(page.locator(".retail-service-banner")).toContainText(label);
    await expect(page.locator(".service-purchase-button")).toBeDisabled();
  }
  data = { ...table, availability: undefined };
  await page.reload();
  await expect(page.locator(".service-purchase-button")).toBeEnabled();
  await states.close();
  report.checks.push(
    "Six deployment states and unknown legacy values retain their own labels while purchase policy independently controls entry availability",
  );

  const examples = await contextFor("USER");
  let samples = [
    {
      ...table,
      id: randomUUID(),
      title: "精度边界较大",
      amount_minor: "9007199254740993",
    },
    {
      ...table,
      id: randomUUID(),
      title: "精度边界较小",
      amount_minor: "9007199254740992",
    },
  ];
  await page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: samples } }),
  );
  await page.goto(base + "/market?sort=price");
  await expect(page.locator(".service-card h2").first()).toHaveText(
    "精度边界较小",
  );
  await expect(page.locator(".consumer-market-price").first()).toContainText(
    "90071992547409.92",
  );
  samples = [{ ...table, input_schema: false }];
  await page.goto(base + `/services/${table.id}?tab=io`);
  await expect(
    page.getByRole("region", { name: "服务输入Schema", exact: true }),
  ).toHaveText("false");
  samples = [
    {
      ...table,
      input_schema: true,
      output_schema: {
        type: "object",
        properties: Object.fromEntries(
          Array.from({ length: 160 }, (_, index) => [
            "field_" + index,
            { type: "string" },
          ]),
        ),
      },
    },
  ];
  await page.reload();
  await expect(
    page.getByRole("region", { name: "服务输入Schema", exact: true }),
  ).toHaveText("true");
  const schema = page.getByRole("region", {
    name: "服务输出Schema",
    exact: true,
  });
  await schema.focus();
  await schema.press("Control+End");
  await expect
    .poll(() => schema.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await examples.close();
  report.checks.push(
    "Decimal-string prices retain BIGINT order and precision, Boolean schemas stay literal and complete long output schemas remain keyboard-scrollable",
  );

  const failures = await contextFor();
  let fail = true;
  await page.route("**/api/v1/services", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: {
            error: {
              code: "UNAVAILABLE",
              message: "controlled catalog read failure",
            },
          },
        })
      : route.continue(),
  );
  await page.goto(base + "/market");
  await expect(page.getByText("服务暂时无法加载", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  await expect(page.locator(".result-count")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".service-card")).toHaveCount(services.length);
  await page.goto(base + "/services/invalid?tab=io");
  await expect(
    page.getByText("服务不存在或已失效", { exact: true }),
  ).toBeVisible();
  await failures.close();
  report.checks.push(
    "Catalog errors expose retry and recover actual rows, while unknown service identities remain explicit",
  );

  const expanded = await contextFor("USER");
  const eight = [
    ...services,
    ...services.map((service) => ({
      ...service,
      id: randomUUID(),
      title: service.title + "扩展示例",
    })),
  ];
  await page.route("**/api/v1/services", (route) =>
    route.fulfill({ json: { ...envelope, data: eight } }),
  );
  await page.goto(base + "/market");
  await expect(page.locator(".service-card")).toHaveCount(8);
  await capture("USER", "P02", "USER-P02-eight-service-fixture");
  const rows = await page
    .locator(".service-card")
    .evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().y)),
    );
  assert.equal(new Set(rows).size, 2);
  await expanded.close();
  report.checks.push(
    "Eight controlled service records retain the consumer reference's two-row card layout using unchanged service contracts",
  );

  for (const role of ["GUEST", "USER"]) {
    const context = await contextFor(role);
    const long = {
      ...table,
      title: "自定义脚本".repeat(14),
      category: "自定义分类".repeat(8),
      delivery_policy: {
        ...table.delivery_policy,
        publisher_name: "publisher_".repeat(12),
      },
      description: "source_".repeat(80),
    };
    await page.route("**/api/v1/services", (route) =>
      route.fulfill({ json: { ...envelope, data: [long] } }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/market");
    await expect(page.locator(".service-card")).toHaveCount(1);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.goto(base + `/services/${table.id}?tab=io`);
    await expect(
      page.getByRole("region", { name: "服务输入Schema", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    const name = `${role}-P03-mobile`;
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(name);
    await context.close();
  }
  report.checks.push(
    "Guest and consumer cards and detail schemas fit 390px while retaining custom titles, categories and publisher strings",
  );

  const returns = await contextFor();
  for (const returnTo of [
    "https://example.invalid/market",
    "//example.invalid/market",
    "/marketplace?x=1",
    "/travel?date=2026-11-15",
  ]) {
    await page.goto(
      base +
        `/services/${table.id}?${new URLSearchParams({ returnTo, tab: "unknown" })}`,
    );
    await expect(page.locator(".retail-breadcrumb a")).toHaveAttribute(
      "href",
      "/market",
    );
    await expect(
      page.getByRole("tab", { name: "服务介绍", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
  await returns.close();
  report.checks.push(
    "Market return context accepts its own local route and unsupported tab values display the introduction",
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
  await browser?.close();
  await server?.close();
  await application?.close();
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      result: report.result,
      checks: report.checks.length,
      error: report.error,
    }),
  );
}
