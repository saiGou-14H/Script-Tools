import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const Ajv2020 = require("ajv/dist/2020.js");
const addFormats = require("ajv-formats");
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
});
addFormats(ajv, ["date", "date-time", "uri", "email"]);
const contractRoot = new URL("../contracts/", import.meta.url);
const exampleRoot = new URL("examples/development/", contractRoot);
const validators = new Map();
let checks = 0;

function readJson(relative, base = contractRoot) {
  return JSON.parse(readFileSync(new URL(relative, base), "utf8"));
}

function check(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}

function checkSchema(value, schema, expected, label) {
  if (!validators.has(schema)) validators.set(schema, ajv.compile(schema));
  const validate = validators.get(schema);
  const before = JSON.stringify(value);
  assert.equal(validate(value), expected, `${label} ${JSON.stringify(validate.errors)}`);
  assert.equal(JSON.stringify(value), before, `${label} must preserve the input`);
  checks += 1;
}

function checkChanged(original, change, schema, expected, label) {
  const value = structuredClone(original);
  change(value);
  checkSchema(value, schema, expected, label);
}

const schemas = Object.fromEntries(
  ["manifest", "invocation", "result", "script-event"].map((name) => [name, readJson(`${name}.schema.json`)]),
);
const manifestDraft = readJson("drafts/manifest-2.1.schema.json");
const runtimeDraft = readJson("drafts/runtime-1.0.schema.json");
const go = readJson("go.manifest.json", exampleRoot);
const runtime = readJson("go.runtime.json", exampleRoot);
checkSchema(go, manifestDraft, true, "manifest 2.1 draft");
checkSchema(runtime, runtimeDraft, true, "runtime 1.0 draft");
checkSchema(go, schemas.manifest, false, "2.0 rejects 2.1 draft");
const digest = createHash("sha256").update(readFileSync(new URL(go.runtime_spec.path, exampleRoot))).digest("hex");
check(digest === go.runtime_spec.sha256, "runtime reference digest");
check(runtime.launch.protocol === "invocation-files/1.0" && go.integration_mode === "legacy", "file lifecycle");
check(runtime.launch.argv.includes(`/app/${go.entrypoint}`), "compiled entrypoint matches launch");

for (const language of ["python", "nodejs", "typescript", "go", "java", "kotlin", "csharp", "rust", "php", "ruby", "r"]) {
  checkChanged(go, (value) => { value.language = language; }, manifestDraft, true, `language identifier ${language}`);
}
for (const language of ["", "Go", "go build", "go/../python"]) {
  checkChanged(go, (value) => { value.language = language; }, manifestDraft, false, "invalid language identifier");
}
for (const path of ["../runtime.json", "nested/../runtime.json", "/runtime.json", "C:\\runtime.json", "nested\\runtime.json", "./runtime.json"]) {
  checkChanged(go, (value) => { value.runtime_spec.path = path; }, manifestDraft, false, "runtime path bounded");
}
checkChanged(go, (value) => { delete value.runtime_spec; }, manifestDraft, false, "runtime spec required");
checkChanged(go, (value) => { value.runtime_spec.sha256 = "invalid"; }, manifestDraft, false, "digest syntax");
checkChanged(runtime, (value) => { value.privileged = true; }, runtimeDraft, false, "host privilege field rejected");
checkChanged(runtime, (value) => { value.launch.argv = []; }, runtimeDraft, false, "executable required");
checkChanged(runtime, (value) => { value.launch.argv = ["python", "invalid\0argument"]; }, runtimeDraft, false, "NUL rejected");
checkChanged(runtime, (value) => { value.build.commands = ["go build ./..."]; }, runtimeDraft, false, "build argv arrays");
checkChanged(runtime, (value) => { value.launch.protocol = "unknown/1.0"; }, runtimeDraft, false, "protocol rejected");
checkChanged(runtime, (value) => { value.platform.architecture = "unknown"; }, runtimeDraft, false, "architecture rejected");
checkChanged(runtime, (value) => { value.launch.protocol = "hook-bridge/1.0"; }, runtimeDraft, true, "hook bridge descriptor");
const hooks = structuredClone(go);
hooks.integration_mode = "hooks";
hooks.hook_protocol_version = "2.0";
hooks.actions.hello.handler = "hello";
checkSchema(hooks, manifestDraft, true, "hooks across languages");
checkChanged(hooks, (value) => { delete value.actions.hello.output_schema; }, manifestDraft, false, "hooks output schema required");

