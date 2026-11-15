import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";

if (process.argv[2]) loadEnvFile(path.resolve(process.argv[2]));
const postgresUrl = process.env.DATABASE_URL;
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  ScriptService,
} = require("../apps/control-api/dist/scripts/script.service.js");
const {
  ScriptVersionQueryService,
} = require("../apps/control-api/dist/scripts/script-version-query.service.js");
const {
  CommandReceiptService,
} = require("../apps/control-api/dist/common/command-receipt.service.js");
const {
  PaginationService,
} = require("../apps/control-api/dist/common/pagination.service.js");
const output = path.resolve("output/verification/script-version-pages");
const template = JSON.parse(
  await readFile("docs/contracts/examples/report.manifest.json", "utf8"),
);
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    "isolated version metadata, normal browser entry points and optional rolled-back PostgreSQL checks",
  final_visual_acceptance: "pending",
};
let application, server, browser, page;

function packageFor(version) {
  const manifest = {
    ...structuredClone(template),
    version,
    default_action: "object",
    hooks: {},
    credential_requirements: [],
    extensions: [],
    input_schema: {
      type: "object",
      properties: { base: { type: "string", title: "共同参数", minLength: 1 } },
      required: ["base"],
      additionalProperties: false,
    },
    actions: Object.fromEntries(
      [
        [
          "object",
          {
            title: "对象动作",
            input_schema: {
              type: "object",
              properties: {
                count: { type: "integer", title: "数量", minimum: 1 },
              },
              required: ["count"],
              additionalProperties: false,
            },
          },
        ],
        ["raw", { title: "原始JSON", input_schema: true }],
        ["blocked", { title: "禁止输入", input_schema: false }],
        ["inherited", { title: "继承参数" }],
        ["__proto__", { title: "自定义动作名称", input_schema: true }],
      ].map(([name, definition]) => [
        name,
        {
          handler: "run",
          side_effects: "read_only",
          output_schema: {},
          ...definition,
        },
      ]),
    ),
  };
  const files = {
    [manifest.entrypoint]: "# private-version-payload\n",
    [manifest.dependencies_lock]: "",
    "manifest.json": JSON.stringify(manifest, null, 2),
  };
  return { manifest, files };
}

