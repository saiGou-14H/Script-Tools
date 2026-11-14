import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseDesign = await readFile(
  path.join(root, "docs/07-完整系统数据库设计.md"),
  "utf8",
);
const sqlBlocks = [
  ...databaseDesign
    .replaceAll("\r\n", "\n")
    .matchAll(/```sql\n([\s\S]*?)\n```/g),
].map((match) => match[1]);
if (sqlBlocks.length !== 15)
  throw new Error("Database design must contain 15 migration blocks");
const sql = sqlBlocks.join("\n\n");
await mkdir(path.join(root, "packages/persistence/migrations"), {
  recursive: true,
});
await writeFile(
  path.join(root, "packages/persistence/migrations/001_initial.sql"),
  sql.trimEnd() + "\n",
);
const catalog = await readFile(
  path.join(root, "docs/contracts/ui-role-catalog.json"),
  "utf8",
);
await writeFile(
  path.join(root, "packages/contracts/ui-role-catalog.json"),
  catalog,
);
await mkdir(path.join(root, "apps/web/src/generated"), { recursive: true });
await writeFile(
  path.join(root, "apps/web/src/generated/catalog.json"),
  catalog,
);
await writeFile(
  path.join(root, "apps/web/src/generated/manifest-schema.json"),
  await readFile(
    path.join(root, "docs/contracts/manifest.schema.json"),
    "utf8",
  ),
);
await writeFile(
  path.join(root, "packages/persistence/migrations/manifest.json"),
  JSON.stringify(
    {
      version: 1,
      source: "docs/07-完整系统数据库设计.md",
      sha256: createHash("sha256").update(sql).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Prepared UI contracts and the database migration from the authoritative design.",
);
