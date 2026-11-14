import "reflect-metadata";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/control-api/dist/database/database.service.js");
process.env.LOCAL_DATA_DIRECTORY = ".local/persistence-verification";
delete process.env.DATABASE_URL;
let database = new DatabaseService();
const report = { date: new Date().toISOString(), checks: [], mode: "pglite" };
try {
  await database.onModuleInit();
  const schema = await database.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='travel'",
  );
  if (schema.rows[0].count !== 145)
    throw new Error("Initial migration did not create all design tables");
  report.checks.push("initial migration creates 145 design tables");
  await database.query(
    "CREATE TABLE IF NOT EXISTS framework.transaction_probe(id integer PRIMARY KEY)",
  );
  await database.query("DELETE FROM framework.transaction_probe");
  let entered;
  let release;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const transaction = database
    .transaction(async (connection) => {
      await connection.query(
        "INSERT INTO framework.transaction_probe(id) VALUES(1)",
      );
      entered();
      await gate;
      throw new Error("EXPECTED_ROLLBACK");
    })
    .catch((error) => {
      if (error.message !== "EXPECTED_ROLLBACK") throw error;
    });
  await ready;
  const outsideQuery = database.query(
    "SELECT count(*)::int AS count FROM framework.transaction_probe",
  );
  setTimeout(release, 50);
  await transaction;
  if ((await outsideQuery).rows[0].count !== 0)
    throw new Error("Unrelated query read uncommitted transaction data");
  report.checks.push(
    "outside query waits for rollback and cannot read uncommitted data",
  );
  await database.transaction(async (connection) => {
    await connection.query(
      "INSERT INTO framework.transaction_probe(id) VALUES(2)",
    );
  });
  if (
    (await database.query("SELECT id FROM framework.transaction_probe")).rows[0]
      .id !== 2
  )
    throw new Error("Commit failed");
  report.checks.push("successful transaction commits");
  await database.onModuleDestroy();
  database = new DatabaseService();
  await database.onModuleInit();
  const reopened = (
    await database.query(
      "SELECT current_schema() AS schema,to_regclass('script_versions')=to_regclass('travel.script_versions') AS resolved",
    )
  ).rows[0];
  if (reopened.schema !== "travel" || !reopened.resolved)
    throw new Error(
      "Reopened database did not initialize the travel search path",
    );
  report.checks.push(
    "reopening an already migrated PGlite database restores the travel search path",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await database.onModuleDestroy();
  await mkdir(path.resolve("output/verification"), { recursive: true });
  await writeFile(
    path.resolve("output/verification/persistence-foundation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