async function fixtures(database) {
  async function insert(table, values) {
    const record = { id: randomUUID(), ...values },
      keys = Object.keys(record);
    await database.query(
      `INSERT INTO travel.${table} (${keys.join(",")}) VALUES (${keys.map((_, index) => "$" + (index + 1)).join(",")})`,
      Object.values(record),
    );
    return record.id;
  }
  const owner = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized=$1",
      ["publisher@example.invalid"],
    )
  ).rows[0].id;
  const other = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized=$1",
      ["admin@example.invalid"],
    )
  ).rows[0].id;
  const scripts = new ScriptService(
    database,
    new CommandReceiptService(database),
  );
  const original = packageFor("1.0.0");
  const saved = (
    await scripts.save(
      owner,
      { name: "固定版本查询检验", files: original.files },
      randomUUID(),
      randomUUID(),
    )
  ).data;
  const originalRow = (
    await database.query("SELECT * FROM travel.script_versions WHERE id=$1", [
      saved.version_id,
    ])
  ).rows[0];
  const image = (
    await database.query("SELECT id FROM travel.runtime_images LIMIT 1")
  ).rows[0].id;
  await database.query(
    "UPDATE travel.script_versions SET sealed_at=now(),content_status='SEALED' WHERE id=$1",
    [saved.version_id],
  );
  const firstBuild = await insert("builds", {
    owner_user_id: owner,
    script_version_id: saved.version_id,
    base_image_id: image,
    source_digest: saved.source_digest,
    artifact_digest: "sha256:" + "a".repeat(64),
    status: "SUCCEEDED",
    created_at: "2020-01-01T00:00:00Z",
  });
  const object = await insert("storage_objects", {
    owner_user_id: owner,
    purpose: "ARTIFACT",
    bucket_alias: "synthetic-versions",
    object_key: randomUUID(),
    sha256: "a".repeat(64),
    size_bytes: 1,
    key_version: "synthetic",
    status: "READY",
  });
  const artifact = await insert("artifacts", {
    owner_user_id: owner,
    build_id: firstBuild,
    object_id: object,
    digest: "sha256:" + "a".repeat(64),
    dependency_manifest: JSON.stringify({ private: "private-version-payload" }),
  });
  await database.query(
    "UPDATE travel.script_versions SET build_artifact_id=$2,content_status='READY' WHERE id=$1",
    [saved.version_id, artifact],
  );
  for (const [name, definition] of Object.entries(original.manifest.actions)) {
    const input = Object.hasOwn(definition, "input_schema")
      ? definition.input_schema
      : original.manifest.input_schema;
    await insert("script_actions", {
      owner_user_id: owner,
      script_version_id: saved.version_id,
      name,
      input_schema: JSON.stringify(input),
      input_schema_digest: "registered-" + name,
      output_schema: "{}",
      definition: JSON.stringify({
        title: definition.title,
        private: "private-version-payload",
      }),
    });
  }
  const failedBuild = await insert("builds", {
    owner_user_id: owner,
    script_version_id: saved.version_id,
    base_image_id: image,
    source_digest: saved.source_digest,
    status: "FAILED",
    failure_code: "SYNTHETIC",
    created_at: "2030-01-01T00:00:00Z",
  });
  const versionIds = [saved.version_id];
  let draft;
  for (let index = 0; index < 25; index++) {
    const pack = packageFor("2.0." + index);
    const status = ["SEALED", "RETIRED", "REVOKED"][index] || "DRAFT";
    const id = await insert("script_versions", {
      owner_user_id: owner,
      script_id: saved.id,
      version: pack.manifest.version,
      content_status: status,
      manifest: JSON.stringify(pack.manifest),
      source_object_id: originalRow.source_object_id,
      content_hash: saved.source_digest,
      schema_digest: "synthetic",
      sealed_at: status === "DRAFT" ? null : new Date(),
      build_artifact_id: status === "RETIRED" ? artifact : null,
      created_at: "2031-01-01T00:00:00.123456Z",
    });
    versionIds.push(id);
    if (index === 3) draft = { id, pack };
  }
  await insert("script_actions", {
    owner_user_id: owner,
    script_version_id: draft.id,
    name: "object",
    input_schema: "false",
    input_schema_digest: "stale-projection",
    output_schema: "{}",
    definition: "{}",
  });
  const foreignScript = await insert("scripts", {
    owner_user_id: other,
    name: "private-version-payload",
  });
  const foreignVersion = await insert("script_versions", {
    owner_user_id: other,
    script_id: foreignScript,
    version: "1",
    content_status: "DRAFT",
  });
  const sibling = (
    await scripts.save(
      owner,
      { name: "其他本人脚本", files: packageFor("1.0.1").files },
      randomUUID(),
      randomUUID(),
    )
  ).data;
  const profile = await insert("resource_profiles", {
    name: randomUUID(),
    version: 1,
    limits: "{}",
  });
  const deployment = await insert("deployments", {
    owner_user_id: owner,
    script_version_id: saved.version_id,
    artifact_id: artifact,
    resource_profile_id: profile,
    runtime_snapshot: "{}",
    status: "STOPPED",
  });
  const payload = await insert("private_payloads", {
    owner_user_id: owner,
    purpose: "synthetic-test",
    key_version: "synthetic",
    ciphertext: Buffer.from("inert-synthetic"),
    content_hmac: randomUUID(),
    size_bytes: 15,
  });
  const runs = {};
  for (const action of ["object", "raw"]) {
    const authorization = await insert("execution_authorizations", {
      owner_user_id: owner,
      script_version_id: saved.version_id,
      action,
      grants: "{}",
      expires_at: new Date(Date.now() + 86400000),
    });
    const task = await insert("tasks", {
      owner_user_id: owner,
      name: "author test " + action,
      execution_context: "AUTHOR_TEST",
    });
    await insert("task_config_versions", {
      owner_user_id: owner,
      task_id: task,
      version: 1,
      execution_context: "AUTHOR_TEST",
      script_version_id: saved.version_id,
      action,
      input_payload_id: payload,
      input_digest: "synthetic",
      schema_digest: "synthetic",
      schedule: "{}",
      execution: "{}",
      authorization_id: authorization,
      config_digest: "synthetic",
    });
    await database.query(
      "UPDATE travel.tasks SET current_config_version=1,status='ACTIVE' WHERE id=$1",
      [task],
    );
    const run = await insert("runs", {
      owner_user_id: owner,
      task_id: task,
      config_version: 1,
      script_version_id: saved.version_id,
      action,
      original_input_ref: payload,
      schema_digest: "synthetic",
      trigger_kind: "test",
      trigger_key: randomUUID(),
      run_mode: "finite",
      status: "SUCCEEDED",
      created_at:
        action === "raw" ? "2032-01-02T00:00:00Z" : "2032-01-01T00:00:00Z",
    });
    await insert("version_test_evidence", {
      owner_user_id: owner,
      script_version_id: saved.version_id,
      run_id: run,
      execution_mode: "docker",
      passed: action === "raw",
      evidence_digest: "synthetic-" + action,
    });
    runs[action] = run;
  }
  return {
    owner,
    script: saved.id,
    original: saved.version_id,
    artifact,
    failedBuild,
    versionIds,
    draft,
    foreignScript,
    foreignVersion,
    sibling,
    runs,
    deployment,
    scripts,
  };
}

