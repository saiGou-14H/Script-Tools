import { HttpException, Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { DatabaseService, SqlConnection } from "../database/database.service";
import { CommandReceiptService } from "../common/command-receipt.service";
import { loadPayloadKey } from "../common/payload-key";

function fail(code: string, message: string, status = 422): never {
  throw new HttpException({ code, message }, status);
}
function uuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    fail("NOT_FOUND", "脚本不存在", 404);
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const purpose = "SCRIPT_SOURCE";

@Injectable()
export class ScriptService {
  private readonly ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: false,
  });
  private readonly manifestValidator;
  constructor(
    private readonly database: DatabaseService,
    private readonly receipts: CommandReceiptService,
  ) {
    this.manifestValidator = this.ajv.compile(
      JSON.parse(
        readFileSync(
          path.join(database.root, "docs/contracts/manifest.schema.json"),
          "utf8",
        ),
      ),
    );
  }

  private async publisher(
    connection: SqlConnection,
    owner: string,
    lock = false,
  ) {
    const user = (
      await connection.query(
        `SELECT status,verified_at FROM travel.users WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [owner],
      )
    ).rows[0];
    const profile = (
      await connection.query(
        "SELECT enabled FROM travel.publisher_profiles WHERE owner_user_id=$1",
        [owner],
      )
    ).rows[0];
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !user.verified_at ||
      !profile?.enabled
    )
      fail("POLICY_DENIED", "请使用有效发布者账号", 403);
  }

  private parse(body: unknown, update = false) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("INVALID_REQUEST", "脚本包格式无效");
    const value = body as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (key) =>
          !(update ? ["files"] : ["name", "description", "files"]).includes(
            key,
          ),
      )
    )
      fail("INVALID_REQUEST", "脚本包包含未知字段");
    if (
      !update &&
      (typeof value.name !== "string" ||
        !value.name.trim() ||
        value.name.length > 120)
    )
      fail("INVALID_REQUEST", "脚本名称应为1至120位");
    if (
      value.description !== undefined &&
      (typeof value.description !== "string" ||
        value.description.length > 10000)
    )
      fail("INVALID_REQUEST", "脚本说明最多10000位");
    if (
      !value.files ||
      typeof value.files !== "object" ||
      Array.isArray(value.files)
    )
      fail("INVALID_REQUEST", "请选择源码文件包");
    const files = value.files as Record<string, string>;
    const names = Object.keys(files).sort();
    if (!names.length || names.length > 64)
      fail("SOURCE_QUOTA_EXCEEDED", "脚本包应包含1至64个文本文件");
    for (const name of names) {
      if (
        name.length > 256 ||
        /[\\:\x00-\x1f]/.test(name) ||
        name
          .split("/")
          .some(
            (part) =>
              !part ||
              [".", "..", "__proto__", "constructor", "prototype"].includes(
                part,
              ),
          ) ||
        typeof files[name] !== "string"
      )
        fail("INVALID_SOURCE_PATH", "源码文件名或类型无效");
    }
    const plaintext = JSON.stringify(
      Object.fromEntries(names.map((name) => [name, files[name]])),
    );
    if (Buffer.byteLength(plaintext) > 1024 * 1024)
      fail("SOURCE_QUOTA_EXCEEDED", "文本源码包上限为1MiB", 413);
    let manifest: Record<string, any>;
    try {
      manifest = JSON.parse(files["manifest.json"]);
    } catch {
      fail("MANIFEST_INVALID", "缺少有效manifest.json");
    }
    if (!this.manifestValidator(manifest))
      fail("MANIFEST_INVALID", "脚本清单未通过2.0结构校验");
    for (const referenced of [
      manifest.entrypoint,
      manifest.dependencies_lock,
    ]) {
      if (typeof referenced !== "string" || !Object.hasOwn(files, referenced))
        fail("SOURCE_REFERENCE_INVALID", "入口或依赖锁文件不存在");
    }
    if (!Object.hasOwn(manifest.actions, manifest.default_action))
      fail("MANIFEST_INVALID", "默认动作尚未注册");
    for (const action of Object.values(manifest.actions) as Record<
      string,
      any
    >[]) {
      if (
        (action.resume_actions || []).some(
          (name: string) => !Object.hasOwn(manifest.actions, name),
        )
      )
        fail("MANIFEST_INVALID", "恢复动作尚未注册");
      for (const schema of [
        manifest.input_schema,
        action.input_schema,
        action.output_schema,
        action.checkpoint_schema,
      ].filter((item) => item !== undefined)) {
        try {
          if (!this.ajv.validateSchema(schema))
            fail("SCHEMA_UNSUPPORTED", "动作Schema无效");
        } catch {
          fail(
            "SCHEMA_UNSUPPORTED",
            "动作Schema无效或使用了不支持的Schema版本",
          );
        }
      }
    }
    return { value, files, plaintext, manifest };
  }

  private projection(row: Record<string, any>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version_id: row.version_id,
      version: row.version,
      revision: String(row.revision),
      content_status: row.content_status,
      source_digest: row.content_hash,
      input_schema:
        row.manifest?.actions?.[row.manifest?.default_action]?.input_schema ??
        row.manifest?.input_schema ??
        {},
      updated_at: row.updated_at,
    };
  }

  async list(owner: string) {
    await this.publisher(this.database, owner);
    const result = await this.database.query(
      `SELECT s.id,s.name,s.description,v.id AS version_id,v.version,v.revision,v.content_status,v.content_hash,v.manifest,v.updated_at
      FROM travel.scripts s JOIN LATERAL (SELECT * FROM travel.script_versions WHERE script_id=s.id AND owner_user_id=$1 AND source_object_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1) v ON true
      WHERE s.owner_user_id=$1 AND s.retired_at IS NULL ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,
      [owner],
    );
    return result.rows.map((row) => this.projection(row));
  }

  private async ownVersion(
    connection: SqlConnection,
    owner: string,
    id: string,
    lock = false,
  ) {
    uuid(id);
    const row = (
      await connection.query(
        `SELECT v.*,s.name,s.description FROM travel.script_versions v JOIN travel.scripts s ON s.id=v.script_id AND s.owner_user_id=v.owner_user_id
      WHERE v.id=$1 AND v.owner_user_id=$2 ${lock ? "FOR UPDATE OF v" : ""}`,
        [id, owner],
      )
    ).rows[0];
    if (!row) fail("NOT_FOUND", "脚本版本不存在", 404);
    return row;
  }

  async source(owner: string, version: string) {
    await this.publisher(this.database, owner);
    const row = await this.ownVersion(this.database, owner, version);
    const payload = (
      await this.database.query(
        `SELECT p.id,p.key_version,p.ciphertext,o.sha256 FROM travel.storage_objects o
      JOIN travel.private_payloads p ON p.id::text=o.object_key AND p.owner_user_id=o.owner_user_id
      WHERE o.id=$1 AND o.owner_user_id=$2 AND o.purpose=$3 AND o.bucket_alias='private-payloads' AND o.status='READY'
      AND o.deleted_at IS NULL AND p.purpose=$3 AND p.deleted_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>now())`,
        [row.source_object_id, owner, purpose],
      )
    ).rows[0];
    if (!payload) fail("SOURCE_UNAVAILABLE", "源码内容当前不可用", 503);
    const key = await loadPayloadKey(this.database.root);
    if (payload.key_version !== key.version)
      fail("PAYLOAD_KEY_UNAVAILABLE", "源码加密密钥不可用", 503);
    try {
      const bytes = Buffer.from(payload.ciphertext as Uint8Array);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key.bytes,
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      decipher.setAAD(Buffer.from(`${owner}:${payload.id}:${purpose}`));
      const plaintext = Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
      if (hash(plaintext) !== payload.sha256)
        throw new Error("Digest mismatch");
      return {
        files: JSON.parse(plaintext),
        version_id: row.id,
        revision: String(row.revision),
        source_digest: payload.sha256,
      };
    } catch {
      fail("SOURCE_UNAVAILABLE", "源码完整性校验未通过", 503);
    }
  }

  async save(
    owner: string,
    body: unknown,
    key: string | undefined,
    requestId: string,
    version?: string,
    ifMatch?: string,
  ) {
    if (!key || key.length > 200)
      fail("INVALID_REQUEST", "请提供有效幂等请求标识");
    return this.database.transaction(async (connection) => {
      await this.publisher(connection, owner, true);
      const scope = {
        owner,
        method: version ? "PATCH" : "POST",
        route: version
          ? `/api/v1/script-versions/${version}`
          : "/api/v1/scripts",
        key,
      };
      const stored = await this.receipts.read(connection, scope, body);
      if (stored.receipt) return stored.receipt;
      const parsed = this.parse(body, !!version);
      const previous = version
        ? await this.ownVersion(connection, owner, version, true)
        : null;
      if (previous && previous.content_status !== "DRAFT")
        fail("VERSION_IMMUTABLE", "只能编辑草稿版本", 409);
      if (previous && !ifMatch)
        fail("PRECONDITION_REQUIRED", "请提供草稿修订号", 428);
      if (
        previous &&
        ifMatch?.replace(/^"|"$/g, "") !== String(previous.revision)
      )
        fail("REVISION_CONFLICT", "草稿已更新，请重新加载", 412);
      if (previous && parsed.manifest.version !== previous.version)
        fail("VERSION_CONFLICT", "版本号变更需要创建新版本", 409);
      const scriptId = previous?.script_id || randomUUID();
      const versionId = previous?.id || randomUUID();
      const payloadId = randomUUID();
      const objectId = randomUUID();
      const encryption = await loadPayloadKey(this.database.root);
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryption.bytes, nonce);
      cipher.setAAD(Buffer.from(`${owner}:${payloadId}:${purpose}`));
      const encrypted = Buffer.concat([
        cipher.update(parsed.plaintext, "utf8"),
        cipher.final(),
      ]);
      const digest = hash(parsed.plaintext);
      const schemaDigest = hash(
        JSON.stringify({
          input_schema: parsed.manifest.input_schema,
          actions: parsed.manifest.actions,
        }),
      );
      await connection.query(
        `INSERT INTO travel.private_payloads(id,owner_user_id,purpose,key_version,ciphertext,content_hmac,size_bytes)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          payloadId,
          owner,
          purpose,
          encryption.version,
          Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
          createHmac("sha256", encryption.bytes)
            .update(parsed.plaintext)
            .digest("hex"),
          Buffer.byteLength(parsed.plaintext),
        ],
      );
      await connection.query(
        `INSERT INTO travel.storage_objects(id,owner_user_id,purpose,bucket_alias,object_key,sha256,size_bytes,media_type,key_version,status)
        VALUES($1,$2,$3,'private-payloads',$4,$5,$6,'application/json',$7,'READY')`,
        [
          objectId,
          owner,
          purpose,
          payloadId,
          digest,
          Buffer.byteLength(parsed.plaintext),
          encryption.version,
        ],
      );
      if (!previous)
        await connection.query(
          "INSERT INTO travel.scripts(id,owner_user_id,name,description) VALUES($1,$2,$3,$4)",
          [
            scriptId,
            owner,
            (parsed.value.name as string).trim(),
            parsed.value.description || "",
          ],
        );
      const saved = previous
        ? (
            await connection.query(
              `UPDATE travel.script_versions SET source_object_id=$3,manifest=$4,content_hash=$5,schema_digest=$6 WHERE id=$1 AND owner_user_id=$2 RETURNING *`,
              [
                versionId,
                owner,
                objectId,
                JSON.stringify(parsed.manifest),
                digest,
                schemaDigest,
              ],
            )
          ).rows[0]
        : (
            await connection.query(
              `INSERT INTO travel.script_versions(id,owner_user_id,script_id,version,source_object_id,manifest,content_hash,schema_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
              [
                versionId,
                owner,
                scriptId,
                parsed.manifest.version,
                objectId,
                JSON.stringify(parsed.manifest),
                digest,
                schemaDigest,
              ],
            )
          ).rows[0];
      const data = this.projection({
        ...saved,
        id: scriptId,
        version_id: versionId,
        name: previous?.name || parsed.value.name,
        description: previous?.description || parsed.value.description || "",
      });
      await connection.query(
        `INSERT INTO travel.audit_events(id,actor_user_id,subject_owner_user_id,action,target_type,target_id,after_revision,request_id,outcome,summary)
        VALUES(gen_random_uuid(),$1,$1,'SCRIPT_DRAFT_SAVED','SCRIPT_VERSION',$2,$3,$4,'SUCCESS',$5)`,
        [
          owner,
          versionId,
          saved.revision,
          requestId,
          JSON.stringify({
            file_count: Object.keys(parsed.files).length,
            source_digest: digest,
          }),
        ],
      );
      await connection.query(
        `INSERT INTO travel.outbox_events(id,owner_user_id,aggregate_type,aggregate_id,aggregate_revision,event_type,payload,request_id,occurred_at)
        VALUES(gen_random_uuid(),$1,'SCRIPT_VERSION',$2,$3,'SCRIPT_DRAFT_SAVED',$4,$5,now())`,
        [
          owner,
          versionId,
          saved.revision,
          JSON.stringify({ script_id: scriptId, version_id: versionId }),
          requestId,
        ],
      );
      const response = { status: previous ? 200 : 201, data };
      await this.receipts.write(
        connection,
        scope,
        stored.digest,
        versionId as string,
        response,
        "SCRIPT_VERSION",
      );
      return response;
    });
  }
}