const booking = readJson("tiananmen.manifest.json", exampleRoot);
const invocation = readJson("tiananmen.invocation.json", exampleRoot);
const query = readJson("tiananmen.query.invocation.json", exampleRoot);
checkSchema(booking, schemas.manifest, true, "booking uses manifest 2.0");
check(Object.hasOwn(booking.actions, booking.default_action), "default action registered");
for (const action of Object.values(booking.actions)) {
  for (const resume of action.resume_actions || []) {
    check(Object.hasOwn(booking.actions, resume), "resume action registered");
  }
}
for (const payload of [invocation, query]) {
  checkSchema(payload, schemas.invocation, true, "invocation envelope");
  check(Object.hasOwn(booking.actions, payload.action), "invoked action registered");
  const action = booking.actions[payload.action];
  const inputSchema = Object.hasOwn(action, "input_schema") ? action.input_schema : booking.input_schema;
  checkSchema(payload.input, inputSchema, true, "action input");
  for (const binding of payload.credential_bindings) {
    check(booking.credential_requirements.some((requirement) => requirement.name === binding.requirement), "credential alias");
  }
}

function checkResult(name, payload) {
  const result = readJson(name, exampleRoot);
  checkSchema(result, schemas.result, true, "result envelope");
  for (const field of ["run_id", "attempt_id", "invocation_id", "action"]) {
    check(result[field] === payload[field], `result association ${field}`);
  }
  const action = booking.actions[payload.action];
  if (result.data !== null || result.outcome === "COMPLETED") {
    checkSchema(result.data, action.output_schema, true, "business output");
  }
  if (result.action_required?.resume_action) {
    check(action.resume_actions.includes(result.action_required.resume_action), "resume action allowed");
  }
}
checkResult("tiananmen.result.json", invocation);
checkResult("tiananmen.unknown.result.json", invocation);
checkResult("tiananmen.query.result.json", query);
const event = readJson("tiananmen.event.json", exampleRoot);
checkSchema(event, schemas["script-event"], true, "event envelope");
for (const field of ["run_id", "attempt_id", "invocation_id", "script_version_id"]) {
  check(event[field] === invocation[field], `event association ${field}`);
}
checkSchema(event.data, booking.events[event.event_name].data_schema, true, "event data");

checkChanged(booking, (value) => { value.language = "go"; }, schemas.manifest, false, "2.0 language boundary");
checkChanged(invocation.input, (value) => { value.max_ticket_fee_minor = "0"; }, booking.input_schema, false, "explicit fee type");
checkChanged(invocation.input, (value) => { value.person_ids = ["same", "same"]; }, booking.input_schema, false, "duplicate person");
checkChanged(invocation.input, (value) => { value.dates = ["2026-02-30"]; }, booking.input_schema, false, "invalid visit date");
checkChanged(invocation.input, (value) => { value.slots = ["25:00"]; }, booking.input_schema, false, "invalid slot clock");
checkChanged(invocation.input, (value) => { value.token = "synthetic-secret"; }, booking.input_schema, false, "credential outside input");
checkSchema({}, booking.actions.query_order.input_schema, false, "query identifier required");
checkSchema(query.input, booking.input_schema, false, "query input fully overrides booking input");
checkChanged(readJson("tiananmen.query.result.json", exampleRoot).data, (value) => { value.upstream_order_id = null; }, booking.actions.book.output_schema, false, "ORDER_FOUND requires order id");
checkChanged(readJson("tiananmen.result.json", exampleRoot).data, (value) => { value.upstream_task_id = null; }, booking.actions.book.output_schema, false, "SUBMITTED requires task id");
checkChanged(readJson("tiananmen.result.json", exampleRoot).data, (value) => { value.payment_action_required = true; }, booking.actions.book.output_schema, false, "payment requires known order");

console.log(`PASS: ${checks} development contract checks. Synthetic schemas, formats and associations only.`);
