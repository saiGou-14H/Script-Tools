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
const output = path.resolve("output/verification/admin-runtime-pages");
const localRoot = path.resolve(".local");
const temporaryData = path.join(
  localRoot,
  "admin-runtime-pages-" + randomUUID(),
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
  const nodeId = await insert("nodes", {
    name: "runtime-node-%_",
    status: "ONLINE",
    certificate_fingerprint: randomUUID(),
    capabilities: JSON.stringify({
      cpu_cores: "8",
      memory_mib: 32768,
      private_data: "raw-capability-marker",
    }),
    clock_offset_ms: "-9007199254740993",
    isolation_epoch: "9007199254740993",
  });
  const otherNodes = [];
  for (const [status, cpu, memory] of [
    ["REGISTERING", 0, "0"],
    ["DRAINING", "9223372036854775807", "9007199254740993"],
    ["OFFLINE", "bad", "9223372036854775808"],
    ["QUARANTINED", {}, -1],
  ])
    otherNodes.push(
      await insert("nodes", {
        name: "runtime-" + status,
        status,
        certificate_fingerprint: randomUUID(),
        capabilities: JSON.stringify({ cpu_cores: cpu, memory_mib: memory }),
      }),
    );
  const imageIds = [];
  for (const status of ["DRAFT", "READY", "RETIRED", "REVOKED"])
    imageIds.push(
      await insert("runtime_images", {
        name: "runtime-image-" + status,
        digest:
          "sha256:" +
          randomUUID().replaceAll("-", "") +
          randomUUID().replaceAll("-", ""),
        language: "node",
        version: "1.0",
        modes: ["docker", "qemu_tcg"],
        status,
        evidence: JSON.stringify({
          private_data: "raw-image-evidence",
          development_fixture: true,
        }),
      }),
    );
  await database.query(
    `INSERT INTO travel.quota_accounts(id,scope,scope_key,resource_key,window_start,limit_amount,reserved_amount,consumed_amount)
    VALUES($1,'GLOBAL','runtime','memory_mib',now()-interval '1 day',9223372036854775807,10,20),
      ($2,'GLOBAL','runtime','memory_mib',now()-interval '2 days',99,0,0),
      ($3,'GLOBAL','runtime','memory_mib',now()+interval '1 day',1,0,0),
      ($4,'NODE',$5,'executions',now()-interval '1 day',100,3,7),
      ($6,'USER',$5,'private.user.quota',now()-interval '1 day',200,0,0)`,
    [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      nodeId,
      randomUUID(),
    ],
  );
  const seed = (
    await database.query(
      "SELECT id,owner_user_id FROM travel.script_versions WHERE content_status='READY' ORDER BY id LIMIT 1",
    )
  ).rows[0];
  const owner = { owner_user_id: seed.owner_user_id };
  const payload = await insert("private_payloads", {
    ...owner,
    purpose: "runtime-metadata-verification",
    key_version: "verification",
    ciphertext: Buffer.from("inert-encrypted-fixture"),
    content_hmac: randomUUID(),
    size_bytes: 23,
  });
  const authorization = await insert("execution_authorizations", {
    ...owner,
    script_version_id: seed.id,
    action: "process",
    grants: "{}",
    expires_at: new Date(Date.now() + 86400000),
  });
  async function createTask() {
    const task = await insert("tasks", {
      ...owner,
      name: "runtime long-running fixture",
      execution_context: "PRIVATE_SELF_USE",
    });
    await insert("task_config_versions", {
      ...owner,
      task_id: task,
      version: 1,
      execution_context: "PRIVATE_SELF_USE",
      script_version_id: seed.id,
      action: "process",
      input_payload_id: payload,
      input_digest: "verification",
      schema_digest: "verification",
      schedule: "{}",
      execution: "{}",
      authorization_id: authorization,
      config_digest: "verification",
    });
    await database.query(
      "UPDATE travel.tasks SET current_config_version=1,status='ACTIVE' WHERE id=$1",
      [task],
    );
    return task;
  }
  const version = (
    await database.query(
      "SELECT COALESCE(max(version),0)+1 AS next FROM travel.runtime_policies",
    )
  ).rows[0].next;
  const policy = await insert("runtime_policies", {
    version,
    policy: "{}",
    effective_at: new Date(),
    created_by: seed.owner_user_id,
  });
  const attempts = [];
  for (const [mode, expires, revoked, generation, attemptStatus, runStatus] of [
    ["docker", 1, false, 1, "RUNNING", "RUNNING"],
    ["docker", -1, false, 1, "RUNNING", "RUNNING"],
    ["docker", 1, true, 1, "RUNNING", "RUNNING"],
    ["docker", 1, false, 2, "RUNNING", "RUNNING"],
    ["docker", 1, false, 1, "LOST", "RUNNING"],
    ["docker", 1, false, 1, "RUNNING", "SUCCEEDED"],
    [null, 1, false, 1, "RUNNING", "RUNNING"],
    ["qemu_kvm", 1, false, 1, "RUNNING", "STOPPING"],
  ]) {
    const task = await createTask();
    const run = await insert("runs", {
      ...owner,
      task_id: task,
      config_version: 1,
      script_version_id: seed.id,
      action: "process",
      original_input_ref: payload,
      schema_digest: "verification",
      trigger_kind: "manual",
      trigger_key: randomUUID(),
      run_mode: "continuous",
      status: runStatus,
      created_at: new Date("2020-01-01"),
    });
    await insert("continuations", {
      ...owner,
      run_id: run,
      number: 0,
      script_version_id: seed.id,
      action: "process",
      input_ref: payload,
      schema_digest: "verification",
      authorization_id: authorization,
      credential_snapshot: "{}",
    });
    const attempt = await insert("attempts", {
      ...owner,
      run_id: run,
      attempt_no: 1,
      continuation_number: 0,
      node_id: nodeId,
      lease_generation: 1,
      requested_execution_mode: "docker",
      actual_execution_mode: mode,
      runtime_policy_id: policy,
      status: attemptStatus,
    });
    attempts.push(attempt);
    await insert("execution_leases", {
      ...owner,
      run_id: run,
      attempt_id: attempt,
      generation,
      expires_at: new Date(Date.now() + expires * 86400000),
      revoked_at: revoked ? new Date() : null,
      last_heartbeat_at: new Date(),
    });
  }
  await insert("runs", {
    ...owner,
    task_id: await createTask(),
    config_version: 1,
    script_version_id: seed.id,
    action: "process",
    original_input_ref: payload,
    schema_digest: "verification",
    trigger_kind: "manual",
    trigger_key: randomUUID(),
    run_mode: "finite",
    status: "QUEUED",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[0],
    node_id: nodeId,
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "PENDING",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[1],
    node_id: nodeId,
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "FAILED",
  });
  await insert("environment_leases", {
    ...owner,
    attempt_id: attempts[2],
    node_id: otherNodes[0],
    environment_id: randomUUID(),
    workspace_key: "private-workspace-marker",
    stopped_at: new Date(),
    cleanup_status: "FAILED",
  });
  return { nodeId, otherNodes, imageIds };
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
  const fixture = await fixtures(database);
  for (const endpoint of [
    "/admin/nodes",
    "/admin/nodes?view=metadata",
    `/admin/nodes/${fixture.nodeId}`,
    "/admin/images",
    "/admin/scheduling",
    "/admin/scheduling/quotas",
  ]) {
    expect((await guest.get("/api/v1" + endpoint)).status()).toBe(401);
    expect((await consumer.get("/api/v1" + endpoint)).status()).toBe(403);
  }
  const consumerId = (
    await database.query(
      "SELECT id FROM travel.users WHERE email_normalized='consumer@example.invalid'",
    )
  ).rows[0].id;
  await database.query(
    `INSERT INTO travel.management_role_grants(id,owner_user_id,capabilities,reason) VALUES($1,$2,ARRAY['runtime.observe'],'Runtime metadata verification')`,
    [randomUUID(), consumerId],
  );
  expect((await consumer.get("/api/v1/admin/scheduling")).status()).toBe(403);
  await database.query(
    "UPDATE travel.management_role_grants SET capabilities=ARRAY['runtime.manage'] WHERE owner_user_id=$1",
    [consumerId],
  );
  expect((await consumer.get("/api/v1/admin/scheduling")).status()).toBe(200);
  report.checks.push(
    "node, image and scheduling HTTP routes enforce authenticated runtime.manage access independently of runtime.observe",
  );
  async function get(endpoint, status = 200, actor = admin) {
    const response = await actor.get("/api/v1" + endpoint);
    expect(response.status(), endpoint).toBe(status);
    if (status === 200)
      expect(response.headers()["cache-control"]).toBe("no-store");
    return response.json();
  }
  const legacy = (await get("/admin/nodes")).data;
  assert.equal(legacy.length, 5);
  assert.equal(
    legacy.find((node) => node.id === fixture.nodeId).capabilities.private_data,
    "raw-capability-marker",
  );
  assert.deepEqual(
    Object.keys(legacy[0]).sort(),
    ["id", "name", "status", "capabilities", "last_heartbeat_at"].sort(),
  );
  const nodes = (await get("/admin/nodes?view=metadata")).data;
  assert.equal(nodes.length, 5);
  const node = nodes.find((item) => item.id === fixture.nodeId);
  assert.equal(node.cpu_cores, "8");
  assert.equal(node.memory_mib, "32768");
  assert.equal(node.active_leases, "3");
  assert.equal(node.expired_unrevoked_leases, "1");
  assert.equal(node.cleanup_pending, "1");
  assert.equal(node.cleanup_failed, "1");
  assert.equal(node.isolation_epoch, "9007199254740993");
  assert.equal(node.clock_offset_ms, "-9007199254740993");
  const registering = nodes.find((item) => item.status === "REGISTERING"),
    offline = nodes.find((item) => item.status === "OFFLINE");
  assert.equal(registering.cpu_cores, "0");
  assert.equal(registering.memory_mib, "0");
  assert.equal(offline.cpu_cores, null);
  assert.equal(offline.memory_mib, null);
  assert.deepEqual(
    (await get(`/admin/nodes/${fixture.nodeId.toUpperCase()}`)).data,
    node,
  );
  for (const marker of [
    "certificate_fingerprint",
    "raw-capability-marker",
    "private-workspace-marker",
    "workspace_key",
  ])
    assert.equal(JSON.stringify(nodes).includes(marker), false);
  report.checks.push(
    "legacy node reads retain their response fields while paged metadata preserves five states, zero and BIGINT hardware values and excludes fingerprints, private capabilities and workspace identifiers",
  );
  const snapshot = (await get("/admin/scheduling")).data;
  assert.equal(snapshot.counts.queued_runs, "1");
  assert.equal(snapshot.counts.active_runs, "7");
  assert.equal(snapshot.counts.unreported_mode_leases, "1");
  assert.equal(
    snapshot.modes.find((mode) => mode.mode === "docker").active_leases,
    "1",
  );
  assert.equal(
    snapshot.modes.find((mode) => mode.mode === "docker")
      .expired_unrevoked_leases,
    "1",
  );
  assert.equal(
    snapshot.modes.find((mode) => mode.mode === "qemu_kvm").active_leases,
    "1",
  );
  report.checks.push(
    "scheduling snapshots retain old continuous runs and count only current-generation, unrevoked, unexpired execution leases with live attempts and runs, preserving unreported actual modes separately",
  );
  const images = (await get("/admin/images")).data;
  assert.equal(images.length, 5);
  assert.ok(images.some((image) => image.status === "REVOKED"));
  assert.equal(
    images.find((image) => image.status === "DRAFT").has_evidence,
    true,
  );
  assert.equal(JSON.stringify(images).includes("raw-image-evidence"), false);
  const quotas = (await get("/admin/scheduling/quotas")).data;
  assert.equal(quotas.length, 2);
  assert.equal(
    quotas.find((quota) => quota.scope === "GLOBAL").available_amount,
    "9223372036854775777",
  );
  assert.equal(
    quotas.find((quota) => quota.scope === "NODE").available_amount,
    "90",
  );
  report.checks.push(
    "image metadata keeps stored state distinct from evidence presence and capacity quotas retain each GLOBAL or NODE resource's latest started window and exact decimal-string quantities",
  );
  for (const endpoint of [
    "/admin/nodes?limit=2",
    "/admin/nodes?view=other",
    "/admin/nodes?view=metadata&status=DISABLED",
    "/admin/nodes?view=metadata&q=a&q=b",
    "/admin/images?mode=invalid",
    "/admin/images?status=VERIFIED",
    "/admin/scheduling?owner=x",
    "/admin/scheduling/quotas?status=ACTIVE",
    "/admin/nodes/invalid",
  ])
    await get(endpoint, 422);
  await get(`/admin/nodes/${randomUUID()}`, 404);
  const first = await get("/admin/nodes?view=metadata&limit=1");
  assert.notEqual(
    first.data[0].id,
    (
      await get(
        "/admin/nodes?view=metadata&limit=1&cursor=" +
          encodeURIComponent(first.next_cursor),
      )
    ).data[0].id,
  );
  await get(
    "/admin/nodes?view=metadata&limit=2&cursor=" +
      encodeURIComponent(first.next_cursor),
    422,
  );
  await get(
    "/admin/nodes?view=metadata&limit=1&cursor=" +
      encodeURIComponent(first.next_cursor),
    422,
    consumer,
  );
  await get(
    "/admin/images?limit=1&cursor=" + encodeURIComponent(first.next_cursor),
    422,
  );
  const imageFirst = await get("/admin/images?limit=1");
  await get(
    "/admin/images?limit=1&mode=qemu_tcg&cursor=" +
      encodeURIComponent(imageFirst.next_cursor),
    422,
  );
  report.checks.push(
    "runtime metadata rejects unsupported queries, malformed references and cursor changes across actors, filters, page sizes and resources",
  );
  connection = await pool.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL search_path=travel,public");
  const pgFixture = await fixtures(connection);
  const adapter = {
    root: database.root,
    query: (sql, values) => connection.query(sql, values),
  };
  const metadata = new AdminMetadataService(
    adapter,
    new PaginationService(adapter),
  );
  const actor = {
    id: consumerId,
    roles: ["ADMIN"],
    capabilities: ["runtime.manage"],
    security_revision: "1",
  };
  assert.equal(
    (await metadata.node(actor, pgFixture.nodeId, {})).active_leases,
    "3",
  );
  assert.equal(
    (await metadata.images(actor, { q: pgFixture.imageIds[0] })).items[0]
      .status,
    "DRAFT",
  );
  assert.equal(
    (await metadata.capacityQuotas(actor, { q: pgFixture.nodeId })).items[0]
      .available_amount,
    "90",
  );
  assert.ok((await metadata.scheduling(actor, {})).as_of);
  await connection.query("ROLLBACK");
  assert.equal(
    (
      await connection.query("SELECT id FROM travel.nodes WHERE id=$1", [
        pgFixture.nodeId,
      ])
    ).rows.length,
    0,
  );
  connection.release();
  connection = undefined;
  report.checks.push(
    "PostgreSQL 18 verifies node details, exact lease counts, image metadata, scoped quotas and scheduling snapshots with complete fixture rollback",
  );
  await database.query(`INSERT INTO travel.nodes(id,name,certificate_fingerprint,created_at)
    SELECT gen_random_uuid(),'分页节点'||i::text,gen_random_uuid()::text,'2020-01-01 00:00:00.123456+00' FROM generate_series(1,23) i`);
  await database.query(`INSERT INTO travel.runtime_images(id,name,digest,language,version,modes,evidence,created_at)
    SELECT gen_random_uuid(),'分页镜像'||i::text,gen_random_uuid()::text,'node','1.0',ARRAY['docker'],'{}','2020-01-01' FROM generate_series(1,23) i`);
  const distantNode = (
    await database.query(
      "SELECT id,name FROM travel.nodes ORDER BY created_at,id LIMIT 1",
    )
  ).rows[0];
  const distantImage = (
    await database.query(
      "SELECT id,name FROM travel.runtime_images ORDER BY created_at,id LIMIT 1",
    )
  ).rows[0];
  const businessSnapshot = async () =>
    (
      await database.query(`SELECT jsonb_build_object(
    'nodes',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM travel.nodes n),
    'images',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM travel.runtime_images i),
    'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM travel.execution_leases l),
    'quotas',(SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM travel.quota_accounts q)
  ) AS state`)
    ).rows[0].state;
  const before = await businessSnapshot();
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
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await ui.request.post(web + "/api/v1/auth/login", {
    data: { email: "admin@example.invalid", password: "TravelTools2026!" },
  });
  page = await ui.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  async function capture(id, width = 1814) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, id + ".png"),
      fullPage: true,
    });
    report.screenshots.push(id);
    const bounds = await page.evaluate(() => ({
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
    assert.equal(bounds.width, width);
    if (width === 1814 && !id.endsWith("-live"))
      assert.equal(bounds.height, 868);
    if (width === 390) {
      assert.equal(bounds.left, 16);
      assert.equal(bounds.contentWidth, 358);
      assert.ok(bounds.actionsRight <= 390);
    }
    report.layouts[id] = bounds;
  }
  await page.goto(web + "/admin/scheduling");
  await expect(page.locator(".capacity-bars")).toContainText("48 / 64");
  await capture("ADMIN-O13");
  await page.goto(web + "/admin/infrastructure");
  await expect(
    page.locator("#infrastructure-nodes .ant-table-row"),
  ).toHaveCount(3);
  await capture("ADMIN-O14");
  await page.getByRole("button", { name: "镜像", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "镜像", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "docker01", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("docker01");
  await expect(
    page.getByRole("button", { name: "受控清理", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "关闭节点详情", exact: true }).click();
  await page
    .locator("#infrastructure-images .ant-table-row")
    .first()
    .getByRole("button", { name: "镜像验证", exact: true })
    .click();
  await page.getByRole("button", { name: "复制摘要", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^sha256:[0-9a-f]{64}$/);
  await page.getByRole("button", { name: "关闭镜像详情", exact: true }).click();
  await page.goto(web + "/admin/infrastructure?node=missing");
  await expect(page.getByRole("dialog")).toContainText(
    "所选节点不存在或暂不可用",
  );
  await expect(
    page.getByRole("button", { name: "受控清理", exact: true }),
  ).toBeDisabled();
  await page.goto(web + "/admin/infrastructure?image=missing");
  await expect(page.getByRole("dialog")).toContainText(
    "所选镜像不存在或暂不可用",
  );
  report.checks.push(
    "prototype infrastructure retains section and selected record in the URL, reloads the same node, copies an explicit complete local example digest and keeps missing resources unavailable",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, route] of [
    ["ADMIN-O13-mobile", "/admin/scheduling"],
    ["ADMIN-O14-mobile", "/admin/infrastructure"],
  ]) {
    await page.goto(web + route);
    await expect(page.locator(".admin-page .panel").first()).toBeVisible();
    if (id === "ADMIN-O13-mobile") {
      const health = await page
        .locator(".runtime-lease-health .ant-table-row")
        .first()
        .locator("td")
        .last()
        .boundingBox();
      assert.ok(health.x + health.width <= 390);
    }
    await capture(id, 390);
  }
  await page.setViewportSize({ width: 1814, height: 868 });
  report.checks.push(
    "capacity and infrastructure layouts fit the desktop viewport and retain full-width content and internal table scrolling on 390px screens",
  );
  await ui.route("**/api/v1/bootstrap", async (route) => {
    const body = await (await route.fetch()).json();
    body.data.data_mode = "live";
    await route.fulfill({ json: body });
  });
  let failNodes = true;
  await ui.route("**/api/v1/admin/nodes?**", async (route) => {
    if (failNodes)
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "验证节点暂不可用" } },
      });
    else await route.continue();
  });
  await page.goto(web + "/admin/infrastructure");
  await expect(
    page.getByText("节点数据加载失败", { exact: true }),
  ).toBeVisible();
  failNodes = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.locator("#infrastructure-nodes .ant-table-row"),
  ).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多节点", exact: true }).click();
  await expect(
    page.locator("#infrastructure-nodes .ant-table-row"),
  ).toHaveCount(28);
  await page
    .getByRole("searchbox", { name: "搜索节点", exact: true })
    .fill("runtime-node");
  await page
    .getByRole("searchbox", { name: "搜索节点", exact: true })
    .press("Enter");
  await expect(
    page.locator("#infrastructure-nodes .ant-table-row"),
  ).toHaveCount(1);
  await expect(page.locator("#infrastructure-nodes")).toContainText(
    "32768 MiB",
  );
  await expect(page.locator("#infrastructure-nodes")).toContainText("3 个");
  await page
    .getByRole("button", { name: "runtime-node-%_", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("-9007199254740993");
  await expect(page.getByRole("dialog")).toContainText("9007199254740993");
  await page.getByRole("button", { name: "关闭节点详情", exact: true }).click();
  await page.goto(
    web + "/admin/infrastructure?node=" + distantNode.id.toUpperCase(),
  );
  await expect(page.getByRole("dialog")).toContainText(distantNode.name);
  await page.getByRole("button", { name: "关闭节点详情", exact: true }).click();
  await page.goto(
    web + "/admin/infrastructure?image=" + distantImage.id.toUpperCase(),
  );
  await expect(page.getByRole("dialog")).toContainText(distantImage.name);
  await expect(page.getByRole("dialog")).toContainText("DRAFT");
  await expect(
    page.getByRole("button", { name: "发起验证", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "关闭镜像详情", exact: true }).click();
  await capture("ADMIN-O14-live");
  report.checks.push(
    "LIVE infrastructure recovers from node failures, paginates real records, searches by URL and opens node or image IDs outside the loaded page while preserving exact reported quantities and pending operations",
  );
  await page.goto(web + "/admin/scheduling");
  await expect(page.locator(".resource-queue-stats strong").first()).toHaveText(
    "1",
  );
  await expect(page.locator(".resource-queue-stats strong").nth(1)).toHaveText(
    "7",
  );
  await expect(page.locator(".runtime-capacity-quotas")).toContainText(
    "9223372036854775777",
  );
  await expect(
    page.getByRole("button", { name: "设置限流", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".resource-mode-tags")).not.toContainText("允许");
  await expect(page.locator(".runtime-snapshot-time")).toContainText(
    "查询快照",
  );
  await page.getByRole("button", { name: "刷新快照", exact: true }).click();
  await capture("ADMIN-O13-live");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/admin/scheduling", "/admin/infrastructure"]) {
    await page.goto(web + route);
    await expect(
      page.getByRole("heading", {
        name: route.endsWith("scheduling") ? "调度与容量" : "节点与镜像",
        exact: true,
      }),
    ).toBeVisible();
    const bounds = await page.locator(".admin-page").boundingBox();
    assert.equal(bounds.x, 16);
    assert.equal(bounds.width, 358);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
  }

  assert.deepEqual(await businessSnapshot(), before);
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "LIVE scheduling reads current database counters and per-resource quotas, retains unknown capacity collection and control states and issues no runtime business mutations",
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