async function assertions(service, data) {
  const summary = await service.list(data.owner, data.script, { limit: "100" });
  assert.equal(summary.items.length, 26);
  assert.deepEqual(
    new Set(summary.items.map((item) => item.content_status)),
    new Set(["DRAFT", "SEALED", "READY", "RETIRED", "REVOKED"]),
  );
  assert(
    summary.items.every(
      (item) => !("manifest" in item) && !("actions" in item),
    ),
  );
  const version = await service.get(data.owner, data.original);
  assert.equal(version.latest_build_status, "FAILED");
  assert.equal(version.artifact_build_status, "SUCCEEDED");
  assert.equal(version.artifact_available, true);
  assert.deepEqual(version.deployment_states, [
    { status: "STOPPED", count: "1" },
  ]);
  assert.equal(version.action_source, "STORED_PROJECTION");
  assert.equal(
    version.actions.find((item) => item.name === "blocked").input_schema,
    false,
  );
  assert.equal(
    version.actions.find((item) => item.name === "raw").input_schema,
    true,
  );
  assert.equal(
    version.actions.find((item) => item.name === "inherited").input_schema
      .required[0],
    "base",
  );
  assert(version.actions.some((item) => item.name === "__proto__"));
  const draft = await service.get(data.owner, data.draft.id);
  assert.equal(draft.action_source, "DRAFT_MANIFEST");
  assert.equal(
    draft.actions.find((item) => item.name === "object").input_schema
      .required[0],
    "count",
  );
  assert.match(
    draft.actions.find((item) => item.name === "object").input_schema_digest,
    /^[a-f0-9]{64}$/,
  );
  assert(
    !JSON.stringify([version, draft, summary]).includes(
      "private-version-payload",
    ),
  );
}

