import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { rm } from "node:fs/promises";
import path from "node:path";

export async function startVerificationApp(name) {
  const localRoot = path.resolve(".local");
  const directory = path.join(localRoot, name + "-" + randomUUID());
  assert.equal(path.dirname(directory), localRoot);
  const keys = [
    "DATABASE_URL",
    "LOCAL_DATA_DIRECTORY",
    "DEV_SEED",
    "NODE_ENV",
    "WEB_ORIGIN",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  delete process.env.DATABASE_URL;
  process.env.LOCAL_DATA_DIRECTORY = directory;
  process.env.DEV_SEED = "true";
  process.env.NODE_ENV = "development";
  const require = createRequire(import.meta.url);
  const { NestFactory } = require("@nestjs/core");
  const cookieParser = require("cookie-parser");
  const { AppModule } = require("../apps/control-api/dist/app.module.js");
  const {
    EnvelopeInterceptor,
    HttpErrorFilter,
  } = require("../apps/control-api/dist/common/http.js");
  let app;
  async function close() {
    await app?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assert.equal(path.dirname(path.resolve(directory)), localRoot);
    await rm(directory, { recursive: true, force: true });
  }
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useBodyParser("json", { limit: "2mb" });
    app.use(cookieParser());
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new HttpErrorFilter());
    await app.listen(0, "127.0.0.1");
    return { url: await app.getUrl(), close };
  } catch (error) {
    await close();
    throw error;
  }
}
