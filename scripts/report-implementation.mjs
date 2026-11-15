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
const layoutAudit = JSON.parse(
  await readFile(
    path.join(root, "output/verification/role-layouts/report.json"),
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
  "output/verification/publisher-execution-pages/report.json",
  "output/verification/publisher-quality-pages/report.json",
  "output/verification/publisher-finance-pages/report.json",
  "output/verification/publisher-product-pages/report.json",
  "output/verification/admin-transaction-pages/report.json",
  "output/verification/admin-finance-pages/report.json",
  "output/verification/admin-catalog-pages/report.json",
  "output/verification/admin-travel-metadata/report.json",
  "output/verification/admin-runtime-pages/report.json",
  "output/verification/admin-diagnostics-pages/report.json",
  "output/verification/admin-delivery-settings/report.json",
  "output/verification/admin-governance-pages/report.json",
  "output/verification/help-pages/report.json",
  "output/verification/public-travel-pages/report.json",
  "output/verification/role-layouts/report.json",
  "output/verification/publisher-editor-pages/report.json",
  "output/verification/script-upload/report.json",
  "output/verification/schema-input-pages/report.json",
  "output/verification/publisher-records/report.json",
  "output/verification/script-version-pages/report.json",
  "output/verification/market-navigation/report.json",
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
  current_capture: `output/verification/role-layouts/${item.role}-${item.page_id}.png`,
  reference_viewport: { width: item.width, height: item.height },
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
  role_layout_audit: {
    report: "output/verification/role-layouts/report.json",
    comparison: "output/verification/role-layouts/index.html",
    result: layoutAudit.result,
    captured_role_pages: layoutAudit.items.length,
    data_source: layoutAudit.data_source,
    visual_acceptance: layoutAudit.visual_acceptance,
  },
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
    "Guest and consumer market cards, filters, header/sidebar regions, banner and detail purchase panels have been aligned with their individual references. Search, category and integer-price sorting persist in the URL, detail tabs survive reload and market return context survives both general-service and travel-service navigation. Deployment labels retain all six stored states while purchase policy independently controls the entry button, with legacy availability fallback preserved. Full Boolean and long schemas remain keyboard-accessible, while long custom titles, categories and publisher names fit mobile layouts. Catalog counts, timestamps and publisher-defined fields come from actual responses. A controlled eight-service response verifies the reference's two-row consumer layout without changing stored catalog data. Final fidelity acceptance remains pending.",
    "Publisher S03 now renders editable Python, JavaScript and JSON syntax colors with prism-react-renderer 2.4.1 using React text nodes. Source, highlights and line numbers share scroll positions and reset on file changes. Independent file tabs can close and reopen unsaved buffers without removing files from the saved source package. Toolbar sizes, code gutter, selected file rows, configuration spacing, successful-validation colors and sidebar/header details have been aligned against the reference. The role capture explicitly performs the actual manifest check to reproduce the reference's validated state. Complete publisher schemas remain scrollable and feedback retains the actual scope of local validation. Final fidelity acceptance remains pending.",
    "Publisher S04 now loads owner-scoped fixed versions and action schemas through its normal route. Signed history pagination, exact version/action URLs and cross-links retain the selected resource. Draft manifest schemas and registered immutable actions preserve overrides, inheritance, Boolean schemas and custom names. Unsaved form switches and explicit revision refreshes require confirmation, while background focus and failed refreshes preserve input. Latest builds, bound artifact registration, independent author-test verdicts and deployment/current-service states retain their own facts. New-version writers, version-aware source editing, self-use execution and service creation remain pending. Synthetic browser and fully rolled-back PostgreSQL checks cover these reads, with all final visual acceptances still open.",
    "All catalog page definitions have initial components. Individual fidelity acceptance and complete interaction coverage remain in progress. Header search restores URL keywords for catalog, help, owner scripts, builds and administrator orders, while unsubmitted drafts remain local. Owner-script lists match displayed metadata and keep longer results within an internally scrolling table. Their creation links open distinct new-product drafts bound to the selected script and preserve explicit unavailable identities.",
    "Prototype financial, task and output records are local visual fixtures. Live payments, execution, notifications and artifact storage are pending.",
    "Service catalog and session authentication use the local database. Publisher self-use, checkout and purchased-service configuration share Schema validation. Draft 2020-12, explicit draft-07, boolean schemas, JSON values and form/JSON mode changes have synthetic regression coverage. Live service execution remains pending.",
    "All 75 role-page deliverables still require individual fidelity acceptance.",
    "Publisher build, author-test run and deployment pages now read owner-scoped metadata with signed pagination and direct off-page details. Build, run, independent test verdict, deployment health and artifact-registration availability retain their own stored facts. Unknown configured modes stay null and immutable historical resource values retain zero and large decimal strings. LIVE reads have retry feedback and 390px layout checks. Build and deployment commands, log bodies and actual execution remain pending.",
    "The current worktree's publisher source upload and split development documentation are integrated. Synthetic source packages pass owner-scoped API encryption, idempotency, revision and rollback checks and production-built upload, edit, save, reload and live version metadata entry points. Editor schemas retain complete publisher definitions in bounded scroll regions, duplicate files preserve content, and manifest edits preserve unrelated fields. Version form state follows the selected script and URL tabs. Real runners, builds and self-use scheduling remain pending.",
    "All 75 role routes are captured from a production-built UI and isolated development seed at each reference image's dimensions. The comparison viewer provides side-by-side images and opacity overlays. Publisher and administrator dashboards include reference metric changes, coherent chart end values, capacity progress, URL-restored filters and scoped mobile layout checks. Live business dashboards retain empty integration states. Individual final visual acceptance remains pending.",
    "The public home and authentication page have been realigned with their reference regions. The user confirmed email/password authentication from the detailed design on 2026-11-14.",
    "Registration, email verification and password reset are integrated with PostgreSQL in development preview mode. Verification delivery currently uses explicit development tokens.",
    "The market, general service detail and travel service detail now use separate guest and consumer layouts. Catalog facts and parameter examples come from the published service contract. The consumer eight-card layout uses a browser-only fixture because the development database currently contains four services.",
    "The consumer home and checkout are aligned with their reference regions. The live personal overview reads owner-scoped metadata in one database snapshot. Current-state counters retain old continuous runs, and committed outputs can be visible before process completion. Preview records are explicitly labeled and shared across their related pages.",
    "Publisher onboarding and profile settings use owner-scoped APIs, explicit first/new-version terms consent, encrypted receipts, revisions, audit and outbox writes. In-flight edits remain available for an explicit revision-checked save, conflict reloads retain typed fields, and failed background reads keep the loaded editor and dirty fields mounted with a read-only retry. Committed creation and failed identity refresh have separate feedback, with follow-up retries issuing no repeated profile command. Cancelled entry retains the consumer destination after delayed responses arrive. Existing consent has a title-bar reading link, terms and payout dialogs restore through URLs and history, and unsubmitted payout tokens clear on reopening or reload. Public-profile and payout previews merge independent fields. S01 and S15 layouts retain their reference regions and narrow-screen controls. Live publisher overviews, contact-channel persistence, payout configuration and verification remain pending.",
    "The output and pending pages have been realigned with the reference regions. Output links and toolbar actions use the selected record, and JSON/text/file previews preserve their own MIME types. Live output metadata uses owner-scoped committed-batch queries with signed pagination. Content storage, downloads, notification delivery and pending-action execution remain in progress.",
    "Account settings now have distinct consumer, publisher and administrator desktop and 390px layouts. Owner-scoped APIs, encrypted receipts and revision checks back identity, nickname edits and session management. Section and read-only dialog URLs restore through reload and history, while the keyboard-accessible header link retains the workspace. In-flight nickname edits remain available for explicit resubmission with the saved revision. Completed session revocations tolerate a failed metadata refresh. Logout clears local identity and private queries immediately and discards delayed pre-logout bootstrap responses. The default consumer publisher entry reaches explicit onboarding. Security revisions use decimal strings. Account closure, email changes and subscription disconnection remain pending.",
    "The message center and notification settings have been realigned with their reference regions, including the fixed footer and unobscured Webhook card. Message category and unread filters, email editing dialogs and selected verification records persist in URLs. Unknown categories offer recovery, event preferences show unsaved status before an explicit save, and email validation trims surrounding whitespace. Unsubmitted addresses clear on reopening. Preview read state drives the list, total and header badge together. Preview links use their existing output, order, refund and pending-verification records. Notification services, channel binding and subscription persistence remain pending. Live mode exposes that integration state and disables local-only saves.",
    "Credential and traveler pages have been realigned with their reference regions and Ctrl K search. Preview credential rotation preserves existing task-version bindings, and binding links open their corresponding tasks. Credential dialogs and traveler selection restore through URLs, and unavailable records offer recovery. Whitespace-only credentials and trimmed short identity values are rejected. Short values stay masked. Traveler edits retain document types and advance the preview version. Form initialization tracks the current selection to preserve newly entered fields during navigation, and deleting the edited record resets its form. Live credential storage, validation, traveler versions and authorization snapshots remain pending.",
    "Billing, refund and booking pages have been realigned with their reference regions. Billing summaries and CSV use decimal-string minor units and share refund records with the refund pages, resolving the conflicting reference fixtures to 3.00 refunded and 8.00 processing. Refund details link to the matching bill, preserve supplementary text, and read stored rule and execution snapshots. Repeated preview submissions reuse the same request. Invalid bill date ranges show unknown totals with disabled exports and recovery. CSV quotes custom service names containing commas, quotes or newline characters. Voucher selection restores through URLs and browser history, with recovery for pending and unavailable records. Pending bookings retain their verification state. Missing refund details keep their page heading and a return link. Live billing, refunds and official booking verification remain pending.",
    "Order list, order detail, purchased services and configuration have been realigned with their reference regions. Order filters persist in the URL. Entitlement actions retain their own order and task references, and refund entry carries the original order while its policy is loaded. Cashier demo selects the existing unpaid order. New preview orders retain a service contract snapshot and decimal-string amounts. Configuration checks the selected entitlement and purchased version, uses publisher-required JSON Schema fields, and validates and previews the chosen execution time. Live order, entitlement, scheduling and execution services remain pending.",
    "Task list, task detail, run list and run detail have been realigned with their reference regions. Task scope, applied run filters and detail tabs persist in the URL. Task details expose their own configuration snapshot, run history and order references. The active booking example retains the existing two-hour paid service window and consistent task dates. Its execution, business goal, two ready output batches and notification delivery retain independent states. Output links, preview file downloads and redacted log exports use the selected run. Pause and stop actions expose pending integration. Live task scheduling, execution, termination and notification delivery remain pending.",
    "Publisher build and deployment pages have been realigned with their reference regions. Build filters, build/trial tabs and selected records persist in the URL, and unavailable selections retain their own identity. Deployment detail, diagnostics and state-specific actions use the selected deployment. Copy returns a complete local example digest while its displayed value stays abbreviated. Configuration previews use the selected ready version, execution mode and resources, clear on edit and require fresh TCG consent after switching modes. Live builds, tests, deployment jobs, runtime profiles, quotas and stop-impact calculation remain pending and show unavailable metadata.",
    "Publisher metrics and diagnostics have been realigned with their reference regions. Service and version filters persist in the URL. Daily usage, delivered and achieved counts, technical classifications and stored decimal-string refund amounts aggregate independently while preserving the reference totals. Daily detail, refund allocation and diagnostic logs use local examples. Diagnostic selections retain their own owner-build evidence and open the matching script-name, version and build record. Missing build evidence stays unavailable, and unknown booking effects retain their verification classification. Live statistics, refunds and diagnostic queries remain pending with unknown counters.",
    "Publisher earnings and settlement detail have been realigned with their reference regions. Local ledger groups reconcile to the original 680 income, 80 refund, 60 fees and 540 net totals. The 300 pending-settlement display explicitly includes 100 pending maturity and 200 reserved for SET018, while the separate 200 available scope uses L003. Settlement lines link to their own ledger groups and derive their totals with BIGINT arithmetic. Payout previews capture the current masked account while historical settlements retain their original snapshot. A separate in-memory fixture check verifies signed-64-bit amounts through the normal routes. Live earnings, payout submission and channel-receipt queries remain pending.",
    "Publisher service products, publication editor, pricing and sales have been realigned with their reference regions. Status and sales filters persist in the URL, and resource changes reset editor and price forms. The local consumer preview uses the selected product's release snapshot, including its own script schema, script version and price-plan identity. Draft and new-price saves preserve the published release until explicit publication. New products bind an owner script and retain its publisher-required schema. The table example therefore displays its two declared fields, removing the undeclared output-format field and 10MB constraint from the reference image. Sales totals use decimal-string minor units and explicit processing-refund amounts, verified independently at signed-64-bit precision. Live product publication, pricing and sales queries remain pending.",
    "Administrator order list, order detail, payment/refund ledger and refund exception pages have been realigned with their reference regions. Applied filters and event tabs persist in the URL. Independent local payment facts link orders and refunds without inferring payment identity or amount from a refund. The six-yuan table order now uses PAY0018 to resolve the former PAY018 collision with the eight-yuan booking order; the payment ledger contains five local payment facts while the refund ledger retains its three reference rows. Refund balances aggregate completed and reserved amounts per original payment with BIGINT arithmetic. Execution, goal verification, entitlement consumption and refund status use separate stored facts. Historical contract rules remain fixed, resource changes close the note form, and missing or live records show unavailable metadata. Live administration queries, channel reconciliation, ledger lookup and scoped diagnosis sessions remain pending.",
    "Administrator reconciliation, publisher settlement and fee-policy pages have been realigned with their reference regions. Date controls load the configured Chinese month locale. Date/channel filters, batch selection and policy versions persist in the URL. Reconciliation notes bind their captured date/channel scope. SET018 now references the publisher's existing P0018 snapshot, resolving the administrator reference's PO018 alias. Batch ledger sources and historical account masks come from the selected snapshot. The 300 pending balance includes 100 pending maturity and 200 reserved, while generation previews the separate 200 available L003 scope. Period eligibility and current payout-account metadata await the backend preview. Policy intents synchronously return their original generated version on duplicate saves, including a draft-remount regression. User-paid channel charges leave the consumer total pending a quote, and publisher-paid charges leave net proceeds pending. Administrator and publisher views read unknown or confirmed payout status from the same fixture and flag net/payout inconsistencies. Amounts and mutable test evidence retain signed-64-bit precision. Live reconciliation, batch generation, channel queries and policy persistence remain pending.",
    "Administrator account and catalog pages now read capability-scoped, masked metadata with signed cursor pagination and retry controls. Quotas retain their individual resource keys, latest started windows and decimal-string BIGINT quantities. Live account order counts explicitly cover awaiting payment and active fulfillment. Unbound drafts and private script version states retain stored null bindings and content status. Prototype governance uses revision checks, hidden-selection cleanup and duplicate-confirmation protection. Isolated PGlite HTTP, production-built browser routes and rolled-back PostgreSQL 18 transactions verify these reads. Freeze, quota mutation, risk controls and execution revocation remain pending, and all final fidelity acceptances remain open.",
    "Administrator city, attraction and channel pages now read capability-scoped directory metadata and channel rule-version history with signed pagination. City selection and channel filters persist in the URL, and hidden selections cannot trigger a preview change. Current rules validate their channel relationship and preserve their own verification timestamp, while higher historical versions stay distinct. Linked services deduplicate valid owner/channel associations. LIVE pages retain the five stored adapter states and keep directory activation separate from sale eligibility. Reference layouts and full-width mobile content are checked alongside isolated PGlite HTTP and rolled-back PostgreSQL 18 reads. Directory maintenance, adapter bindings, capability upgrades, evidence content and sensitive unresolved-booking queries remain pending.",
    "Administrator scheduling and infrastructure pages now read paged node metadata, direct node details, image records, scheduling snapshots and per-resource capacity quotas. Node states retain all five stored values, optional cpu_cores and memory_mib reports preserve zero and decimal-string BIGINT values, and private capability payloads stay outside the metadata projection. Current-generation lease counts verify ownership and execution lifecycles while retaining expired unrevoked leases, unreported actual modes and failed cleanup records separately. Current-state counters retain old continuous runs and expose snapshot time and manual refresh. URL selection restores the same node or image, including records beyond the first list page. Prototype digest copying uses an explicit fixed local fixture. Isolated HTTP/browser and rolled-back PostgreSQL 18 queries verify these reads. Mode capacity totals, control commands, scheduling policy execution, cleanup proof and image verification content remain pending.",
    "Administrator run and observability pages now read capability-scoped run metadata, platform log segment manifests and alert instances with signed pagination. Runs retain all thirteen states, historical continuous execution, latest-attempt lease generations, absent actual modes and independently stored cleanup evidence. Platform segments retain exact sequence and byte counts, overlap windows, archive/index/expiry states and successful-read audit events. Alert acknowledgements, recovery timestamps and evidence-event counts remain distinct. URL filters and direct run selection survive reloads, time windows remain fixed across pagination, and unknown selections remain explicit. Prototype rule drafts restore all selected-rule fields, advance versions and deduplicate requests, while bounded silences expire on idle pages. Isolated PGlite HTTP, production-built desktop/mobile routes and rolled-back PostgreSQL 18 transactions verify these reads. Runtime controls, diagnostic-session issuance, effect verification, log bodies and exports, alert actions and rule synchronization remain pending.",
    "Administrator notification delivery and platform setting pages now read capability-scoped delivery metadata and feature, network policy, runtime policy and resource-profile versions with signed pagination. Delivery states, read/expiry times, dependency deadlines, latest attempts and masked receipts retain their separate stored facts. Two output emissions retain separate notification/delivery identities. Feature flags and evidence presence stay distinct, and current, historical and future policies use per-key version/effective-time checks. URL filters, original receipt selection, platform tabs and configuration dialogs survive reloads. Prototype reconciliation preserves UNKNOWN and marks its pending request while management operations and platform saves deduplicate confirmations. Desktop column/typography and 390px layouts retain internal table scrolling. Isolated PGlite HTTP, production-built routes and rolled-back PostgreSQL 18 queries verify the metadata. Safe retry/reconciliation execution, message bodies, policy content and mutation, protection state and execution-gateway enforcement remain pending.",
    "Administrator access and recovery pages now read capability-scoped grant, audit, own diagnostic-session, backup manifest, recovery-drill, retention-version and per-store cleanup metadata. Effective access managers count distinct active verified accounts, while revoked, expired and inactive-account grants remain distinct. Successful audit reads append query audit events, and diagnostic metadata stays with the current owner without token or scope bodies. Backup records, expiry, drill status and evidence presence retain separate facts, and cleanup receipt status stays distinct from its deletion request. Prototype grant edits capture revisions and retention edits capture versions, repeated submissions preserve one result, and dialog identity restores from URL. Desktop typography, capability glyphs and 390px content/table scrolling align with reference regions. Isolated PGlite HTTP, production-built routes and rolled-back PostgreSQL 18 transactions verify these reads. Grant mutations, session issuance/revocation, policy content and mutation, backup/precheck/drill execution and cleanup retries remain pending.",
    "The four help workspaces now retain their individual reference layouts, search positions, category/FAQ panels and quick-start/support cards. A public versioned help catalog provides six questions and five groups, including account security outside the five featured questions. Category, case-insensitive multi-term search, exact accordion selections and support dialog state restore from URL. Normal sidebar and home-footer help links preserve the logged-in workspace through reload. Failed reads show retry controls, unavailable question identities remain explicit and unconfigured online support retains its pending state. Production-built desktop and 390px routes verify these interactions. Live support delivery and all 75 final visual acceptances remain pending.",
    "The public travel directory now has distinct guest cards and consumer image rows aligned with the two reference layouts. Three original image_gen assets illustrate fictional example venues. City, date and search state restores from URL and survives service-detail return. Prototype services resolve a unique declared example identity, with ambiguous matches left unbound. Public city/attraction pagination and detail/linked-service reads expose enabled catalog records, current-channel rule metadata and original publisher service schemas. Public services now validate owner and resource bindings across release, deployment, script version, action and price plan. Current channel capability and service purchase availability stay independent, unknown associations stay unavailable, date selection retains NOT_QUERIED inventory state and minor-unit fees preserve BIGINT precision. Isolated production-built desktop/mobile routes and fully rolled-back PostgreSQL 18 transactions verify these reads. Real inventory, reservation submission, payment execution and all final visual acceptances remain pending.",
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
