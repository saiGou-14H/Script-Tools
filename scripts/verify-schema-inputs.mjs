import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";
import { validatorForSchema } from "../apps/web/src/lib/schema-validator.ts";

const output = path.resolve("output/verification/schema-input-pages");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  data_source: "isolated development seed with controlled publisher schemas",
};
let application, server, browser, page;
try {
  await mkdir(output, { recursive: true });
  const modern = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { count: { type: "integer", minimum: 0 } },
    required: ["count"],
    unevaluatedProperties: false,
  };
  assert(validatorForSchema(modern).isValid(modern, { count: 0 }, modern));
  assert(
    !validatorForSchema(modern).isValid(
      modern,
      { count: 0, extra: true },
      modern,
    ),
  );
  const legacy = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { count: { type: "integer" } },
    additionalProperties: false,
  };
  assert(validatorForSchema(legacy).isValid(legacy, { count: 0 }, legacy));
  assert(
    !validatorForSchema(legacy).isValid(
      legacy,
      { count: 0, extra: true },
      legacy,
    ),
  );
  report.checks.push(
    "Draft 2020-12 and explicit draft-07 schemas retain their declared validation semantics",
  );
  application = await startVerificationApp("schema-inputs");
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
  process.env.WEB_ORIGIN = base;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
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
  const catalog = (
    await (await context.request.get(base + "/api/v1/services")).json()
  ).data;
  const table = catalog.find(
    (service) => service.input_schema_digest === "schema-table",
  );
  assert(table);
  let schema = true;
  await context.route("**/api/v1/services", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const item = body.data.find((service) => service.id === table.id);
    item.input_schema = schema;
    delete item.input_ui_schema;
    await route.fulfill({ response, json: body });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base + "/me/services/demo/use");
  for (const value of [null, false, 0, [], "custom"]) {
    await page
      .getByRole("textbox", { name: "JSON参数输入", exact: true })
      .fill(JSON.stringify(value));
    await page.getByRole("button", { name: "预览配置", exact: true }).click();
    assert.deepEqual(
      JSON.parse(await page.getByRole("dialog").locator("pre").textContent()),
      value,
    );
    await page.getByRole("button", { name: "返回配置", exact: true }).click();
  }
  report.checks.push(
    "Purchased-service configuration preserves null, false, zero, arrays and strings through its normal preview entry",
  );
  await page.screenshot({
    path: path.join(output, "USER-C07-json.png"),
    fullPage: true,
  });
  report.screenshots.push("USER-C07-json");
  schema = false;
  await page.reload();
  await expect(
    page.getByText("发布者的输入Schema为false，当前动作不接受任何输入。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(base + "/checkout?service=" + table.id);
  await expect(
    page.getByText("发布者的输入Schema为false，当前动作不接受任何输入。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "提交订单", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\?service=/);
  report.checks.push(
    "False schemas prevent configuration previews and order submission without substituted business fields",
  );
  schema = modern;
  await page.goto(base + "/me/services/demo/use");
  await page.getByRole("button", { name: "JSON输入", exact: true }).click();
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill('{"count":0,"extra":true}');
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(
    page.getByText("输入未通过发布者Schema校验", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill('{"count":7}');
  await page.getByRole("button", { name: "返回表单", exact: true }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("7");
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  assert.deepEqual(
    JSON.parse(await page.getByRole("dialog").locator("pre").textContent()),
    { count: 7 },
  );
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  report.checks.push(
    "JSON and RJSF modes retain values across switching and enforce draft-2020 unevaluated-properties constraints",
  );
  schema = true;
  await page.goto(base + "/checkout?service=" + table.id);
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill("0");
  await page.getByRole("button", { name: "提交订单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "收银台", exact: true }),
  ).toBeVisible();
  report.checks.push(
    "Checkout accepts valid non-object input through the existing order and cashier navigation",
  );
  schema = {
    type: "object",
    properties: { value: { $ref: "#/$defs/missing" } },
  };
  await page.goto(base + "/me/services/demo/use");
  await expect(
    page.getByText("参数Schema无法编译，请核对定义。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "JSON参数输入", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "预览配置", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "Unresolvable definitions expose editable JSON and validation feedback while retaining the application route",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
  if (page)
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
} finally {
  await browser?.close();
  await server?.close();
  await application?.close();
  if (report.result === "PASS")
    await rm(path.join(output, "failure.png"), { force: true });
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
