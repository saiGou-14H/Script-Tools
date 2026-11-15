import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { Pool } from "pg";
import { preview } from "vite";
import { startVerificationApp } from "./verification-app.mjs";

if (process.argv[2]) loadEnvFile(path.resolve(process.argv[2]));
const postgresUrl = process.env.DATABASE_URL;
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const {
  PublisherExecutionService,
} = require("../apps/control-api/dist/publisher/publisher-execution.service.js");
const {
  PaginationService,
} = require("../apps/control-api/dist/common/pagination.service.js");
const {
  ScriptService,
} = require("../apps/control-api/dist/scripts/script.service.js");
const {
  CommandReceiptService,
} = require("../apps/control-api/dist/common/command-receipt.service.js");
const output = path.resolve("output/verification/publisher-records");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    "isolated metadata and browser checks; optional PostgreSQL transaction rollback",
};
let application, server, browser, page;
const runStates = [
  "QUEUED",
  "PREPARING",
  "READY",
  "RUNNING",
  "STOPPING",
  "WAITING_INPUT",
  "RECONCILING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "EXPIRED",
  "CLOSED_UNRESOLVED",
];

async function fixtures(database) {
  async function insert(table, values) {
    const record = { id: randomUUID(), ...values },
      columns = Object.keys(record);
    await database.query(
      `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, index) => "$" + (index + 1)).join(",")})`,
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
  const seed = (
    await database.query(
      "SELECT v.*,b.base_image_id FROM travel.script_versions v JOIN travel.builds b ON b.script_version_id=v.id AND b.owner_user_id=v.owner_user_id WHERE v.owner_user_id=$1 LIMIT 1",
      [owner],
    )
  ).rows[0];
  const name = "构建样例 %_ " + randomUUID().slice(0, 8);
  async function versionFor(account, title) {
    const script = await insert("scripts", {
      owner_user_id: account,
      name: title,
    });
    const version = await insert("script_versions", {
      owner_user_id: account,
      script_id: script,
      version: "9.0",
      content_status: "DRAFT",
    });
    await insert("script_actions", {
      owner_user_id: account,
      script_version_id: version,
      name: "process",
      input_schema: "{}",
      input_schema_digest: "synthetic",
      output_schema: "{}",
      definition: "{}",
    });
    return { script, version };
  }
  const own = await versionFor(owner, name);
  const duplicate = await versionFor(owner, name);
  await insert("builds", {
    owner_user_id: owner,
    script_version_id: duplicate.version,
    base_image_id: seed.base_image_id,
    source_digest: "synthetic-duplicate-name",
    status: "SUCCEEDED",
  });
  const foreign = await versionFor(other, "unpublished-private-value");
  const foreignBuild = await insert("builds", {
    owner_user_id: other,
    script_version_id: foreign.version,
    base_image_id: seed.base_image_id,
    source_digest: "synthetic-private",
    status: "FAILED",
  });
  const buildIds = [];
  for (let index = 0; index < 24; index++) {
    const status = ["SUCCEEDED", "FAILED", "QUEUED", "RUNNING", "CANCELLED"][
      index % 5
    ];
    buildIds.push(
      await insert("builds", {
        owner_user_id: owner,
        script_version_id: own.version,
        base_image_id: seed.base_image_id,
        source_digest: "synthetic",
        status,
        created_at: "2026-11-15T01:00:00.123456Z",
        started_at:
          status === "SUCCEEDED"
            ? index === 5
              ? "2026-11-15T01:02:00Z"
              : "2026-11-15T01:00:00Z"
            : null,
        finished_at: status === "SUCCEEDED" ? "2026-11-15T01:01:20Z" : null,
        failure_code:
          status === "FAILED"
            ? index === 1
              ? "DEPENDENCY_LOCK_MISSING"
              : "dependency.lock.missing"
            : null,
      }),
    );
  }
  const digest =
    randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await database.query(
    "UPDATE travel.builds SET artifact_digest=$2 WHERE id=$1",
    [buildIds[0], "sha256:" + digest],
  );
  const object = await insert("storage_objects", {
    owner_user_id: owner,
    purpose: "ARTIFACT",
    bucket_alias: "synthetic",
    object_key: randomUUID(),
    sha256: digest,
    size_bytes: 1,
    key_version: "synthetic",
    status: "READY",
  });
  const artifact = await insert("artifacts", {
    owner_user_id: owner,
    build_id: buildIds[0],
    object_id: object,
    digest: "sha256:" + digest,
    dependency_manifest: JSON.stringify({
      private: "unpublished-private-value",
    }),
  });
  const profile = await insert("resource_profiles", {
    name: randomUUID(),
    version: 1,
    limits: JSON.stringify({
      cpu: "1.5",
      memory_mib: "9007199254740993",
      private: "unpublished-private-value",
    }),
  });
  const zeroProfile = await insert("resource_profiles", {
    name: randomUUID(),
    version: 1,
    limits: JSON.stringify({ cpu: 0, memory_mib: 0 }),
  });
  const deployments = [];
  for (let index = 0; index < 22; index++)
    deployments.push(
      await insert("deployments", {
        owner_user_id: owner,
        script_version_id: own.version,
        artifact_id: artifact,
        resource_profile_id: index === 1 ? zeroProfile : profile,
        status: [
          "PENDING",
          "DEPLOYING",
          "READY",
          "FAILED",
          "DEGRADED",
          "STOPPED",
        ][index % 6],
        runtime_snapshot: JSON.stringify(
          index === 0
            ? {}
            : {
                execution_mode: ["docker", "qemu_kvm", "qemu_tcg"][index % 3],
                private: "unpublished-private-value",
              },
        ),
        health_evidence:
          index === 0
            ? "{}"
            : JSON.stringify({ private: "unpublished-private-value" }),
        created_at: "2026-11-15T01:00:00.123456Z",
      }),
    );
  const seedRelease = (
    await database.query(
      "SELECT * FROM travel.service_releases WHERE owner_user_id=$1 LIMIT 1",
      [owner],
    )
  ).rows[0];
  const nextVersion = Number(
    (
      await database.query(
        "SELECT max(version)+1 AS version FROM travel.service_releases WHERE service_id=$1",
        [seedRelease.service_id],
      )
    ).rows[0].version,
  );
  let currentRelease;
  for (let index = 0; index < 2; index++) {
    const fields = {
      ...seedRelease,
      version: nextVersion + index,
      script_version_id: own.version,
      deployment_id: deployments[0],
    };
    for (const key of ["id", "created_at", "updated_at", "revision"])
      delete fields[key];
    for (const [key, value] of Object.entries(fields))
      if (value && typeof value === "object" && !(value instanceof Date))
        fields[key] = JSON.stringify(value);
    currentRelease = await insert("service_releases", fields);
  }
  await database.query(
    "UPDATE travel.services SET current_release_id=$2 WHERE id=$1",
    [seedRelease.service_id, currentRelease],
  );
  const payload = await insert("private_payloads", {
    owner_user_id: owner,
    purpose: "synthetic",
    key_version: "synthetic",
    ciphertext: Buffer.from("inert-synthetic"),
    content_hmac: randomUUID(),
    size_bytes: 15,
  });
  const authorization = await insert("execution_authorizations", {
    owner_user_id: owner,
    script_version_id: own.version,
    action: "process",
    grants: "{}",
    expires_at: new Date(Date.now() + 86400000),
  });
  const tests = [];
  for (const status of [...runStates, "PRIVATE_CONTROL"]) {
    const context =
      status === "PRIVATE_CONTROL" ? "PRIVATE_SELF_USE" : "AUTHOR_TEST";
    const task = await insert("tasks", {
      owner_user_id: owner,
      name: "synthetic trial",
      execution_context: context,
    });
    await insert("task_config_versions", {
      owner_user_id: owner,
      task_id: task,
      version: 1,
      execution_context: context,
      script_version_id: own.version,
      action: "process",
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
      script_version_id: own.version,
      action: "process",
      original_input_ref: payload,
      schema_digest: "synthetic",
      trigger_kind: "test",
      trigger_key: randomUUID(),
      run_mode: "finite",
      status: status === "PRIVATE_CONTROL" ? "SUCCEEDED" : status,
      effect_status:
        status === "CLOSED_UNRESOLVED" ? "UNKNOWN" : "NONE_OBSERVED",
      finished_at: status === "SUCCEEDED" ? "2026-11-15T01:01:20Z" : null,
    });
    if (status !== "PRIVATE_CONTROL") tests.push({ id: run, status });
    if (status === "SUCCEEDED")
      await insert("version_test_evidence", {
        owner_user_id: owner,
        script_version_id: own.version,
        run_id: run,
        execution_mode: "qemu_tcg",
        passed: false,
        evidence_digest: "synthetic-failed-verification",
      });
  }
  return {
    owner,
    own,
    duplicate,
    name,
    foreignBuild,
    foreignVersion: foreign.version,
    buildIds,
    deployments,
    tests,
    object,
    profile,
  };
}

async function assertions(service, data) {
  const builds = await service.list(data.owner, "builds", {
    script_version_id: data.own.version,
    limit: "100",
  });
  assert.equal(builds.items.length, 24);
  assert.equal(
    (
      await service.list(data.owner, "builds", {
        script_id: data.duplicate.script,
      })
    ).items.length,
    1,
  );
  assert.deepEqual(
    new Set(builds.items.map((item) => item.status)),
    new Set(["SUCCEEDED", "FAILED", "QUEUED", "RUNNING", "CANCELLED"]),
  );
  assert.equal(
    builds.items.find((item) => item.id === data.buildIds[0]).duration_ms,
    "80000",
  );
  assert(
    builds.items
      .filter((item) => item.status !== "SUCCEEDED")
      .every((item) => item.duration_ms === null),
  );
  assert(
    builds.items
      .filter((item) => item.failure_code)
      .every((item) =>
        ["DEPENDENCY_LOCK_MISSING", "dependency.lock.missing"].includes(
          item.failure_code,
        ),
      ),
  );
  const trials = await service.list(data.owner, "test-runs", {
    script_version_id: data.own.version,
    limit: "100",
  });
  assert.deepEqual(
    new Set(trials.items.map((item) => item.status)),
    new Set(runStates),
  );
  assert.equal(
    trials.items.find((item) => item.status === "SUCCEEDED").test_passed,
    false,
  );
  assert(
    trials.items
      .filter((item) => item.status !== "SUCCEEDED")
      .every((item) => item.test_passed === null),
  );
  const deployment = await service.get(
    data.owner,
    "deployments",
    data.deployments[0],
  );
  assert.equal(deployment.cpu, "1.5");
  assert.equal(deployment.memory_mib, "9007199254740993");
  assert.equal(deployment.configured_execution_mode, null);
  assert.equal(deployment.has_health_evidence, false);
  assert.equal(deployment.artifact_available, true);
  assert.equal(deployment.services.length, 1);
  assert.equal(deployment.services[0].is_current, true);
  const zero = await service.get(
    data.owner,
    "deployments",
    data.deployments[1],
  );
  assert.equal(zero.cpu, "0");
  assert.equal(zero.memory_mib, "0");
  assert.equal(
    builds.items.find((item) => item.id === data.buildIds[5]).duration_ms,
    null,
  );
  assert(
    !JSON.stringify([builds, trials, deployment]).includes(
      "unpublished-private-value",
    ),
  );
}

try {
  await mkdir(output, { recursive: true });
  application = await startVerificationApp("publisher-records");
  const database = application.app.get(DatabaseService);
  const data = await fixtures(database);
  const service = application.app.get(PublisherExecutionService);
  await assertions(service, data);
  report.checks.push(
    "Build, test-run and deployment projections retain every stored state, independent evidence, exact quantities and private-data boundaries",
  );
  browser = await chromium.launch();
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
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  assert.equal(
    (await context.request.get(base + "/api/v1/builds")).status(),
    401,
  );
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: { email: "publisher@example.invalid", password: "TravelTools2026!" },
  });
  assert.equal(login.status(), 200);
  async function get(route, expected = 200) {
    const response = await context.request.get(base + "/api/v1" + route);
    assert.equal(response.status(), expected, route);
    if (expected === 200)
      assert.equal(response.headers()["cache-control"], "no-store");
    return response.json();
  }
  for (const kind of ["builds", "test-runs", "deployments"])
    for (const suffix of [
      "?owner=other",
      "?limit=0",
      "?limit=101",
      "?status=invalid",
      "?q=a&q=b",
      "?script_version_id=invalid",
      "?script_id=invalid",
    ])
      await get("/" + kind + suffix, 422);
  await get("/builds/" + data.foreignBuild, 404);
  await get("/script-versions/" + data.foreignVersion + "/builds", 404);
  await get(
    "/script-versions/" +
      data.own.version +
      "/builds?script_version_id=" +
      data.foreignVersion,
    422,
  );
  await get("/builds/" + data.buildIds[0] + "?owner=other", 422);
  report.checks.push(
    "HTTP queries require a session and reject cross-owner records, unsupported filters, repeated values and conflicting version paths",
  );
  const ids = [];
  let cursor;
  do {
    const body = await get(
      "/builds?limit=1&script_version_id=" +
        data.own.version +
        (cursor ? "&cursor=" + cursor : ""),
    );
    assert(body.request_id);
    ids.push(...body.data.map((item) => item.id));
    cursor = body.next_cursor;
    if (ids.length === 1) {
      await get(
        "/builds?limit=1&status=FAILED&script_version_id=" +
          data.own.version +
          "&cursor=" +
          cursor,
        422,
      );
      await get(
        "/deployments?limit=1&script_version_id=" +
          data.own.version +
          "&cursor=" +
          cursor,
        422,
      );
    }
  } while (cursor);
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, 24);
  assert.equal(
    (await get("/builds?q=" + encodeURIComponent("%_") + "&limit=100")).data
      .length,
    25,
  );
  report.checks.push(
    "Signed keyset pages retain all microsecond-tied rows and bind resource and filters; wildcard searches remain literal",
  );
  await database.query(
    "UPDATE travel.publisher_profiles SET enabled=false WHERE owner_user_id=$1",
    [data.owner],
  );
  await get("/builds", 403);
  await database.query(
    "UPDATE travel.publisher_profiles SET enabled=true WHERE owner_user_id=$1",
    [data.owner],
  );
  report.checks.push(
    "Disabled publisher profiles lose metadata access through the same owner check used by source drafts",
  );
  await database.query(
    "UPDATE travel.storage_objects SET expires_at=now()-interval '1 second' WHERE id=$1",
    [data.object],
  );
  assert.equal(
    (await service.get(data.owner, "deployments", data.deployments[0]))
      .artifact_available,
    false,
  );
  await database.query(
    "UPDATE travel.storage_objects SET expires_at=NULL,sha256='mismatched' WHERE id=$1",
    [data.object],
  );
  assert.equal(
    (await service.get(data.owner, "deployments", data.deployments[0]))
      .artifact_available,
    false,
  );
  await database.query(
    "UPDATE travel.resource_profiles SET retired_at=now() WHERE id=$1",
    [data.profile],
  );
  assert.equal(
    (await service.get(data.owner, "deployments", data.deployments[0]))
      .memory_mib,
    "9007199254740993",
  );
  report.checks.push(
    "Expired and mismatched artifact objects remain unavailable while retired immutable profiles retain historical resource quantities",
  );
  await context.route("**/api/v1/bootstrap", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    body.data.data_mode = "live";
    await route.fulfill({ response, json: body });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const last = ids.at(-1);
  await page.goto(base + "/publisher/builds?record=" + last);
  await expect(page.locator(".build-detail")).toContainText(last);
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多记录", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(29);
  await page.reload();
  await expect(page.locator(".build-detail")).toContainText(last);
  report.checks.push(
    "The normal LIVE build route loads actual owner rows, paginates and restores an explicitly selected record beyond its first page",
  );
  const searchInput = page.getByPlaceholder("搜索脚本、版本或构建编号", {
    exact: true,
  });
  await searchInput.fill("9.0");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/q=9[.]0/);
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多记录", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(25);
  await page.reload();
  await expect(searchInput).toHaveValue("9.0");
  report.checks.push(
    "The reference header search queries owner build versions, preserves URL text and clears the previous record selection",
  );
  await page.getByRole("button", { name: "加载更多记录", exact: true }).click();
  const scriptChoice = page.getByRole("combobox", {
    name: "构建脚本",
    exact: true,
  });
  await scriptChoice.click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText(`${data.name} · ${data.duplicate.script.slice(0, 8)}`, {
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "查询构建记录", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp("script_id=" + data.duplicate.script),
  );
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(1);
  report.checks.push(
    "Same-named scripts remain independently selectable by their UUID and restore the same filtered script after reload",
  );
  await page.goto(
    base +
      "/publisher/builds?tab=trial&record=" +
      data.tests.find((item) => item.status === "SUCCEEDED").id,
  );
  await expect(page.locator(".build-detail")).toContainText("未通过");
  await expect(page.locator(".build-detail")).toContainText("TCG");
  await expect(page.locator(".build-detail")).not.toContainText("去重86条");
  report.checks.push(
    "Successful author-test run status keeps the separately stored failed test verdict and actual tested mode",
  );
  const deploymentPage = await service.list(data.owner, "deployments", {
    limit: "100",
    script_version_id: data.own.version,
  });
  const hidden = deploymentPage.items
    .slice(20)
    .find((item) => item.memory_mib === "9007199254740993").id;
  await page.goto(base + "/publisher/deployments?deployment=" + hidden);
  await expect(page.locator(".deployments-columns aside")).toContainText(
    "9007199254740993 MiB",
  );
  await expect(page.locator(".deployments-columns aside")).toContainText(
    "当前不可用",
  );
  await expect(
    page.getByRole("button", { name: "创建部署", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".deployments-columns aside")).toContainText(
    "9007199254740993 MiB",
  );
  report.checks.push(
    "LIVE deployment details restore an off-page identity, immutable resources and unavailable object state with operational controls awaiting their backend",
  );
  for (const [id, route] of [
    ["PUBLISHER-S05-live", "/publisher/builds?status=FAILED"],
    ["PUBLISHER-S06-live", "/publisher/deployments?deployment=" + hidden],
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    await expect(
      page.locator(
        ".main-content .ant-spin-spinning, .main-content .ant-spin-blur",
      ),
    ).toHaveCount(0);
    await expect(
      page.locator(".main-content .ant-spin-container").first(),
    ).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(id);
  }
  await context.route(
    "**/api/v1/builds?**",
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "synthetic query failure" } },
      }),
    { times: 4 },
  );
  await page.goto(base + "/publisher/builds");
  await expect(page.getByText("记录加载失败", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await context.unroute("**/api/v1/builds?**");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".build-records .ant-table-row")).toHaveCount(20);
  report.checks.push(
    "Failed metadata reads expose retry feedback and recover through the existing page entry",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, route] of [
    ["PUBLISHER-S05-live-mobile", "/publisher/builds?record=" + last],
    [
      "PUBLISHER-S06-live-mobile",
      "/publisher/deployments?deployment=" + hidden,
    ],
  ]) {
    await page.goto(base + route);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    await expect(
      page.locator(
        ".main-content .ant-spin-spinning, .main-content .ant-spin-blur",
      ),
    ).toHaveCount(0);
    await expect(
      page.locator(".main-content .ant-spin-container").first(),
    ).toHaveCSS("opacity", "1");
    const bounds = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      brand: document.querySelector(".brand strong").getBoundingClientRect()
        .right,
      workspace: document
        .querySelector(".workspace-button")
        .getBoundingClientRect().left,
    }));
    assert.equal(bounds.width, 390);
    assert(bounds.brand <= bounds.workspace, JSON.stringify(bounds));
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(id);
  }
  report.checks.push(
    "Both LIVE metadata routes retain long identities, exact quantities, internally scrollable tables and distinct header controls at 390px",
  );
  if (postgresUrl) {
    const pool = new Pool({ connectionString: postgresUrl });
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SET LOCAL search_path=travel,public");
      await connection.query("SET LOCAL statement_timeout='5s'");
      const adapter = {
        root: database.root,
        query: connection.query.bind(connection),
      };
      const pgData = await fixtures(adapter);
      const pgService = new PublisherExecutionService(
        adapter,
        new PaginationService(adapter),
        new ScriptService(adapter, new CommandReceiptService(adapter)),
      );
      await assertions(pgService, pgData);
      const version = (await connection.query("SHOW server_version")).rows[0]
        .server_version;
      await connection.query("ROLLBACK");
      assert.equal(
        (
          await connection.query(
            "SELECT count(*)::int AS count FROM travel.scripts WHERE id=$1",
            [pgData.own.script],
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
        "PostgreSQL verifies owner projections, every state, independent test verdicts and exact historical resources in a fully rolled-back transaction",
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
