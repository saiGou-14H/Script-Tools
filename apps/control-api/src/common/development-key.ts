import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadDevelopmentKey(root: string) {
  const directory = path.join(root, ".local");
  const filename = path.join(directory, "auth-development.key");
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(filename, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = await readFile(filename);
  if (key.length !== 32)
    throw new Error("Local authentication payload key is invalid");
  return key;
}
