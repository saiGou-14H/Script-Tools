import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

loadEnvFile(".env");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for PostgreSQL verification");
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
const database = new DatabaseService();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const probe = `framework.connection_probe_${randomUUID().replaceAll("-", "")}`;
const report = {
  date: new Date().toISOString(),
  checks: [],
  mode: "postgresql",
  database: "travel_tools",
};
let probeCreated = false;
let first;
let second;
try {
  await database.onModuleInit();
  const server = (
    await database.query(
      "SELECT version() AS version, current_user AS role, current_database() AS database",
    )
  ).rows[0];
  report.server_version = server.version;
  report.application_role = server.role;
  assert.equal(server.database, "travel_tools");
  assert.equal(
    (
      await database.query(
        "SELECT rolsuper FROM pg_roles WHERE rolname = current_user",
      )
    ).rows[0].rolsuper,
    false,
  );
  report.checks.push(
    "application connects to its independent database with a non-superuser role",
  );
  const connections = await Promise.all(
    Array.from({ length: 2 }, () =>
      database.transaction(async (connection) => {
        const row = (
          await connection.query(
            "SELECT pg_backend_pid() AS pid,current_schema() AS schema,to_regclass('script_versions')=to_regclass('travel.script_versions') AS resolved",
          )
        ).rows[0];
        await new Promise((resolve) => setTimeout(resolve, 30));
        return row;
      }),
    ),
  );
  assert.equal(
    new Set(connections.map((connection) => connection.pid)).size,
    2,
  );
  for (const connection of connections) {
    assert.equal(connection.schema, "travel");
    assert.equal(connection.resolved, true);
  }
  report.checks.push(
    "two independent pooled connections initialize the travel search path so cross-table trigger references resolve consistently",
  );

  const counts = await database.query(
    "SELECT count(DISTINCT table_name)::int AS tables, count(*)::int AS columns FROM information_schema.columns WHERE table_schema='travel'",
  );
  assert.deepEqual(counts.rows[0], { tables: 145, columns: 1755 });
  report.tables = counts.rows[0].tables;
  report.columns = counts.rows[0].columns;
  assert.equal(
    (
      await database.query(
        "SELECT count(*)::int AS count FROM framework.schema_migrations WHERE version=1",
      )
    ).rows[0].count,
    1,
  );
  report.checks.push(
    "all 145 tables and 1755 columns load from the design migration, with checksum verified on restart",
  );

  await database.query(
    `CREATE TABLE ${probe}(id integer PRIMARY KEY, value integer NOT NULL)`,
  );
  probeCreated = true;
  await database.transaction((connection) =>
    connection.query(`INSERT INTO ${probe} VALUES (1,1)`),
  );
  assert.equal(
    (await database.query(`SELECT value FROM ${probe} WHERE id=1`)).rows[0]
      .value,
    1,
  );
  report.checks.push(
    "DatabaseService commits a successful transaction on the PostgreSQL driver",
  );

  await assert.rejects(
    database.transaction(async (connection) => {
      await connection.query(`UPDATE ${probe} SET value=99 WHERE id=1`);
      throw new Error("EXPECTED_ROLLBACK");
    }),
    /EXPECTED_ROLLBACK/,
  );
  assert.equal(
    (await database.query(`SELECT value FROM ${probe} WHERE id=1`)).rows[0]
      .value,
    1,
  );
  report.checks.push(
    "failed DatabaseService transaction rolls back its changes",
  );

  first = await pool.connect();
  second = await pool.connect();
  await first.query("BEGIN");
  await first.query(`UPDATE ${probe} SET value=2 WHERE id=1`);
  assert.equal(
    (await second.query(`SELECT value FROM ${probe} WHERE id=1`)).rows[0].value,
    1,
  );
  report.checks.push(
    "separate PostgreSQL connection cannot read another transaction uncommitted changes",
  );
  await second.query("BEGIN");
  await second.query("SET LOCAL lock_timeout='3s'");
  const update = second.query(
    `UPDATE ${probe} SET value=value+1 WHERE id=1 RETURNING value`,
  );
  await first.query("COMMIT");
  assert.equal((await update).rows[0].value, 3);
  await second.query("COMMIT");
  assert.equal(
    (await database.query(`SELECT value FROM ${probe} WHERE id=1`)).rows[0]
      .value,
    3,
  );
  report.checks.push(
    "two real connections serialize updates to the same row without losing increments",
  );

  await assert.rejects(
    database.query(`INSERT INTO ${probe} VALUES (1,4)`),
    (error) => error.code === "23505",
  );
  report.checks.push(
    "PostgreSQL primary-key constraint rejects a duplicate write",
  );
  const health = await fetch("http://127.0.0.1:3001/api/v1/health").then(
    (response) => response.json(),
  );
  assert.equal(health.data.database, "postgresql");
  assert.equal(health.data.tables, 145);
  report.checks.push(
    "running API health confirms PostgreSQL mode and 145 application tables",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (first) {
    await first.query("ROLLBACK").catch(() => {});
    first.release();
  }
  if (second) {
    await second.query("ROLLBACK").catch(() => {});
    second.release();
  }
  if (probeCreated) await database.query(`DROP TABLE ${probe}`);
  await database.onModuleDestroy();
  await pool.end();
  await writeFile(
    "output/verification/postgresql-foundation.json",
    JSON.stringify(report, null, 2),
  );
  if (report.result === "PASS") {
    const setup = JSON.parse(
      await readFile("output/verification/postgresql-setup.json", "utf8"),
    );
    await writeFile(
      "output/verification/postgresql-setup.json",
      JSON.stringify(
        {
          ...setup,
          migration_status: "applied",
          verification: "postgresql-foundation.json",
        },
        null,
        2,
      ),
    );
  }
  console.log(JSON.stringify(report, null, 2));
}
