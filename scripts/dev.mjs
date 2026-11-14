import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env"))) loadEnvFile(path.join(root, ".env"));
const children = [];
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
const executable = path.join(root, "node_modules/typescript/bin/tsc");
async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
await run(process.execPath, ["scripts/prepare-contracts.mjs"]);
const env = { ...process.env, DEV_SEED: process.env.DEV_SEED ?? "true" };
const compiler = spawn(
  process.execPath,
  [
    executable,
    "-p",
    "apps/control-api/tsconfig.json",
    "--watch",
    "--preserveWatchOutput",
    "--incremental",
    "--noEmitOnError",
  ],
  { cwd: root, stdio: ["inherit", "pipe", "inherit"], env },
);
children.push(compiler);
await new Promise((resolve, reject) => {
  let compilerOutput = "";
  compiler.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    compilerOutput = (compilerOutput + chunk.toString()).slice(-4096);
    if (/Found 0 errors\. Watching for file changes\./.test(compilerOutput))
      resolve();
  });
  compiler.once("error", reject);
  compiler.once("exit", (code) =>
    reject(
      new Error(`TypeScript watch exited ${code} before the API was ready`),
    ),
  );
});
children.push(
  spawn(
    process.execPath,
    [
      "--watch",
      ...(process.platform === "win32"
        ? ["--watch-path=apps/control-api/dist"]
        : []),
      "apps/control-api/dist/main.js",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env,
    },
  ),
);
let apiReady = false;
const readyDeadline = Date.now() + 30000;
while (Date.now() < readyDeadline) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${env.API_PORT || 3001}/api/v1/health`,
      { signal: AbortSignal.timeout(1500) },
    );
    apiReady = response.ok;
    if (apiReady) break;
  } catch {
    /* The API may still be applying its initial migration. */
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!apiReady) {
  stop();
  throw new Error(
    "API did not become healthy within 30 seconds. Check its startup output and database connection.",
  );
}
children.push(
  spawn(
    process.execPath,
    [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
    { cwd: path.join(root, "apps/web"), stdio: "inherit", env },
  ),
);
function stop() {
  for (const child of children) child.kill();
}
