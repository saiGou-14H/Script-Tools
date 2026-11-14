import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, request, expect } from "@playwright/test";
import { preview } from "vite";
import { loadEnvFile } from "node:process";
import { Pool } from "pg";

if (process.argv[2]) loadEnvFile(path.resolve(process.argv[2]));
const postgresURL = process.env.DATABASE_URL;

const localRoot = path.resolve(".local");
const temporary = path.join(localRoot, `script-upload-check-${randomUUID()}`);
assert.equal(path.dirname(temporary), localRoot);
delete process.env.DATABASE_URL;
process.env.LOCAL_DATA_DIRECTORY = temporary;
process.env.DEV_SEED = "true";
process.env.NODE_ENV = "development";
process.env.WEB_ORIGIN = "http://127.0.0.1:5174";
const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const cookieParser = require("cookie-parser");
const { AppModule } = require("../apps/control-api/dist/app.module.js");
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  CommandReceiptService,
} = require("../apps/control-api/dist/common/command-receipt.service.js");
const {
  EnvelopeInterceptor,
  HttpErrorFilter,
} = require("../apps/control-api/dist/common/http.js");
const output = path.resolve("output/verification/script-upload");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  browser_errors: [],
  scope:
    "Isolated PGlite and normal upload/editor UI; synthetic accounts and text source",
};
const contexts = [];
let app;
let browser;
let webServer;
function checked(label) {
  report.checks.push(label);
}

