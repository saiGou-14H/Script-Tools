"""Validate fixture relationships and batch/checkpoint semantics, not a running service."""
import copy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "contracts" / "examples"


def read(name):
    return json.loads((root / name).read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check(case):
    manifest, invocation, result = case["manifest"], case["invocation"], case["result"]
    items, batches, uploads = case["items"], case["batches"], case["uploads"]
    registry = {item["output_id"]: item for item in items}
    require(len(registry) == len(items), "duplicate output_id")
    series = invocation["runtime"]["output_series_id"]
    upload_map = {u["upload_id"]: u for u in uploads}
    action = manifest["actions"][invocation["action"]]
    policy = action.get("output_contract", {})
    allowed = policy.get("allowed_kinds", ["file", "text", "json", "message"])
    keys = set()
    for item in items:
        request = item["request"]
        key = (item["batch_key"], request["output_key"])
        require(key not in keys, "duplicate output_key in batch")
        keys.add(key)
        require(request["kind"] in allowed, "kind outside action contract")
        if request["kind"] == "file":
            payload = request["payload"]
            require(payload["upload_id"] in upload_map, "unregistered upload")
            upload = upload_map[payload["upload_id"]]
            require(upload["invocation_id"] == invocation["invocation_id"], "foreign upload invocation")
            require(upload["output_series_id"] == series, "foreign upload series")
            require(upload["batch_key"] == item["batch_key"], "foreign upload batch")
            require(upload["phase"] == item["phase"], "upload phase mismatch")
            require(upload["state"] == "UPLOADED", "upload incomplete")
            for field in ("file_name", "media_type", "size_bytes", "sha256"):
                require(upload[field] == payload[field], f"upload {field} mismatch")
    committed = set()
    for reference in result.get("outputs", []):
        oid = reference["output_id"]
        require(oid in registry, "unregistered result output")
        require(registry[oid]["phase"] == "ACTION", "fixture result references unpublished hook output")
        committed.add(oid)
    batch_keys = set()
    checkpoint_revision = 0
    for batch in batches:
        require(batch["output_series_id"] == series, "foreign batch series")
        require(batch["batch_key"] not in batch_keys, "duplicate new batch key")
        batch_keys.add(batch["batch_key"])
        current = {r["output_id"] for r in batch["outputs"]}
        require(len(current) == len(batch["outputs"]), "duplicate batch reference")
        require(len(current) <= policy.get("max_items", 100), "batch item limit")
        names = set()
        for oid in current:
            require(oid in registry, "unregistered batch output")
            item = registry[oid]
            require(item["batch_key"] == batch["batch_key"], "output belongs to another batch")
            require(item["phase"] == batch["phase"], "output phase mismatch")
            request = item["request"]
            names.add(request["output_key"])
            if request["kind"] == "message":
                for ref in request["payload"]["attachments"]:
                    target = ref["output_id"]
                    require(target in current | committed, "attachment not committed or not in batch")
                    require(registry[target]["request"]["kind"] != "message", "message cannot be an attachment")
        if policy.get("required_scope", "batch") == "batch" or batch["reason"] == "final":
            require(set(policy.get("required_keys", [])) <= names, "missing required output key")
        if "checkpoint" in batch:
            require("checkpoint_schema" in action, "undeclared checkpoint schema")
            require(batch["checkpoint"]["expected_revision"] == checkpoint_revision, "stale checkpoint revision")
            checkpoint_revision += 1
        committed |= current
    return committed


cases = {}
for spec in read("cases.json"):
    if "output_items" not in spec:
        continue
    cases[spec["id"]] = {
        "manifest": read(spec["manifest"]), "invocation": read(spec["invocation"]),
        "result": read(spec["result"]), "items": read(spec["output_items"]),
        "uploads": read(spec["output_uploads"]) if "output_uploads" in spec else [],
        "batches": read(spec["output_batches"]) if "output_batches" in spec else [read(spec["output_batch"])],
    }

checks = 0
for case in cases.values():
    check(case)
    checks += 1


def rejected(case_id, mutate, expected):
    global checks
    case = copy.deepcopy(cases[case_id])
    mutate(case)
    try:
        check(case)
    except ValueError as exc:
        require(str(exc) == expected, f"unexpected rejection: {exc}")
        checks += 1
        return
    raise AssertionError(f"expected rejection: {expected}")


rejected("outputs", lambda c: c["uploads"][0].update(invocation_id="another"), "foreign upload invocation")
rejected("outputs", lambda c: c["uploads"][0].update(output_series_id="another"), "foreign upload series")
rejected("outputs", lambda c: c["uploads"][0].update(state="UPLOADING"), "upload incomplete")
rejected("outputs", lambda c: c["uploads"][0].update(sha256="f" * 64), "upload sha256 mismatch")
rejected("outputs", lambda c: c["items"][-1]["request"]["payload"]["attachments"].append({"output_id": "foreign"}), "attachment not committed or not in batch")
rejected("outputs", lambda c: c["items"][-1]["request"]["payload"].update(attachments=[{"output_id": "out_notice"}]), "message cannot be an attachment")
rejected("outputs", lambda c: c["batches"][0].update(phase="ACTION"), "output phase mismatch")
rejected("continuous", lambda c: c["batches"][1]["checkpoint"].update(expected_revision=0), "stale checkpoint revision")
rejected("continuous", lambda c: c["batches"][1].update(batch_key="page.001"), "duplicate new batch key")
rejected("continuous", lambda c: c["batches"][1]["outputs"].pop(), "missing required output key")
rejected("continuous", lambda c: c["items"][1]["request"]["payload"].update(attachments=[{"output_id": "out_cont_text_2"}]), "attachment not committed or not in batch")
rejected("continuous", lambda c: c["items"][1]["request"].update(output_key="summary"), "duplicate output_key in batch")

# Re-reading a committed immutable batch returns the same identity. Different keys are distinct.
ledger = {}
revision = 0
deliveries = 0
for batch in cases["continuous"]["batches"] * 2:
    key = (batch["output_series_id"], batch["batch_key"])
    digest = json.dumps(batch, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if key in ledger:
        require(ledger[key] == digest, "same batch key changed content")
        continue
    require(batch["checkpoint"]["expected_revision"] == revision, "checkpoint must commit with batch")
    ledger[key] = digest
    revision += 1
    deliveries += 1
require(len(ledger) == 3 and revision == 3 and deliveries == 3, "replay duplicated batch/checkpoint/notification")
checks += 1
changed = copy.deepcopy(cases["continuous"]["batches"][0])
changed["checkpoint"]["value"]["cursor"] = 99
require(ledger[(changed["output_series_id"], changed["batch_key"])] != json.dumps(changed, sort_keys=True, separators=(",", ":"), ensure_ascii=False), "changed replay not detected")
checks += 1
print(f"PASS: {checks} output relationship and batch/checkpoint model checks. No live service or file bytes tested.")
