import assert from "node:assert/strict";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = path.resolve("apps/web");
const server = await preview({
  root,
  configFile: path.join(root, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001" } },
  },
});
const address = server.httpServer.address();
assert.ok(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
async function contextFor(email) {
  const context = await browser.newContext({
    viewport: { width: 1814, height: 868 },
  });
  if (email) {
    const response = await context.request.post(
      "http://127.0.0.1:3001/api/v1/auth/login",
      { data: { email, password: "TravelTools2026!" } },
    );
    expect(response.status()).toBe(200);
  }
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    report.errors.push(error.stack || error.message),
  );
  return { context, page };
}
try {
  const guest = await contextFor();
  for (const [route, heading] of [
    ["/", "把重复工作交给脚本"],
    ["/market", "脚本市场"],
    ["/services/demo", "脚本服务详情"],
    ["/travel/attractions/demo", "景点代抢服务详情"],
    ["/auth", "登录与注册"],
  ]) {
    await guest.page.goto(base + route);
    await expect(
      guest.page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  report.checks.push(
    "minified production entry, icon and public-page chunks load through the built application",
  );
  await guest.context.close();
  const consumer = await contextFor("consumer@example.invalid");
  await consumer.page.goto(base + "/me/home");
  await expect(
    consumer.page.getByRole("heading", { name: "欢迎回来！", exact: true }),
  ).toBeVisible();
  const downloadPromise = consumer.page.waitForEvent("download");
  await consumer.page
    .locator(".home-results-panel")
    .getByRole("button", { name: "下载", exact: true })
    .first()
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe("cleaned.csv");
  for (const [route, heading] of [
    ["/services/demo", "脚本服务详情"],
    ["/travel/attractions/demo", "景点代抢服务详情"],
  ]) {
    await consumer.page.goto(base + route);
    await expect(
      consumer.page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      consumer.page.locator(".service-purchase-button"),
    ).toBeEnabled();
  }
  report.checks.push(
    "production consumer home downloads its existing preview file, and general and travel service detail chunks load in both public and consumer workspaces with enabled local-preview purchase entry points",
  );
  await consumer.page.goto(base + "/me/services/demo/use");
  await expect(consumer.page.locator("form.rjsf")).toBeVisible();
  await expect(
    consumer.page.getByRole("button", { name: "上传文件", exact: true }),
  ).toBeVisible();
  await consumer.page.locator(".upload-widget input[type=file]").setInputFiles({
    name: "input.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,value\nexample,1\n"),
  });
  await expect(
    consumer.page.locator(".upload-widget .ant-upload-list"),
  ).toContainText("input.csv");
  await consumer.page
    .getByRole("radio", { name: "指定时间", exact: true })
    .check();
  await expect(
    consumer.page.locator(".upload-widget .ant-upload-list"),
  ).toContainText("input.csv");
  report.checks.push(
    "production route splitting loads the consumer configuration page and RJSF schema form",
  );
  await consumer.context.close();
  const admin = await contextFor("admin@example.invalid");
  await admin.page.goto(base + "/admin/observability");
  await expect(
    admin.page.getByRole("heading", { name: "日志与告警", exact: true }),
  ).toBeVisible();
  await expect(admin.page.locator(".admin-log-panel tbody tr")).toHaveCount(5);
  report.checks.push(
    "production administrator chunks load the authorized observation tables",
  );
  await admin.context.close();
  const assets = path.join(root, "dist/assets");
  const sizes = await Promise.all(
    (await readdir(assets))
      .filter((file) => file.endsWith(".js"))
      .map(async (file) => ({
        file,
        bytes: (await stat(path.join(assets, file))).size,
      })),
  );
  sizes.sort((a, b) => b.bytes - a.bytes);
  assert.ok(sizes[0].bytes < 500000);
  report.largest_js = sizes[0];
  report.checks.push(
    "the production build keeps every JavaScript chunk below the default 500 kB warning threshold",
  );
  assert.deepEqual(report.errors, []);
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
  await writeFile(
    "output/verification/production-build.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