try {
  await mkdir(output, { recursive: true });
  application = await startVerificationApp("script-version-pages");
  const database = application.app.get(DatabaseService);
  const data = await fixtures(database);
  const versions = application.app.get(ScriptVersionQueryService);
  await assertions(versions, data);
  report.checks.push(
    "Version summaries retain five content states while fixed artifacts, latest builds and deployment states retain independent facts",
  );
  report.checks.push(
    "Draft manifests and registered fixed-version actions retain their own schemas, inheritance, Boolean values and custom action names",
  );
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
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  assert.equal(
    (
      await context.request.get(
        base + "/api/v1/scripts/" + data.script + "/versions",
      )
    ).status(),
    401,
  );
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
  async function get(route, expected = 200) {
    const response = await context.request.get(base + "/api/v1" + route);
    assert.equal(response.status(), expected, route);
    if (expected === 200)
      assert.equal(response.headers()["cache-control"], "no-store");
    return response.json();
  }
  for (const query of [
    "owner=other",
    "limit=0",
    "limit=101",
    "limit=2&limit=3",
    "content_status=invalid",
  ])
    await get(`/scripts/${data.script}/versions?${query}`, 422);
  await get(`/scripts/${data.foreignScript}/versions`, 404);
  await get(`/script-versions/${data.foreignVersion}`, 404);
  await get(`/script-versions/${data.foreignVersion}/actions`, 404);
  await get(`/script-versions/${data.original}?owner=other`, 422);
  const actions = (await get(`/script-versions/${data.original}/actions`)).data;
  assert.equal(
    actions.find((item) => item.name === "blocked").input_schema,
    false,
  );
  report.checks.push(
    "Version and action HTTP reads require authentication, enforce owner scope, reject invalid queries and return no-store responses",
  );
  let cursor,
    ids = [];
  do {
    const result = await get(
      `/scripts/${data.script}/versions?limit=1${cursor ? "&cursor=" + cursor : ""}`,
    );
    ids.push(...result.data.map((item) => item.id));
    assert(ids.length <= 26);
    cursor = result.next_cursor;
    if (ids.length === 1)
      await get(
        `/scripts/${data.script}/versions?limit=1&content_status=DRAFT&cursor=${cursor}`,
        422,
      );
  } while (cursor);
  assert.equal(new Set(ids).size, 26);
  report.checks.push(
    "Signed version pages preserve microsecond-tied history and bind the selected script and content-state filters",
  );
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const url = `${base}/publisher/versions/${data.script}?version_id=${data.original}`;
  await page.goto(url);
  await expect(page.getByRole("spinbutton")).toBeVisible();
  await expect(page.locator(".version-banner")).toContainText("1.0.0");
  await expect(page.locator(".version-banner")).toContainText("最近构建失败");
  await expect(page.locator(".version-live-test")).toContainText("未通过");
  await page.getByRole("button", { name: "加载更多版本", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加载更多版本", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("version_id=" + data.original));
  await page.getByRole("spinbutton").fill("7");
  async function chooseAction(name) {
    await page
      .getByRole("combobox", { name: "自用执行动作", exact: true })
      .click();
    await page
      .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
      .filter({ hasText: `（${name}）` })
      .click();
  }
  await chooseAction("raw");
  await expect(page.getByRole("dialog")).toContainText("未保存输入");
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("7");
  await chooseAction("raw");
  await page
    .getByRole("button", { name: "切换并重新填写", exact: true })
    .click();
  await expect(page.locator(".version-live-test")).toContainText("通过");
  const jsonInput = page.getByRole("textbox", {
    name: "JSON参数输入",
    exact: true,
  });
  await jsonInput.fill("null");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  const invocationPreview = JSON.parse(
    await page.getByRole("dialog").locator("pre").textContent(),
  );
  assert.equal(invocationPreview.input, null);
  assert.equal(invocationPreview.action, "raw");
  assert.equal(invocationPreview.script_version_id, data.original);
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  report.checks.push(
    "The normal version page restores off-page history and action-specific evidence, confirms dirty switches and previews the exact version/action with null input",
  );
  await jsonInput.fill("{");
  await chooseAction("blocked");
  await page
    .getByRole("button", { name: "切换并重新填写", exact: true })
    .click();
  await expect(
    page.getByText("发布者的输入Schema为false，当前动作不接受任何输入。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预览", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".version-live-test")).toHaveCount(0);
  await chooseAction("__proto__");
  await expect(jsonInput).toHaveValue("{}");
  report.checks.push(
    "Invalid JSON can be deliberately discarded, false schemas remain rejected and custom action names receive isolated form state",
  );
  await page.goto(url + "&tab=test");
  await page
    .getByRole("button", { name: "查看构建与测试记录", exact: true })
    .click();
  await expect(page.locator(".build-detail")).toContainText(data.failedBuild);
  await page
    .locator(".build-records .ant-table-row")
    .filter({ hasText: data.failedBuild })
    .getByRole("link", { name: "1.0.0", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("version_id=" + data.original));
  await expect(page.locator(".version-tests-page > .panel")).toContainText(
    "已绑定构建状态",
  );
  await expect(page.locator(".version-tests-page > .panel")).toContainText(
    "SUCCEEDED",
  );
  await page.getByRole("tab", { name: "影响", exact: true }).click();
  await page.getByRole("button", { name: "查看关联部署", exact: true }).click();
  await expect(page.locator(".deployments-list .ant-table-row")).toHaveCount(1);
  await page
    .locator(".deployments-list")
    .getByRole("link", { name: "固定版本查询检验 1.0.0", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("version_id=" + data.original));
  report.checks.push(
    "Build and deployment links open their actual fixed version, and version links restore only its related deployment records",
  );
  await page.goto(url);
  await expect(page.locator(".version-live-test")).toContainText("未通过");
  await page.getByRole("link", { name: "查看本次试运行", exact: true }).click();
  await expect(page).toHaveURL(/action=object/);
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await expect(page.locator(".build-detail")).toContainText(data.runs.object);
  await page.getByRole("button", { name: "清除动作筛选", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(2);
  report.checks.push(
    "Action-specific trial links preserve the selected run and expose a removable action filter",
  );
  await page.goto(
    `${base}/publisher/versions/${data.script}?version_id=${data.draft.id}`,
  );
  await page.getByRole("spinbutton").fill("9");
  const changed = packageFor(data.draft.pack.manifest.version);
  changed.manifest.actions.object.input_schema = {
    type: "object",
    properties: { new_name: { type: "string", title: "新参数", minLength: 1 } },
    required: ["new_name"],
  };
  changed.files["manifest.json"] = JSON.stringify(changed.manifest, null, 2);
  const revision = (await versions.get(data.owner, data.draft.id)).revision;
  await data.scripts.save(
    data.owner,
    { files: changed.files },
    randomUUID(),
    randomUUID(),
    data.draft.id,
    `"${revision}"`,
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.waitForTimeout(250);
  await expect(page.getByRole("spinbutton")).toHaveValue("9");
  await page.getByRole("tab", { name: "版本", exact: true }).click();
  await context.route(
    `**/api/v1/script-versions/${data.draft.id}`,
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "synthetic refresh failure" } },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "刷新版本资料", exact: true }).click();
  await page
    .getByRole("button", { name: "切换并重新填写", exact: true })
    .click();
  await expect(
    page.getByText("版本资料刷新失败", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "本人自用", exact: true }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("9");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page
    .getByRole("button", { name: "切换并重新填写", exact: true })
    .click();
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(page.locator(".schema-input")).toContainText("新参数");
  report.checks.push(
    "Background activity preserves unsaved draft input, failed refreshes retain it and confirmed revision refreshes rebuild the form from the updated schema",
  );
  for (const suffix of [
    `version_id=${data.sibling.version_id}`,
    "version_id=",
    "version_id=invalid",
  ]) {
    await page.goto(`${base}/publisher/versions/${data.script}?${suffix}`);
    await expect(page.locator(".main-content .ant-empty")).toBeVisible();
    await expect(page.locator(".main-content")).not.toContainText("1200");
  }
  await page.goto(url + "&action=missing");
  await expect(
    page.getByText("请选择当前版本已声明的动作。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预览", exact: true }),
  ).toBeDisabled();
  report.checks.push(
    "Mismatched, empty and invalid version identities and unknown actions remain explicit without substituting another version or schema",
  );
  for (const [name, route] of [
    ["PUBLISHER-S04-live", url],
    ["PUBLISHER-S04-version", url + "&tab=version"],
  ]) {
    await page.goto(route);
    await expect(page.locator(".version-banner")).toBeVisible();
    await expect(page.locator(".main-content .ant-spin-spinning")).toHaveCount(
      0,
    );
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + "&action=raw");
  await expect(jsonInput).toBeVisible();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: path.join(output, "PUBLISHER-S04-live-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push("PUBLISHER-S04-live-mobile");
  report.checks.push(
    "Fixed-version metadata and multi-action forms remain navigable in the desktop reference layout and at 390px",
  );
  if (postgresUrl) {
    const pool = new Pool({ connectionString: postgresUrl }),
      connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SET LOCAL search_path=travel,public");
      await connection.query("SET LOCAL statement_timeout='5s'");
      const adapter = {
        root: database.root,
        query: connection.query.bind(connection),
        transaction: async (work) => work(connection),
      };
      const pgData = await fixtures(adapter),
        service = new ScriptVersionQueryService(
          adapter,
          new PaginationService(adapter),
          new ScriptService(adapter, new CommandReceiptService(adapter)),
        );
      await assertions(service, pgData);
      const version = (await connection.query("SHOW server_version")).rows[0]
        .server_version;
      await connection.query("ROLLBACK");
      assert.equal(
        (
          await connection.query(
            "SELECT count(*)::int AS count FROM travel.scripts WHERE id=$1",
            [pgData.script],
          )
        ).rows[0].count,
        0,
      );
      report.postgresql = {
        server_version: version,
        transaction: "rolled_back",
        synthetic_script_removed: true,
      };
      report.checks.push(
        "PostgreSQL repeats fixed-version, state and schema projection checks in a fully rolled-back transaction",
      );
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pool.end();
    }
  }
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
