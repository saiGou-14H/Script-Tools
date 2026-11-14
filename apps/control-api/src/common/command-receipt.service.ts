import { HttpException, Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { DatabaseService, SqlConnection } from "../database/database.service";
import { loadPayloadKey } from "./payload-key";

interface ReceiptScope {
  owner: string;
  method: string;
  route: string;
  key: string;
}
export interface CommandReceipt {
  status: number;
  data: Record<string, unknown>;
}
const purpose = "HTTP_COMMAND_RECEIPT";

@Injectable()
export class CommandReceiptService {
  private keyPromise?: Promise<{ bytes: Buffer; version: string }>;
  constructor(private readonly database: DatabaseService) {}

  private encryptionKey() {
    this.keyPromise ||= loadPayloadKey(this.database.root);
    return this.keyPromise;
  }

  async read(connection: SqlConnection, scope: ReceiptScope, body: unknown) {
    let canonical: string;
    try {
      canonical = JSON.stringify(body, (_, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      );
      if (canonical === undefined) throw new Error("Missing request body");
    } catch {
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "请求正文无效" },
        422,
      );
    }
    const key = await this.encryptionKey();
    const digest = createHmac("sha256", key.bytes)
      .update(`http-request\0${canonical}`)
      .digest("hex");
    const record = (
      await connection.query(
        `SELECT id,request_digest,response_payload_id,response_status,expires_at>now() AS valid
      FROM travel.idempotency_records WHERE owner_user_id=$1 AND method=$2 AND route=$3 AND key=$4 FOR UPDATE`,
        [scope.owner, scope.method, scope.route, scope.key],
      )
    ).rows[0];
    if (!record) return { digest };
    if (!record.valid) {
      await connection.query(
        "DELETE FROM travel.idempotency_records WHERE id=$1",
        [record.id],
      );
      if (record.response_payload_id)
        await connection.query(
          `UPDATE travel.private_payloads SET ciphertext=NULL,deleted_at=now()
        WHERE id=$1 AND owner_user_id=$2 AND purpose=$3 AND deleted_at IS NULL`,
          [record.response_payload_id, scope.owner, purpose],
        );
      return { digest };
    }
    if (record.request_digest !== digest)
      throw new HttpException(
        {
          code: "IDEMPOTENCY_CONFLICT",
          message: "该请求标识已用于不同内容，请重新提交新的请求",
        },
        409,
      );
    if (!record.response_payload_id || !record.response_status)
      throw new HttpException(
        {
          code: "IDEMPOTENCY_PENDING",
          message: "原请求仍在处理中，请稍后重试",
          retry_after_seconds: 1,
        },
        409,
      );
    const payload = (
      await connection.query(
        `SELECT key_version,ciphertext FROM travel.private_payloads
      WHERE id=$1 AND owner_user_id=$2 AND purpose=$3 AND deleted_at IS NULL AND expires_at>now()`,
        [record.response_payload_id, scope.owner, purpose],
      )
    ).rows[0];
    if (!payload || payload.key_version !== key.version)
      throw new HttpException(
        {
          code: "PAYLOAD_KEY_UNAVAILABLE",
          message: "原请求回执暂时无法读取，请稍后重试",
        },
        503,
      );
    let data: Record<string, unknown>;
    try {
      const encrypted = Buffer.from(payload.ciphertext as Uint8Array);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key.bytes,
        encrypted.subarray(0, 12),
      );
      decipher.setAuthTag(encrypted.subarray(12, 28));
      decipher.setAAD(
        Buffer.from(`${scope.owner}:${record.response_payload_id}:${purpose}`),
      );
      data = JSON.parse(
        Buffer.concat([
          decipher.update(encrypted.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
    } catch {
      throw new HttpException(
        {
          code: "PAYLOAD_KEY_UNAVAILABLE",
          message: "原请求回执暂时无法读取，请稍后重试",
        },
        503,
      );
    }
    return {
      digest,
      receipt: { status: Number(record.response_status), data },
    };
  }

  async write(
    connection: SqlConnection,
    scope: ReceiptScope,
    digest: string,
    resource: string,
    response: CommandReceipt,
    resourceType = "PUBLISHER_PROFILE",
  ) {
    const key = await this.encryptionKey();
    const payloadId = randomUUID();
    const plaintext = Buffer.from(JSON.stringify(response.data));
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key.bytes, nonce);
    cipher.setAAD(Buffer.from(`${scope.owner}:${payloadId}:${purpose}`));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    await connection.query(
      `INSERT INTO travel.private_payloads(id,owner_user_id,purpose,key_version,ciphertext,content_hmac,size_bytes,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')`,
      [
        payloadId,
        scope.owner,
        purpose,
        key.version,
        Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
        createHmac("sha256", key.bytes).update(plaintext).digest("hex"),
        plaintext.length,
      ],
    );
    await connection.query(
      `INSERT INTO travel.idempotency_records(id,owner_user_id,method,route,key,request_digest,response_payload_id,response_status,resource_type,resource_id,expires_at)
      VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$9,$8,now()+interval '24 hours')`,
      [
        scope.owner,
        scope.method,
        scope.route,
        scope.key,
        digest,
        payloadId,
        response.status,
        resource,
        resourceType,
      ],
    );
  }
}
