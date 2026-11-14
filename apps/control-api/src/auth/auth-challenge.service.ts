import { HttpException, Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseService, SqlConnection } from "../database/database.service";
import { hashPassword } from "../database/seed.service";
import { loadDevelopmentKey } from "../common/development-key";

const challengeSeconds = 600;
const attemptLimit = 5;
const termsVersion = "V3.0";
type Purpose = "VERIFY_EMAIL" | "RESET_PASSWORD";
interface RegistrationPayload {
  email: string;
  password_hash: string;
  accepted_terms_version: string;
}
function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function emailAddress(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new HttpException(
      { code: "INVALID_REQUEST", message: "请输入有效的邮箱地址" },
      422,
    );
  return value.trim().toLowerCase();
}
function passwordHash(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 1024)
    throw new HttpException(
      { code: "INVALID_REQUEST", message: "密码长度应为8至1024位" },
      422,
    );
  return hashPassword(value);
}

@Injectable()
export class AuthChallengeService {
  private keyPromise?: Promise<Buffer>;
  private readonly requestWindows = new Map<
    string,
    { started: number; count: number }
  >();
  constructor(private readonly database: DatabaseService) {}

  private requireDevelopmentDelivery(client: string) {
    if (
      process.env.DEV_SEED !== "true" ||
      process.env.NODE_ENV === "production"
    )
      throw new HttpException(
        { code: "AUTH_DELIVERY_UNAVAILABLE", message: "验证邮件服务尚未接入" },
        503,
      );
    const now = Date.now();
    for (const [key, value] of this.requestWindows) {
      if (now - value.started >= 60000) this.requestWindows.delete(key);
    }
    const window = this.requestWindows.get(client) || {
      started: now,
      count: 0,
    };
    if (
      window.count >= 60 ||
      (!this.requestWindows.has(client) && this.requestWindows.size >= 10000)
    )
      throw new HttpException(
        { code: "RATE_LIMITED", message: "验证请求较频繁，请稍后重试" },
        429,
      );
    window.count += 1;
    this.requestWindows.set(client, window);
  }
  private localKey() {
    this.keyPromise ||= loadDevelopmentKey(this.database.root);
    return this.keyPromise;
  }
  private async audit(
    connection: SqlConnection,
    owner: string,
    action: string,
    target: string,
    requestId: string,
    summary: Record<string, unknown>,
  ) {
    await connection.query(
      `INSERT INTO travel.audit_events(id,actor_service,subject_owner_user_id,action,target_type,target_id,request_id,outcome,summary)
       VALUES(gen_random_uuid(),'identity',$1,$2,'AUTH_CHALLENGE',$3,$4,'SUCCESS',$5)`,
      [owner, action, target, requestId, JSON.stringify(summary)],
    );
  }
  private async event(
    connection: SqlConnection,
    owner: string,
    challenge: string,
    purpose: Purpose,
    requestId: string,
  ) {
    await connection.query(
      `INSERT INTO travel.outbox_events(id,owner_user_id,aggregate_type,aggregate_id,aggregate_revision,event_type,payload,request_id,occurred_at)
       VALUES(gen_random_uuid(),$1,'AUTH_CHALLENGE',$2,1,'AUTH_CHALLENGE_CREATED',$3,$4,now())`,
      [
        owner,
        challenge,
        JSON.stringify({
          challenge_id: challenge,
          purpose,
          delivery_mode: "DEVELOPMENT_PREVIEW",
        }),
        requestId,
      ],
    );
  }

