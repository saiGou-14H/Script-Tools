import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PGlite } from "@electric-sql/pglite";
import { Pool, PoolClient } from "pg";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export type DatabaseRow = Record<string, unknown>;
export type QueryResult<T> = { rows: T[] };
export interface SqlConnection {
  query<T extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService
  implements OnModuleInit, OnModuleDestroy, SqlConnection
{
  private embedded?: PGlite;
  private pool?: Pool;
  readonly root = path.resolve(__dirname, "../../../..");
  readonly mode = process.env.DATABASE_URL ? "postgresql" : "pglite";

  async onModuleInit() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        options: "-c search_path=travel,public",
      });
    } else {
      const directory = path.resolve(
        this.root,
        process.env.LOCAL_DATA_DIRECTORY || ".local/database",
      );
      await mkdir(directory, { recursive: true });
      this.embedded = new PGlite(directory);
      await this.embedded.waitReady;
      await this.embedded.query("SET search_path=travel,public");
    }
    await this.query("CREATE SCHEMA IF NOT EXISTS framework");
    await this.query(`CREATE TABLE IF NOT EXISTS framework.schema_migrations (
      version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const sql = await readFile(
      path.join(this.root, "packages/persistence/migrations/001_initial.sql"),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql.trimEnd()).digest("hex");
    const existing = await this.query(
      "SELECT checksum FROM framework.schema_migrations WHERE version=1",
    );
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error(
          "Migration checksum changed. Create an incremental migration.",
        );
      return;
    }
    const migrationRecord =
      "INSERT INTO framework.schema_migrations(version,checksum) VALUES(1,$1)";
    if (this.embedded) {
      await this.embedded.transaction(async (connection) => {
        await connection.exec(sql);
        await connection.query(migrationRecord, [checksum]);
      });
    } else {
      await this.transaction(async (connection) => {
        await connection.query(sql);
        await connection.query(migrationRecord, [checksum]);
      });
    }
  }

  async query<T extends DatabaseRow = DatabaseRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (this.embedded) return this.embedded.query<T>(text, values);
    return this.pool!.query(text, values);
  }

  async transaction<T>(
    work: (connection: SqlConnection) => Promise<T>,
  ): Promise<T> {
    if (this.embedded) {
      return this.embedded.transaction((connection) => work(connection));
    }
    const client: PoolClient = await this.pool!.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.embedded?.close();
    await this.pool?.end();
  }
}