try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useBodyParser("json", { limit: "2mb" });
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const db = app.get(DatabaseService);
  const guest = await request.newContext({ baseURL: base });
  contexts.push(guest);
  expect((await guest.get("/api/v1/me/scripts")).status()).toBe(401);
  checked("unauthenticated listing rejected");
  async function login(email) {
    const context = await request.newContext({ baseURL: base });
    contexts.push(context);
    const response = await context.post("/api/v1/auth/login", {
      data: { email, password: "TravelTools2026!" },
    });
    expect(response.status()).toBe(200);
    const { data } = await response.json();
    return { context, csrf: data.csrf_token, user: data.user };
  }
  const publisher = await login("publisher@example.invalid");
  const consumer = await login("consumer@example.invalid");
  const fixture = JSON.parse(
    await readFile("docs/contracts/examples/report.manifest.json", "utf8"),
  );
  const body = {
    name: "Synthetic private source",
    files: {
      "manifest.json": JSON.stringify(fixture),
      "main.py": "# SYNTHETIC_PRIVATE_SOURCE\n",
      "requirements.lock": "",
    },
  };
  const headers = {
    "X-CSRF-Token": publisher.csrf,
    "Idempotency-Key": randomUUID(),
  };
  expect(
    (await publisher.context.post("/api/v1/scripts", { data: body })).status(),
  ).toBe(403);
  expect(
    (
      await consumer.context.post("/api/v1/scripts", {
        headers: {
          "X-CSRF-Token": consumer.csrf,
          "Idempotency-Key": randomUUID(),
        },
        data: body,
      })
    ).status(),
  ).toBe(403);
  checked("CSRF and publisher qualification enforced");
  const response = await publisher.context.post("/api/v1/scripts", {
    headers,
    data: body,
  });
  expect(response.status()).toBe(201);
  const saved = (await response.json()).data;
  assert.equal(saved.content_status, "DRAFT");
  const repeated = await Promise.all(
    [1, 2].map(() =>
      publisher.context.post("/api/v1/scripts", { headers, data: body }),
    ),
  );
  for (const replay of repeated)
    assert.equal((await replay.json()).data.id, saved.id);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM travel.scripts WHERE name=$1",
        [body.name],
      )
    ).rows[0].count,
    1,
  );
  checked("upload and concurrent idempotent replay create one draft");
  expect(
    (
      await publisher.context.post("/api/v1/scripts", {
        headers,
        data: { ...body, name: "changed" },
      })
    ).status(),
  ).toBe(409);
  const versionPath = `/api/v1/script-versions/${saved.version_id}`;
  const source = await publisher.context.get(`${versionPath}/source`);
  expect(source.status()).toBe(200);
  assert.deepEqual((await source.json()).data.files, body.files);
  checked("source bytes round-trip and private encryption");
  const actionSchema = {
    type: "object",
    properties: { custom_input: { type: "string", minLength: 1 } },
    required: ["custom_input"],
    additionalProperties: false,
  };
  const overriddenManifest = structuredClone(fixture);
  overriddenManifest.actions[overriddenManifest.default_action].input_schema =
    actionSchema;
  const overriddenBody = {
    ...body,
    name: "Default action schema",
    files: {
      ...body.files,
      "manifest.json": JSON.stringify(overriddenManifest),
    },
  };
  const overriddenResponse = await publisher.context.post("/api/v1/scripts", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: overriddenBody,
  });
  assert.equal(overriddenResponse.status(), 201);
  const overridden = (await overriddenResponse.json()).data;
  assert.deepEqual(overridden.input_schema, actionSchema);
  const schemaBefore = (
    await db.query(
      "SELECT schema_digest FROM travel.script_versions WHERE id=$1",
      [overridden.version_id],
    )
  ).rows[0].schema_digest;
  overriddenManifest.actions[overriddenManifest.default_action].input_schema =
    false;
  const falseSchemaResponse = await publisher.context.patch(
    `/api/v1/script-versions/${overridden.version_id}`,
    {
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${overridden.revision}"`,
      },
      data: {
        files: {
          ...body.files,
          "manifest.json": JSON.stringify(overriddenManifest),
        },
      },
    },
  );
  assert.equal(falseSchemaResponse.status(), 200);
  assert.equal((await falseSchemaResponse.json()).data.input_schema, false);
  assert.notEqual(
    (
      await db.query(
        "SELECT schema_digest FROM travel.script_versions WHERE id=$1",
        [overridden.version_id],
      )
    ).rows[0].schema_digest,
    schemaBefore,
  );
  checked(
    "Default action schemas override version schemas, boolean false is retained, and the version digest covers action schemas",
  );
  const encrypted = await db.query(
    "SELECT ciphertext FROM travel.private_payloads WHERE owner_user_id=$1 AND purpose='SCRIPT_SOURCE'",
    [publisher.user.id],
  );
  assert.ok(
    encrypted.rows.every(
      (row) =>
        !Buffer.from(row.ciphertext).includes(
          Buffer.from("SYNTHETIC_PRIVATE_SOURCE"),
        ),
    ),
  );
  const profileResponse = await consumer.context.post(
    "/api/v1/me/publisher-profile",
    {
      headers: {
        "X-CSRF-Token": consumer.csrf,
        "Idempotency-Key": randomUUID(),
      },
      data: {
        public_name: "Synthetic second publisher",
        description: "Synthetic testing profile",
        accepted_terms_version: "V3.0",
      },
    },
  );
  expect(profileResponse.status()).toBe(201);
  expect((await consumer.context.get(`${versionPath}/source`)).status()).toBe(
    404,
  );
  checked("another publisher cannot read private source");
  const updateHeaders = {
    "X-CSRF-Token": publisher.csrf,
    "Idempotency-Key": randomUUID(),
    "If-Match": `"${saved.revision}"`,
  };
  const updatedFiles = {
    ...body.files,
    "main.py": "# UPDATED_SYNTHETIC_PRIVATE_SOURCE\n",
  };
  const update = await publisher.context.patch(versionPath, {
    headers: updateHeaders,
    data: { files: updatedFiles },
  });
  expect(update.status()).toBe(200);
  const updated = (await update.json()).data;
  assert.notEqual(updated.revision, saved.revision);
  expect(
    (
      await publisher.context.patch(versionPath, {
        headers: updateHeaders,
        data: { files: updatedFiles },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await publisher.context.patch(versionPath, {
        headers: { ...updateHeaders, "Idempotency-Key": randomUUID() },
        data: { files: updatedFiles },
      })
    ).status(),
  ).toBe(412);
  checked("draft edit revision and replay precedence");
  expect(
    (
      await publisher.context.post("/api/v1/scripts", {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: { ...body, files: { ...body.files, "../escape.py": "x" } },
      })
    ).status(),
  ).toBe(422);
  const missing = { ...body.files };
  delete missing["main.py"];
  expect(
    (
      await publisher.context.post("/api/v1/scripts", {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: { ...body, files: missing },
      })
    ).status(),
  ).toBe(422);
  checked("path escape and missing entry rejected");
  const oversized = {
    ...body,
    files: { ...body.files, "large.txt": "x".repeat(1024 * 1024) },
  };
  expect(
    (
      await publisher.context.post("/api/v1/scripts", {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: oversized,
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await publisher.context.post("/api/v1/scripts", {
        headers,
        data: { text: "x".repeat(2 * 1024 * 1024) },
      })
    ).status(),
  ).toBe(413);
  checked("source and HTTP body budgets enforced");
  const receipts = app.get(CommandReceiptService);
  const originalWrite = receipts.write;
  const countSource = async () =>
    (
      await db.query(
        "SELECT count(*)::int AS count FROM travel.private_payloads WHERE purpose='SCRIPT_SOURCE'",
      )
    ).rows[0].count;
  const before = await countSource();
  receipts.write = async () => {
    throw new Error("Synthetic receipt storage failure");
  };
  try {
    expect(
      (
        await publisher.context.post("/api/v1/scripts", {
          headers: { ...headers, "Idempotency-Key": randomUUID() },
          data: { ...body, name: "Rollback synthetic" },
        })
      ).status(),
    ).toBe(500);
  } finally {
    receipts.write = originalWrite;
  }
  assert.equal(await countSource(), before);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM travel.scripts WHERE name='Rollback synthetic'",
      )
    ).rows[0].count,
    0,
  );
  checked("partial failure rolls source and draft back atomically");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: await publisher.context.storageState(),
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.browser_errors.push(error.message));
  const webRoot = path.resolve("apps/web");
  webServer = await preview({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/api": { target: base } },
    },
  });
  const web = "http://127.0.0.1:" + webServer.httpServer.address().port;
  process.env.WEB_ORIGIN = web;
  await page.goto(web + "/publisher/scripts");
  await expect(
    page.getByRole("button", { name: "上传脚本", exact: true }),
  ).toBeVisible();
  const upload = {
    format: "script-tools/source-package@1",
    name: "合成上传工具",
    files: {
      ...body.files,
      "main.py": 'def run(input):\n    return {"rows": 1}\n',
    },
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-upload.script.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(upload)),
  });
  await page.waitForURL(/\/publisher\/scripts\/.+\/edit$/);
  const uploadedId = new URL(page.url()).pathname.split("/")[3];
  await expect(
    page.getByRole("heading", { name: /合成上传工具草稿/ }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "脚本代码" })).toHaveValue(
    upload.files["main.py"],
  );
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await expect(page.getByText(/已通过manifest 2.0结构校验/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /合成上传工具草稿/ }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "脚本代码" })).toHaveValue(
    upload.files["main.py"],
  );
  const revisedCode = upload.files["main.py"] + "# persisted UI revision\n";
  await page.getByRole("textbox", { name: "脚本代码" }).fill(revisedCode);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "脚本代码" })).toHaveValue(
    revisedCode,
  );
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "脚本代码" })).toHaveValue(
    revisedCode,
  );
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, "uploaded-draft.png"),
    fullPage: true,
  });
  report.screenshots.push("uploaded-draft");
  await page.goto(web + `/publisher/versions/${uploadedId}`);
  await expect(
    page.getByRole("heading", { name: "版本与测试", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".version-banner")).toContainText("合成上传工具");
  await expect(page.locator(".version-banner")).toContainText("DRAFT");
  await expect(
    page.getByRole("button", { name: "自用启用", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "最近测试通过", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(output, "uploaded-version.png"),
    fullPage: true,
  });
  report.screenshots.push("uploaded-version");
  checked("normal UI package upload, validation, reload and durable save");
  await page.goto(web + `/publisher/versions/${overridden.id}`);
  await expect(
    page.getByText("发布者的输入Schema为false，当前动作不接受任何输入。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预览", exact: true }),
  ).toBeDisabled();
  overriddenManifest.actions[overriddenManifest.default_action].input_schema =
    true;
  const falseRevision = (await falseSchemaResponse.json()).data.revision;
  const trueSchemaResponse = await publisher.context.patch(
    `/api/v1/script-versions/${overridden.version_id}`,
    {
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${falseRevision}"`,
      },
      data: {
        files: {
          ...body.files,
          "manifest.json": JSON.stringify(overriddenManifest),
        },
      },
    },
  );
  assert.equal(trueSchemaResponse.status(), 200);
  assert.equal((await trueSchemaResponse.json()).data.input_schema, true);
  await page.reload();
  for (const value of [null, false, 0, [], "custom"]) {
    await page
      .getByRole("textbox", { name: "JSON参数输入", exact: true })
      .fill(JSON.stringify(value));
    await page.getByRole("button", { name: "预览", exact: true }).click();
    const preview = JSON.parse(
      await page.getByRole("dialog").locator("pre").textContent(),
    );
    assert.deepEqual(preview.input, value);
    await page.getByRole("button", { name: "返回配置", exact: true }).click();
  }
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill("{broken");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(
    page.getByText("请输入有效JSON参数", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  checked(
    "Boolean action schemas retain false rejection and preserve null, false, zero, arrays and strings through live JSON previews",
  );
  const modernSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { count: { type: "integer", title: "数量", minimum: 0 } },
    required: ["count"],
    unevaluatedProperties: false,
  };
  overriddenManifest.actions[overriddenManifest.default_action].input_schema =
    modernSchema;
  const modernResponse = await publisher.context.patch(
    `/api/v1/script-versions/${overridden.version_id}`,
    {
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${(await trueSchemaResponse.json()).data.revision}"`,
      },
      data: {
        files: {
          ...body.files,
          "manifest.json": JSON.stringify(overriddenManifest),
        },
      },
    },
  );
  assert.equal(modernResponse.status(), 200);
  await page.reload();
  await page.getByRole("spinbutton", { name: /数量/ }).fill("0");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  assert.deepEqual(
    JSON.parse(await page.getByRole("dialog").locator("pre").textContent())
      .input,
    { count: 0 },
  );
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  overriddenManifest.actions[overriddenManifest.default_action].input_schema = {
    $schema: modernSchema.$schema,
    type: "null",
  };
  const nullableResponse = await publisher.context.patch(
    `/api/v1/script-versions/${overridden.version_id}`,
    {
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${(await modernResponse.json()).data.revision}"`,
      },
      data: {
        files: {
          ...body.files,
          "manifest.json": JSON.stringify(overriddenManifest),
        },
      },
    },
  );
  assert.equal(nullableResponse.status(), 200);
  await page.reload();
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill("{}");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(
    page.getByText("输入未通过发布者Schema校验", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "JSON参数输入", exact: true })
    .fill("null");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  assert.equal(
    JSON.parse(await page.getByRole("dialog").locator("pre").textContent())
      .input,
    null,
  );
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  overriddenManifest.actions[overriddenManifest.default_action].input_schema = {
    $schema: "https://example.invalid/unsupported-schema",
    type: "object",
  };
  const unsupported = await publisher.context.patch(
    `/api/v1/script-versions/${overridden.version_id}`,
    {
      headers: {
        ...headers,
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${(await nullableResponse.json()).data.revision}"`,
      },
      data: {
        files: {
          ...body.files,
          "manifest.json": JSON.stringify(overriddenManifest),
        },
      },
    },
  );
  assert.equal(unsupported.status(), 422);
  assert.equal((await unsupported.json()).error.code, "SCHEMA_UNSUPPORTED");
  checked(
    "JSON Schema 2020-12 forms retain zero, nullable roots use validated JSON input, and unsupported dialects return a recoverable validation response",
  );
  if (postgresURL) {
    const pool = new Pool({ connectionString: postgresURL, max: 1 });
    let connection;
    try {
      connection = await pool.connect();
      await connection.query("BEGIN");
      await connection.query("SET LOCAL search_path=travel,public");
      await connection.query("SET LOCAL statement_timeout='5s'");
      const owner = (
        await connection.query(
          "SELECT id FROM travel.users WHERE email_normalized=$1 AND status='ACTIVE' AND verified_at IS NOT NULL",
          ["publisher@example.invalid"],
        )
      ).rows[0]?.id;
      assert(
        owner,
        "The verified development publisher is required for PostgreSQL source checks",
      );
      const adapter = {
        root: db.root,
        query: connection.query.bind(connection),
        transaction: async (operation) => operation(connection),
      };
      const {
        ScriptService,
      } = require("../apps/control-api/dist/scripts/script.service.js");
      const service = new ScriptService(
        adapter,
        new CommandReceiptService(adapter),
      );
      const requestBody = {
        ...body,
        name: "PostgreSQL synthetic " + randomUUID(),
      };
      const requestKey = randomUUID();
      const created = await service.save(
        owner,
        requestBody,
        requestKey,
        randomUUID(),
      );
      const replay = await service.save(
        owner,
        requestBody,
        requestKey,
        randomUUID(),
      );
      assert.equal(replay.data.id, created.data.id);
      assert.deepEqual(created.data.input_schema, fixture.input_schema);
      assert.deepEqual(
        (await service.source(owner, created.data.version_id)).files,
        body.files,
      );
      const changedFiles = {
        ...body.files,
        "main.py": "# PostgreSQL synthetic revision\n",
      };
      const changed = await service.save(
        owner,
        { files: changedFiles },
        randomUUID(),
        randomUUID(),
        created.data.version_id,
        `"${created.data.revision}"`,
      );
      assert.equal(
        BigInt(changed.data.revision),
        BigInt(created.data.revision) + 1n,
      );
      assert.deepEqual(
        (await service.source(owner, created.data.version_id)).files,
        changedFiles,
      );
      assert(
        (await service.list(owner)).some(
          (record) => record.id === created.data.id,
        ),
      );
      const version = (await connection.query("SHOW server_version")).rows[0]
        .server_version;
      await connection.query("ROLLBACK");
      assert.equal(
        (
          await connection.query(
            "SELECT count(*)::int AS count FROM travel.scripts WHERE id=$1",
            [created.data.id],
          )
        ).rows[0].count,
        0,
      );
      report.postgresql = {
        server_version: version,
        transaction: "rolled_back",
        synthetic_script_removed: true,
      };
      checked(
        "PostgreSQL source encryption, replay, revision and read projections pass in a fully rolled-back transaction",
      );
    } finally {
      if (connection) {
        await connection.query("ROLLBACK");
        connection.release();
      }
      await pool.end();
    }
  }
  assert.deepEqual(report.browser_errors, []);
  await context.close();
  report.result = "PASS";
  console.log(
    `PASS: ${report.checks.length} isolated script-upload groups; UI refresh and source persistence verified.`,
  );
} catch (error) {
  report.result = "FAIL";
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await webServer?.close();
  for (const context of contexts) await context.dispose();
  await app?.close();
  assert.equal(path.dirname(temporary), localRoot);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (report.result !== "PASS") console.log(JSON.stringify(report));
}