  async request(
    purpose: Purpose,
    body: Record<string, unknown>,
    requestId: string,
    client: string,
  ) {
    this.requireDevelopmentDelivery(client);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "请输入有效的验证请求" },
        422,
      );
    const email = emailAddress(body.email);
    const registering = purpose === "VERIFY_EMAIL";
    if (registering && body.accepted_terms_version !== termsVersion)
      throw new HttpException(
        { code: "TERMS_REQUIRED", message: "请阅读并同意当前服务条款" },
        422,
      );
    const password = registering ? passwordHash(body.password) : undefined;
    const key = registering ? await this.localKey() : undefined;
    const challenge = randomUUID();
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + challengeSeconds * 1000);
    await this.database.transaction(async (connection) => {
      if (registering) {
        await connection.query(
          `INSERT INTO travel.users(id,email_normalized,password_hash,display_name)
           VALUES(gen_random_uuid(),$1,$2,$3) ON CONFLICT (email_normalized) WHERE status <> 'CLOSED' DO NOTHING`,
          [email, password, email.split("@")[0].slice(0, 40)],
        );
      }
      const user = (
        await connection.query(
          "SELECT id,status,verified_at FROM travel.users WHERE email_normalized=$1 AND status <> 'CLOSED' FOR UPDATE",
          [email],
        )
      ).rows[0];
      if (
        !user ||
        (registering
          ? user.status !== "UNVERIFIED"
          : user.status !== "ACTIVE" || !user.verified_at)
      )
        return;
      const count = (
        await connection.query(
          "SELECT count(*)::int AS count FROM travel.auth_challenges WHERE owner_user_id=$1 AND created_at>now()-interval '1 hour'",
          [user.id],
        )
      ).rows[0];
      if (Number(count.count) >= 10) return;
      let payloadId: string | null = null;
      if (registering) {
        const plaintext = Buffer.from(
          JSON.stringify({
            email,
            password_hash: password,
            accepted_terms_version: termsVersion,
          }),
        );
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key!, nonce);
        cipher.setAAD(Buffer.from(`${user.id}:${challenge}`));
        const ciphertext = Buffer.concat([
          cipher.update(plaintext),
          cipher.final(),
        ]);
        payloadId = randomUUID();
        await connection.query(
          `INSERT INTO travel.private_payloads(id,owner_user_id,purpose,key_version,ciphertext,content_hmac,size_bytes,expires_at)
           VALUES($1,$2,'AUTH_REGISTRATION','development-auth-1',$3,$4,$5,$6)`,
          [
            payloadId,
            user.id,
            Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
            createHmac("sha256", key!).update(plaintext).digest("hex"),
            plaintext.length,
            expires,
          ],
        );
      }
      await connection.query(
        `INSERT INTO travel.auth_challenges(id,owner_user_id,purpose,token_hash,target_payload_id,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,
        [challenge, user.id, purpose, tokenDigest(token), payloadId, expires],
      );
      await this.event(
        connection,
        String(user.id),
        challenge,
        purpose,
        requestId,
      );
      await this.audit(
        connection,
        String(user.id),
        "AUTH_CHALLENGE_REQUESTED",
        challenge,
        requestId,
        {
          purpose,
          ...(registering ? { accepted_terms_version: termsVersion } : {}),
        },
      );
    });
    return {
      challenge_id: challenge,
      expires_at: expires.toISOString(),
      delivery_status: "DEVELOPMENT_PREVIEW",
      development_token: token,
    };
  }

  async consume(
    purpose: Purpose,
    body: Record<string, unknown>,
    requestId: string,
    client: string,
  ) {
    this.requireDevelopmentDelivery(client);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "请输入有效的验证请求" },
        422,
      );
    if (
      typeof body.challenge_id !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.challenge_id) ||
      typeof body.token !== "string" ||
      body.token.length > 512
    )
      throw new HttpException(
        { code: "INVALID_CHALLENGE", message: "验证请求或令牌无效" },
        422,
      );
    const password =
      purpose === "RESET_PASSWORD"
        ? passwordHash(body.new_password)
        : undefined;
    const key = purpose === "VERIFY_EMAIL" ? await this.localKey() : undefined;
    const success = await this.database.transaction(async (connection) => {
      const candidate = (
        await connection.query(
          "SELECT owner_user_id FROM travel.auth_challenges WHERE id=$1 AND purpose=$2",
          [body.challenge_id, purpose],
        )
      ).rows[0];
      if (!candidate) return false;
      const user = (
        await connection.query(
          "SELECT id,status,email_normalized FROM travel.users WHERE id=$1 FOR UPDATE",
          [candidate.owner_user_id],
        )
      ).rows[0];
      const challenge = (
        await connection.query(
          "SELECT *,expires_at>now() AS valid_time FROM travel.auth_challenges WHERE id=$1 AND purpose=$2 FOR UPDATE",
          [body.challenge_id, purpose],
        )
      ).rows[0];
      if (
        !user ||
        !challenge ||
        challenge.consumed_at ||
        !challenge.valid_time ||
        Number(challenge.attempts) >= attemptLimit
      )
        return false;
      const actual = Buffer.from(tokenDigest(body.token as string), "hex");
      const expected = Buffer.from(String(challenge.token_hash), "hex");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(actual, expected)
      ) {
        await connection.query(
          "UPDATE travel.auth_challenges SET attempts=attempts+1,revision=revision+1,updated_at=now() WHERE id=$1",
          [body.challenge_id],
        );
        return false;
      }
      if (purpose === "VERIFY_EMAIL") {
        if (user.status !== "UNVERIFIED") return false;
        const payload = (
          await connection.query(
            "SELECT ciphertext FROM travel.private_payloads WHERE id=$1 AND owner_user_id=$2 AND purpose='AUTH_REGISTRATION' AND deleted_at IS NULL AND expires_at>now()",
            [challenge.target_payload_id, user.id],
          )
        ).rows[0];
        if (!payload) return false;
        const encrypted = Buffer.from(payload.ciphertext as Uint8Array);
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key!,
          encrypted.subarray(0, 12),
        );
        decipher.setAuthTag(encrypted.subarray(12, 28));
        decipher.setAAD(Buffer.from(`${user.id}:${body.challenge_id}`));
        const registration = JSON.parse(
          Buffer.concat([
            decipher.update(encrypted.subarray(28)),
            decipher.final(),
          ]).toString(),
        ) as RegistrationPayload;
        if (registration.email !== user.email_normalized) return false;
        await connection.query(
          "UPDATE travel.users SET password_hash=$2,status='ACTIVE',verified_at=now(),revision=revision+1,updated_at=now() WHERE id=$1",
          [user.id, registration.password_hash],
        );
        await connection.query(
          "INSERT INTO travel.user_preferences(id,owner_user_id) VALUES(gen_random_uuid(),$1) ON CONFLICT (owner_user_id) DO NOTHING",
          [user.id],
        );
      } else {
        if (user.status !== "ACTIVE") return false;
        await connection.query(
          "UPDATE travel.users SET password_hash=$2,security_revision=security_revision+1,revision=revision+1,updated_at=now() WHERE id=$1",
          [user.id, password],
        );
        await connection.query(
          "UPDATE travel.auth_sessions SET revoked_at=now(),updated_at=now(),revision=revision+1 WHERE owner_user_id=$1 AND revoked_at IS NULL",
          [user.id],
        );
      }
      const consumed = await connection.query(
        "UPDATE travel.auth_challenges SET consumed_at=now(),revision=revision+1,updated_at=now() WHERE owner_user_id=$1 AND consumed_at IS NULL AND ($2='RESET_PASSWORD' OR purpose='VERIFY_EMAIL') RETURNING id,revision",
        [user.id, purpose],
      );
      await connection.query(
        `UPDATE travel.private_payloads SET ciphertext=NULL,deleted_at=now(),revision=revision+1,updated_at=now()
         WHERE owner_user_id=$1 AND purpose='AUTH_REGISTRATION' AND deleted_at IS NULL
         AND id IN (SELECT target_payload_id FROM travel.auth_challenges WHERE owner_user_id=$1 AND consumed_at IS NOT NULL)`,
        [user.id],
      );
      await this.audit(
        connection,
        String(user.id),
        purpose === "VERIFY_EMAIL" ? "EMAIL_VERIFIED" : "PASSWORD_RESET",
        String(body.challenge_id),
        requestId,
        { purpose },
      );
      await connection.query(
        `INSERT INTO travel.outbox_events(id,owner_user_id,aggregate_type,aggregate_id,aggregate_revision,event_type,payload,request_id,occurred_at)
         VALUES(gen_random_uuid(),$1,'AUTH_CHALLENGE',$2,$3,$4,$5,$6,now())`,
        [
          user.id,
          body.challenge_id,
          consumed.rows.find((row) => row.id === body.challenge_id)!.revision,
          purpose === "VERIFY_EMAIL" ? "EMAIL_VERIFIED" : "PASSWORD_RESET",
          JSON.stringify({ owner_user_id: user.id, purpose }),
          requestId,
        ],
      );
      return true;
    });
    if (!success)
      throw new HttpException(
        {
          code: "INVALID_CHALLENGE",
          message: "验证请求已失效或令牌不正确，请重新申请",
        },
        422,
      );
    return purpose === "VERIFY_EMAIL"
      ? { verified: true }
      : { reset: true, sessions_revoked: true };
  }
}
