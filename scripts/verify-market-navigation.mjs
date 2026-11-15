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
async function marketLayout() {
  return page.evaluate(() => {
    const brand = document.querySelector(".brand").getBoundingClientRect();
    const actions = document
      .querySelector(".topbar-actions")
      .getBoundingClientRect();
    const search = document
      .querySelector(".global-search")
      .getBoundingClientRect();
    return {
      width: document.documentElement.scrollWidth,
      clipped: [
        ...document.querySelectorAll(
          ".consumer-market-banner,.market-toolbar,.service-card,.service-card-top,.service-card h2,.consumer-market-price,.consumer-market-card-meta,.consumer-market-delivery,.consumer-market-refund,.service-card-metrics",
        ),
      ]
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.className),
      header_overlap: brand.right > actions.left,
      search_overlap:
        search.width > 0 &&
        (search.left < brand.right || search.right > actions.left),
    };
  });
}
async function verifyMarketLayout(role, variant = "catalog") {
  const reference = manifest.items[role + "-P02"];
  if (variant === "catalog") {
    const regions =
      role === "USER"
        ? [
            [
              ".consumer-market-banner",
              { x: 238, y: 152, width: 1559, height: 112 },
            ],
            [".market-toolbar", { x: 238, y: 274, width: 1559, height: 64 }],
            [".service-card", { x: 238, y: 355, width: 383, height: 241 }],
          ]
        : [
            [".market-toolbar", { x: 253, y: 193, width: 1540, height: 72 }],
            [".service-card", { x: 253, y: 316, width: 375, height: 238 }],
          ];
    report.layouts[role + "-P02-regions"] = [];
    for (const [selector, expected] of regions) {
      const actual = await page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      for (const coordinate of Object.keys(expected))
        assert(
          Math.abs(actual[coordinate] - expected[coordinate]) <= 3,
          JSON.stringify({ role, selector, expected, actual }),
        );
      report.layouts[role + "-P02-regions"].push({
        selector,
        expected,
        actual,
        tolerance_px: 3,
      });
    }
    report.checks.push(
      role +
        " market banner, filters and service cards follow their individual reference regions using the returned catalog rows",
    );
  }
  const widths = [
    ...new Set([
      700,
      701,
      1000,
      1001,
      1200,
      1201,
      1400,
      1401,
      1450,
      1451,
      ...Array.from({ length: 41 }, (_, index) => 390 + index * 37),
    ]),
  ];
  const responsive = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 700 ? 844 : 900 });
    if (role === "USER")
      await expect(page.locator(".workspace-button")).toHaveCSS(
        "font-size",
        width <= 700 ? "0px" : "14px",
      );
    const state = await marketLayout();
    assert(
      state.width <= width &&
        state.clipped.length === 0 &&
        !state.header_overlap &&
        !state.search_overlap,
      JSON.stringify({ role, width, variant, ...state }),
    );
    responsive.push({ viewport_width: width, ...state });
    if (width === 390 && variant === "catalog") {
      const name = role + "-P02-mobile";
      await page.screenshot({
        path: path.join(output, name + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      report.screenshots.push(name);
    }
  }
  report.layouts[role + "-P02-" + variant + "-responsive"] = responsive;
  report.checks.push(
    role +
      ` ${variant} market filters, cards, prices and header remain unclipped across ${widths.length} widths and breakpoint boundaries`,
  );
  await page.setViewportSize({
    width: reference.width,
    height: reference.height,
  });
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
    await verifyMarketLayout(role);
    const search = page.getByRole("textbox", {
      name: "搜索脚本服务",
      exact: true,
    });
    await search.fill("全部");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("全部");
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
  const referenceServices = [
    [
      "表格清洗服务",
      "数据处理",
      "table",
      "600",
      "数据小助手",
      "对表格数据进行清洗，格式统一与缺失值处理，输出可用的规范表格。",
      "输出清洗后的表格文件",
      "未达目标可全额退款",
    ],
    [
      "文件批量处理",
      "文件工具",
      "folder",
      "300",
      "效率工具集",
      "批量处理文件，如重命名、格式转换、压缩整理等，提高文件管理效率。",
      "按要求完成全部文件处理",
      "未按要求完成可退款",
    ],
    [
      "公开数据整理",
      "信息整理",
      "database",
      "500",
      "数据整理屋",
      "获取并整理公开数据，进行清洗与结构化，输出常用格式的数据文件。",
      "提供整理后的结构化数据",
      "未达目标可全额退款",
    ],
    [
      "景点预约服务",
      "旅行预约",
      "travel",
      "800",
      "出行助手",
      "根据需求完成指定景点的预约操作，并提供预约结果与凭证信息。",
      "返回预约成功凭证与关键信息",
      "预约未成功可全额退款",
    ],
    [
      "数据统计分析",
      "数据处理",
      "bars",
      "600",
      "分析小站",
      "对数据进行汇总、统计与简单分析，生成清晰的结果表格或报告。",
      "提供统计结果与分析文件",
      "未满足描述目标可退款",
    ],
    [
      "文档格式转换",
      "文件工具",
      "file",
      "300",
      "文件工坊",
      "在常见文档格式之间进行批量转换，并保持内容与排版的基本一致。",
      "输出指定格式的文件",
      "转换失败可全额退款",
    ],
    [
      "信息汇总整理",
      "信息整理",
      "stack",
      "500",
      "资料管家",
      "从多份资料中提取关键信息，按要求汇总成结构化文档，便于查阅与使用。",
      "提供汇总后的文档文件",
      "未按要求整理可退款",
    ],
    [
      "景点信息查询与预约",
      "旅行预约",
      "calendar",
      "800",
      "旅行工具箱",
      "查询景点开放与预约情况，并按要求完成预约，返回预约结果与相关信息。",
      "提供预约成功凭证与结果说明",
      "未成功预约可全额退款",
    ],
  ];
  const eight = referenceServices.map(
    (
      [title, category, icon, amount, publisher, description, delivery, refund],
      index,
    ) => {
      const source =
        services.find((service) => service.category === category) || table;
      return {
        ...source,
        id: randomUUID(),
        title,
        category,
        description,
        amount_minor: amount,
        updated_at: new Date(
          Date.UTC(2026, 10, 13, 12, 0, 8 - index),
        ).toISOString(),
        delivery_policy: {
          ...source.delivery_policy,
          icon,
          publisher_name: publisher,
          summary: delivery,
        },
        refund_policy: { ...source.refund_policy, summary: refund },
      };
    },
  );
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
  await expect(page.locator(".service-card h2")).toHaveText(
    referenceServices.map((row) => row[0]),
  );
  await verifyMarketLayout("USER", "eight-service-fixture");
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
