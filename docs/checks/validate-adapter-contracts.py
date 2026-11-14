"""Static reference model only: validate/map synthetic data; never execute scripts.

JSON Schema shape checks live in validate-contracts.ps1. The required-path proof
here deliberately accepts only simple object/array schemas, not arbitrary refs
or conditionals. Production publishing must prove every allowed input branch.
"""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'contracts'
MISSING = object()
RESERVED = {"PATH", "HOME", "TMPDIR", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "NODE_OPTIONS", "NODE_PATH"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def path_parts(value):
    require(isinstance(value, str) and value != "", "empty path")
    require(not any(ord(c) < 32 or c in "\\:" for c in value), "unsafe path")
    parts = value.split("/")
    require(all(p not in ("", ".", "..") for p in parts), "path escape")
    return tuple(parts)


def tokens(pointer):
    if pointer == "":
        return []
    require(pointer.startswith("/") and not re.search(r"~(?![01])", pointer), "invalid pointer")
    return [p.replace("~1", "/").replace("~0", "~") for p in pointer[1:].split("/")]


def resolve(value, pointer):
    for token in tokens(pointer):
        if isinstance(value, dict) and token in value:
            value = value[token]
        elif isinstance(value, list) and re.fullmatch(r"0|[1-9][0-9]*", token) and int(token) < len(value):
            value = value[int(token)]
        else:
            return MISSING
    return value


def guaranteed(schema, pointer):
    for token in tokens(pointer):
        if not isinstance(schema, dict) or any(k in schema for k in ("$ref", "anyOf", "oneOf", "allOf", "if")):
            return False
        if schema.get("type") == "object" and token in schema.get("required", []):
            schema = schema.get("properties", {}).get(token)
        elif schema.get("type") == "array" and re.fullmatch(r"0|[1-9][0-9]*", token) and int(token) < schema.get("minItems", 0):
            prefix = schema.get("prefixItems", [])
            schema = prefix[int(token)] if int(token) < len(prefix) else schema.get("items")
        else:
            return False
    return schema is not None and schema is not False


def validate_binding(manifest, adapter):
    require(manifest["integration_mode"] == "legacy", "adapter requires legacy")
    require(len(manifest["actions"]) == 1 and adapter["action"] == manifest["default_action"], "action mismatch")
    action = manifest["actions"][adapter["action"]]
    require("resume_handler" not in action, "legacy adapter cannot claim safe resume")
    effective = action.get("input_schema", manifest["input_schema"])
    credentials = {c["name"]: c for c in manifest["credential_requirements"]}
    require(len(credentials) == len(manifest["credential_requirements"]), "duplicate credential alias")
    sources = adapter["argv"] + list(adapter["env"].values()) + adapter["config_files"]
    for source in sources:
        if "input_pointer" in source:
            tokens(source["input_pointer"])
            if source["on_missing"] == "error":
                require(guaranteed(effective, source["input_pointer"]), "hidden required input")
        if "credential_alias" in source:
            cred = credentials.get(source["credential_alias"])
            require(cred is not None, "unknown credential alias")
            require(source["on_missing"] != "error" or cred["required"], "hidden required credential")
    for arg in adapter["argv"]:
        require("credential_alias" not in arg, "credential in argv")
    for name in adapter["env"]:
        require(re.fullmatch(r"[A-Z_][A-Z0-9_]{0,63}", name) and name not in RESERVED and not name.startswith(("LD_", "DYLD_", "TT_")), "reserved env")
    paths = [path_parts(f["path"]) for f in adapter["config_files"]]
    for i, current in enumerate(paths):
        for other in paths[:i]:
            require(current[:len(other)] != other and other[:len(current)] != current, "config path conflict")
    bridge = adapter["notification_bridge"]
    if bridge["mode"] == "qinglong_subset":
        prefix = "python." if manifest["language"] == "python" else "js."
        require(all(api.startswith(prefix) for api in bridge["apis"]), "notification language mismatch")
        require(bridge["channel_policy"] == "task_bindings", "channel bypass")
    outputs = adapter["outputs"]
    if outputs["mode"] == "final":
        keys = [f["output_key"] for f in outputs["files"]]
        require(len(set(keys)) == len(keys), "duplicate output key")
        for file in outputs["files"]:
            path_parts(file["path"])
    elif outputs["mode"] == "manifest":
        path_parts(outputs["manifest_dir"])


def encode(value, encoding):
    if encoding == "string":
        require(isinstance(value, str), "string mapping requires string")
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    require("\0" not in text, "NUL argument")
    return text


def map_input(adapter, value, bound_credentials):
    """Caller must validate publisher schema and credential ownership first."""
    def read(source):
        if "literal" in source:
            require("\0" not in source["literal"], "NUL literal")
            return source["literal"]
        raw = (bound_credentials.get(source["credential_alias"], MISSING)
               if "credential_alias" in source else resolve(value, source["input_pointer"]))
        if raw is MISSING:
            require(source["on_missing"] == "omit", "missing mapping")
            return MISSING
        return encode(raw, source.get("encoding", "string"))
    argv = []
    for source in adapter["argv"]:
        result = read(source)
        if result is MISSING:
            continue
        if "flag" in source:
            argv.append(source["flag"])
        argv.append(result)
    env = {key: result for key, source in adapter["env"].items() if (result := read(source)) is not MISSING}
    require(all(len(v.encode("utf-8")) <= 32768 for v in env.values()), "env size budget")
    files = {}
    for spec in adapter["config_files"]:
        raw = resolve(value, spec["input_pointer"])
        if raw is MISSING:
            require(spec["on_missing"] == "omit", "missing config")
        else:
            files[spec["path"]] = encode(raw, "json")
    require(sum(len(x.encode("utf-8")) for x in argv + list(env.values()) + list(files.values())) <= 1048576, "mapping budget")
    return argv, env, files


def validate_emission(adapter, emission):
    require(adapter["outputs"]["mode"] == "manifest", "manifest mode required")
    base = path_parts(adapter["outputs"]["manifest_dir"])
    keys = set()
    total = 0
    for file in emission["files"]:
        parts = path_parts(file["path"])
        require(parts[:len(base)] != base, "cannot publish handoff control file")
        require(file["output_key"] not in keys, "duplicate output key")
        keys.add(file["output_key"])
        total += file["size_bytes"]
    require(total <= 524288000, "batch byte budget")


def main():
    def load(name):
        return json.loads((ROOT / "examples" / name).read_text(encoding="utf-8"))
    manifest, adapter, value, emission = [load("mapped." + name + ".json") for name in ("manifest", "adapter", "input", "emission")]
    count = 0
    def check(condition, label):
        nonlocal count
        if not condition:
            raise AssertionError(label)
        count += 1
    def rejected(fn, label):
        try:
            fn()
        except ValueError:
            check(True, label)
        else:
            raise AssertionError(label)
    validate_binding(manifest, adapter)
    check(True, "valid binding")
    original = copy.deepcopy(value)
    argv, env, files = map_input(adapter, value, {"source_token": "synthetic-only"})
    check(argv == ["--limit", "20"], "integer encoded once")
    check(env["REPORT_LABEL"] == value["label"], "shell characters remain data")
    check(files == {"report.json": '{"compact":false}'}, "JSON config")
    check(value == original, "input immutable")
    missing = copy.deepcopy(value); missing.pop("label")
    check("REPORT_LABEL" not in map_input(adapter, missing, {"source_token": "synthetic-only"})[1], "optional omitted")
    optional = copy.deepcopy(adapter)
    optional["argv"].append({"flag": "--label", "input_pointer": "/label", "encoding": "string", "on_missing": "omit"})
    check(map_input(optional, missing, {"source_token": "synthetic-only"})[0] == ["--limit", "20"], "missing option removes flag and value")
    check(map_input(optional, value, {"source_token": "synthetic-only"})[0][-2:] == ["--label", value["label"]], "option with spaces remains one value")
    check(resolve({"a/b": {"~": None}}, "/a~1b/~0") is None, "escaped pointer and null")
    check(resolve([4, 5], "/1") == 5, "array pointer")
    check(resolve([4, 5], "/01") is MISSING, "noncanonical array index")
    check(resolve([1, 2], "") == [1, 2], "root input")
    check(encode(None, "json") == "null", "null distinct from absent")
    check(guaranteed({"type": "array", "minItems": 1, "items": {"type": "integer"}}, "/0"), "required array item")
    rejected(lambda: tokens("/bad~2"), "invalid pointer")
    rejected(lambda: encode(2, "string"), "no coercion")
    rejected(lambda: encode("a\0b", "string"), "NUL rejected")
    rejected(lambda: map_input(adapter, value, {}), "required credential missing")
    for path in ("../x", "/tmp/x", "a/../x", "a\\x", "a//x", "a/", "C:/x"):
        rejected(lambda p=path: path_parts(p), "unsafe path " + path)
    check(path_parts("报告/报表.csv") == ("报告", "报表.csv"), "Unicode path")
    for name in ("PATH", "NODE_OPTIONS", "PYTHONPATH", "LD_PRELOAD", "TT_TOKEN"):
        bad = copy.deepcopy(adapter); bad["env"][name] = bad["env"]["SOURCE_URL"]
        rejected(lambda: validate_binding(manifest, bad), "reserved env " + name)
    bad = copy.deepcopy(adapter); bad["env"]["REPORT_LABEL"]["on_missing"] = "error"
    rejected(lambda: validate_binding(manifest, bad), "optional input cannot become mandatory")
    bad = copy.deepcopy(adapter); bad["env"]["SOURCE_TOKEN"]["credential_alias"] = "unknown"
    rejected(lambda: validate_binding(manifest, bad), "undeclared credential")
    bad = copy.deepcopy(adapter); bad["argv"].append({"credential_alias": "source_token", "on_missing": "error"})
    rejected(lambda: validate_binding(manifest, bad), "no argv secret")
    for path in ("report.json", "report.json/nested.json"):
        bad = copy.deepcopy(adapter); bad["config_files"].append({"path": path, "input_pointer": "", "on_missing": "error"})
        rejected(lambda: validate_binding(manifest, bad), "conflicting config paths")
    bad = copy.deepcopy(adapter); bad["notification_bridge"]["apis"] = ["js.sendNotify.send"]
    rejected(lambda: validate_binding(manifest, bad), "wrong language bridge")
    bad = copy.deepcopy(adapter); bad["action"] = "another"
    rejected(lambda: validate_binding(manifest, bad), "wrong action")
    validate_emission(adapter, emission); check(True, "valid handoff metadata")
    bad = copy.deepcopy(emission); bad["files"] *= 2
    rejected(lambda: validate_emission(adapter, bad), "duplicate output keys")
    bad = copy.deepcopy(emission); bad["files"][0]["path"] = "ready/control.json"
    rejected(lambda: validate_emission(adapter, bad), "control directory excluded")
    bad_manifest = copy.deepcopy(manifest); bad_manifest["actions"]["execute"]["resume_handler"] = "fake"
    rejected(lambda: validate_binding(bad_manifest, adapter), "no inferred safe resume")
    print(f"PASS: {count} adapter mapping and relation model checks; no process, file upload or notification executed.")


if __name__ == "__main__":
    main()
