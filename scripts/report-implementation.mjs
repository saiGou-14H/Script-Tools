import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const catalog = JSON.parse(
  await readFile(
    path.join(root, "docs/contracts/ui-role-catalog.json"),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    path.join(root, "output/prototypes/2026-11-13-v5-commercial/manifest.json"),
    "utf8",
  ),
);
const router = await readFile(
  path.join(root, "apps/web/src/router.tsx"),
  "utf8",
);
const pageMap = router.match(/const implementedPages[^=]*= \{([\s\S]*?)\n\};/);
if (!pageMap) throw new Error("Implemented page map was not found");
const components = [...pageMap[1].matchAll(/^\s+([A-Z]\d\d):/gm)].map(
  (match) => match[1],
);
const browserReports = [
  "output/verification/frontend-foundation/report.json",
  "output/verification/consumer-pages/report.json",
  "output/verification/personal-pages/report.json",
  "output/verification/publisher-pages/report.json",
  "output/verification/shared-pages/report.json",
  "output/verification/publisher-commerce/report.json",
  "output/verification/admin-commerce/report.json",
  "output/verification/admin-operations/report.json",
  "output/verification/admin-travel/report.json",
  "output/verification/identity/report.json",
  "output/verification/production-build.json",
  "output/verification/retail-pages/report.json",
  "output/verification/consumer-overview/report.json",
  "output/verification/publisher-profile/report.json",
  "output/verification/output-pages/report.json",
  "output/verification/account-pages/report.json",
  "output/verification/notification-pages/report.json",
  "output/verification/personal-data-pages/report.json",
  "output/verification/consumer-finance-pages/report.json",
  "output/verification/consumer-purchase-pages/report.json",
  "output/verification/execution-pages/report.json",
];
const screenshots = new Set();
const browserResults = [];
for (const reportPath of browserReports) {
  const report = JSON.parse(
    await readFile(path.join(root, reportPath), "utf8"),
  );
  for (const id of report.screenshots) screenshots.add(id);
  browserResults.push({
    report: reportPath,
    result: report.result,
    checks: report.checks.length,
  });
}
const health = await fetch("http://127.0.0.1:3001/api/v1/health").then(
  (response) => response.json(),
);
const postgres = JSON.parse(
  await readFile(
    path.join(root, "output/verification/postgresql-foundation.json"),
    "utf8",
  ),
);
const items = Object.values(manifest.items).map((item) => ({
  role: item.role,
  page_id: item.page_id,
  title: item.page_name,
  reference: `output/prototypes/2026-11-13-v5-commercial/${item.file}`,
  component_present: components.includes(item.page_id),
  screenshot_present: screenshots.has(`${item.role}-${item.page_id}`),
  visual_acceptance: "pending",
}));
const report = {
  project_name: "Script Tools",
  updated_at: new Date().toISOString(),
  goal_status: "active",
  target: {
    page_definitions: Object.keys(catalog.pages).length,
    role_page_deliverables: items.length,
  },
  page_components: components,
  pending_page_definitions: Object.keys(catalog.pages).filter(
    (id) => !components.includes(id),
  ),
  visual_acceptance_count: 0,
  browser_reports: browserReports,
  browser_results: browserResults,
  local_preview: "http://127.0.0.1:5174/",
  api_docs: "http://127.0.0.1:3001/api/docs",
  database: {
    mode: health.data.database,
    tables: health.data.tables,
    development_server_version: postgres.server_version,
    development_postgresql_verified: postgres.result === "PASS",
    verification: "output/verification/postgresql-foundation.json",
    production_postgresql_verified: false,
  },
  implementation_notes: [
    "All catalog page definitions have initial components. Individual fidelity acceptance and complete interaction coverage remain in progress.",
    "Prototype financial, task and output records are local visual fixtures. Live payments, execution, notifications and artifact storage are pending.",
    "Service catalog and session authentication use the local database. RJSF validation is verified for the example schema only.",
    "All 75 role-page deliverables still require individual fidelity acceptance.",
    "The public home and authentication page have been realigned with their reference regions. The user confirmed email/password authentication from the detailed design on 2026-11-14.",
    "Registration, email verification and password reset are integrated with PostgreSQL in development preview mode. Verification delivery currently uses explicit development tokens.",
    "The market, general service detail and travel service detail now use separate guest and consumer layouts. Catalog facts and parameter examples come from the published service contract. The consumer eight-card layout uses a browser-only fixture because the development database currently contains four services.",
    "The consumer home and checkout are aligned with their reference regions. The live personal overview reads owner-scoped metadata in one database snapshot. Current-state counters retain old continuous runs, and committed outputs can be visible before process completion. Preview records are explicitly labeled and shared across their related pages.",
    "Publisher onboarding and profile settings use the owner-scoped API with explicit terms consent, encrypted idempotency receipts, revision checks, audit and outbox writes. An isolated API and production-built UI verify the complete onboarding route. The publisher home fits the reference viewport and labels its development examples. Live publisher business overviews and payouts remain pending.",
    "The output and pending pages have been realigned with the reference regions. Output links and toolbar actions use the selected record, and JSON/text/file previews preserve their own MIME types. Live output metadata uses owner-scoped committed-batch queries with signed pagination. Content storage, downloads, notification delivery and pending-action execution remain in progress.",
    "Account settings now have distinct consumer, publisher and administrator layouts. Identity, nickname edits and session management use owner-scoped APIs, generic encrypted command receipts and revision checks. Security revisions use decimal strings. Account closure, email changes and subscription disconnection remain pending.",
    "The message center and notification settings have been realigned with their reference regions, including the fixed footer and unobscured Webhook card. Message category and unread filters persist in the URL, and preview read state drives the list, total and header badge together. Preview links use their existing output, order, refund and pending-verification records. Notification services, channel binding and subscription persistence remain pending. Live mode exposes that integration state and disables local-only saves.",
    "Credential and traveler pages have been realigned with their reference regions and Ctrl K search. Preview credential rotation preserves existing task-version bindings, and binding links open their corresponding tasks. Short values stay masked. Traveler edits retain document types and advance the preview version, and deleting the edited record resets its form. Live credential storage, validation, traveler versions and authorization snapshots remain pending.",
    "Billing, refund and booking pages have been realigned with their reference regions. Billing summaries and CSV use decimal-string minor units and share refund records with the refund pages, resolving the conflicting reference fixtures to 3.00 refunded and 8.00 processing. Refund details link to the matching bill, preserve supplementary text, and read stored rule and execution snapshots. Repeated preview submissions reuse the same request. Pending bookings retain verification state and have no usable voucher. Live billing, refunds and official booking verification remain pending.",
    "Order list, order detail, purchased services and configuration have been realigned with their reference regions. Order filters persist in the URL. Entitlement actions retain their own order and task references, and refund entry carries the original order while its policy is loaded. Cashier demo selects the existing unpaid order. New preview orders retain a service contract snapshot and decimal-string amounts. Configuration checks the selected entitlement and purchased version, uses publisher-required JSON Schema fields, and validates and previews the chosen execution time. Live order, entitlement, scheduling and execution services remain pending.",
    "Task list, task detail, run list and run detail have been realigned with their reference regions. Task scope, applied run filters and detail tabs persist in the URL. Task details expose their own configuration snapshot, run history and order references. The active booking example retains the existing two-hour paid service window and consistent task dates. Its execution, business goal, two ready output batches and notification delivery retain independent states. Output links, preview file downloads and redacted log exports use the selected run. Pause and stop actions expose pending integration. Live task scheduling, execution, termination and notification delivery remain pending.",
  ],
  items,
};
await writeFile(
  path.join(root, "output/verification/frontend-implementation-progress.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${components.length}/${report.target.page_definitions} page components started; ${report.pending_page_definitions.length} pending; 0/${items.length} final fidelity acceptances.`,
);
