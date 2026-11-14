import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService, SqlConnection } from "../database/database.service";
import { CurrentUser } from "../common/http";
import { CommandReceiptService } from "../common/command-receipt.service";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";
import { digest } from "../auth/auth.service";

const profileProjection = `u.id,u.display_name,u.status,u.revision::text,u.security_revision::text,u.updated_at,
  COALESCE(p.locale,'zh-CN') AS locale,COALESCE(p.timezone,'Asia/Shanghai') AS timezone,
  CASE WHEN u.email_normalized IS NULL THEN NULL ELSE left(split_part(u.email_normalized,'@',1),1)||'***@'||split_part(u.email_normalized,'@',2) END AS email_mask`;
const sessionProjection = `s.id,s.revision::text,s.client_summary,s.authenticated_at,s.last_seen_at,s.expires_at,s.revoked_at,(s.token_hash=$2) AS is_current`;
function invalid(
  path: string,
  rule: string,
  message: string,
  status = 422,
  code = "INVALID_REQUEST",
): never {
  throw new HttpException(
    { code, message, field_errors: [{ path, rule, message }] },
    status,
  );
}
function matchRevision(value: string | undefined, actual: unknown) {
  if (!value)
    invalid(
      "/headers/If-Match",
      "required",
      "请先加载最新资料",
      428,
      "PRECONDITION_REQUIRED",
    );
  const expected = value.replace(/^"([1-9]\d*)"$/, "$1");
  if (!/^[1-9]\d*$/.test(expected))
    invalid("/headers/If-Match", "format", "修订号无效");
  if (expected !== String(actual))
    invalid(
      "/headers/If-Match",
      "revision",
      "资料已变化，请加载最新资料后重新确认",
      412,
      "REVISION_CONFLICT",
    );
}
function object(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid("", "type", "请求正文应为JSON对象");
  return body as Record<string, unknown>;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly database: DatabaseService,
    private readonly receipts: CommandReceiptService,
    private readonly pagination: PaginationService,
  ) {}
  private unauthenticated(): never {
    throw new HttpException(
      { code: "UNAUTHENTICATED", message: "请使用有效账号重新登录" },
      401,
    );
  }
  private async lockAccount(
    connection: SqlConnection,
    owner: string,
    token: string,
  ) {
    const user = (
      await connection.query(
        "SELECT id,status,verified_at,revision::text,security_revision::text FROM travel.users WHERE id=$1 FOR UPDATE",
        [owner],
      )
    ).rows[0];
    if (!user || user.status !== "ACTIVE" || !user.verified_at)
      this.unauthenticated();
    const current = (
      await connection.query(
        `SELECT id FROM travel.auth_sessions WHERE owner_user_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>now()
      AND security_revision=$3 AND COALESCE(last_seen_at,authenticated_at)>now()-interval '30 minutes'`,
        [owner, digest(token), user.security_revision],
      )
    ).rows[0];
    if (!current) this.unauthenticated();
    return { user, current };
  }
  private async event(
    connection: SqlConnection,
    owner: string,
    requestId: string,
    change: {
      type: string;
      id: string;
      before?: unknown;
      after: unknown;
      action: string;
      summary: Record<string, unknown>;
    },
  ) {
    await connection.query(
      `INSERT INTO travel.audit_events(id,actor_user_id,subject_owner_user_id,action,target_type,target_id,before_revision,after_revision,request_id,outcome,summary)
      VALUES(gen_random_uuid(),$1,$1,$2,$3,$4,$5,$6,$7,'SUCCESS',$8)`,
      [
        owner,
        change.action,
        change.type,
        change.id,
        change.before || null,
        change.after,
        requestId,
        JSON.stringify(change.summary),
      ],
    );
    await connection.query(
      `INSERT INTO travel.outbox_events(id,owner_user_id,aggregate_type,aggregate_id,aggregate_revision,event_type,payload,request_id,occurred_at)
      VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now())`,
      [
        owner,
        change.type,
        change.id,
        change.after,
        change.action,
        JSON.stringify(change.summary),
        requestId,
      ],
    );
  }
  async get(
    actor: CurrentUser,
    token: string,
  ): Promise<Record<string, unknown>> {
    const row = (
      await this.database.query(
        `SELECT ${profileProjection},
      EXISTS(SELECT 1 FROM travel.management_role_grants g WHERE g.owner_user_id=u.id AND g.revoked_at IS NULL AND g.expires_at IS NULL AND 'access.manage'=ANY(g.capabilities))
      AND NOT EXISTS(SELECT 1 FROM travel.management_role_grants g JOIN travel.users other ON other.id=g.owner_user_id
        WHERE other.id<>u.id AND other.status='ACTIVE' AND other.verified_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at IS NULL AND 'access.manage'=ANY(g.capabilities)) AS is_last_access_manager,
      (SELECT jsonb_build_object('id',s.id,'revision',s.revision::text,'client_summary',s.client_summary,'authenticated_at',s.authenticated_at,'last_seen_at',s.last_seen_at,'expires_at',s.expires_at,'revoked_at',s.revoked_at,'is_current',true)
        FROM travel.auth_sessions s WHERE s.owner_user_id=u.id AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>now()
        AND s.security_revision=u.security_revision AND COALESCE(s.last_seen_at,s.authenticated_at)>now()-interval '30 minutes') AS current_session
      FROM travel.users u LEFT JOIN travel.user_preferences p ON p.owner_user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.verified_at IS NOT NULL`,
        [actor.id, digest(token)],
      )
    ).rows[0];
    if (!row || !row.current_session) this.unauthenticated();
    return { ...row, roles: actor.roles, capabilities: actor.capabilities };
  }
  async update(
    owner: string,
    token: string,
    body: unknown,
    key: string | undefined,
    revision: string | undefined,
    requestId: string,
  ) {
    if (!key?.trim())
      invalid("/headers/Idempotency-Key", "required", "请提供幂等请求标识");
    return this.database.transaction(async (connection) => {
      const { user } = await this.lockAccount(connection, owner, token);
      const scope = { owner, method: "PATCH", route: "/api/v1/me", key };
      const stored = await this.receipts.read(connection, scope, body);
      if (stored.receipt) return stored.receipt;
      const values = object(body),
        fields = Object.keys(values);
      if (!fields.length) invalid("", "minProperties", "请至少修改一项资料");
      const extra = fields.find(
        (field) => !["display_name", "locale", "timezone"].includes(field),
      );
      if (extra)
        invalid(
          `/${extra.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          "additionalProperties",
          "包含未支持的资料字段",
        );
      for (const field of fields)
        if (
          typeof values[field] !== "string" ||
          !(values[field] as string).trim() ||
          (values[field] as string).length > 120
        )
          invalid(`/${field}`, "length", "字段应为1至120位有效文字");
      const name = (values.display_name as string | undefined)?.trim();
      let locale = (values.locale as string | undefined)?.trim();
      let timezone = (values.timezone as string | undefined)?.trim();
      if (locale) {
        try {
          locale = Intl.getCanonicalLocales(locale)[0];
        } catch {
          invalid("/locale", "format", "语言标识无效");
        }
      }
      if (timezone) {
        try {
          timezone = new Intl.DateTimeFormat("en", {
            timeZone: timezone,
          }).resolvedOptions().timeZone;
        } catch {
          invalid("/timezone", "format", "时区标识无效");
        }
      }
      matchRevision(revision, user.revision);
      await connection.query(
        "UPDATE travel.users SET display_name=COALESCE($2,display_name) WHERE id=$1",
        [owner, name || null],
      );
      if (locale || timezone)
        await connection.query(
          `INSERT INTO travel.user_preferences(id,owner_user_id,locale,timezone)
        VALUES(gen_random_uuid(),$1,COALESCE($2,'zh-CN'),COALESCE($3,'Asia/Shanghai')) ON CONFLICT(owner_user_id)
        DO UPDATE SET locale=COALESCE($2,user_preferences.locale),timezone=COALESCE($3,user_preferences.timezone)`,
          [owner, locale || null, timezone || null],
        );
      const saved = (
        await connection.query(
          `SELECT u.id,u.display_name,u.revision::text,u.updated_at,COALESCE(p.locale,'zh-CN') AS locale,COALESCE(p.timezone,'Asia/Shanghai') AS timezone
        FROM travel.users u LEFT JOIN travel.user_preferences p ON p.owner_user_id=u.id WHERE u.id=$1`,
          [owner],
        )
      ).rows[0];
      await this.event(connection, owner, requestId, {
        type: "USER",
        id: owner,
        before: user.revision,
        after: saved.revision,
        action: "ACCOUNT_PROFILE_UPDATED",
        summary: { changed_fields: fields },
      });
      const result = { status: 200, data: saved };
      await this.receipts.write(
        connection,
        scope,
        stored.digest,
        owner,
        result,
        "USER",
      );
      return result;
    });
  }
  async sessions(owner: string, token: string, query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !["limit", "cursor"].includes(key)))
      invalidQuery("包含未支持的会话筛选参数");
    const size = query.limit === undefined ? "20" : query.limit;
    if (typeof size !== "string" || !/^(?:[1-9]\d?|100)$/.test(size))
      invalidQuery("limit应为1至100的整数");
    const limit = Number(size),
      scope = JSON.stringify([owner, "account-sessions", { limit }]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const rows = await this.database.query(
      `SELECT ${sessionProjection},to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM travel.auth_sessions s JOIN travel.users u ON u.id=s.owner_user_id
      WHERE s.owner_user_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.security_revision=u.security_revision
      AND COALESCE(s.last_seen_at,s.authenticated_at)>now()-interval '30 minutes'
      AND ($3::timestamptz IS NULL OR (s.created_at,s.id)<($3,$4::uuid)) ORDER BY s.created_at DESC,s.id DESC LIMIT $5`,
      [
        owner,
        digest(token),
        cursor?.created_at || null,
        cursor?.id || null,
        limit + 1,
      ],
    );
    return this.pagination.page(scope, rows.rows, limit);
  }
  async revoke(
    owner: string,
    token: string,
    id: string,
    body: unknown,
    key: string | undefined,
    revision: string | undefined,
    requestId: string,
    activity?: { id: string; revision: string },
  ) {
    if (!key?.trim())
      invalid("/headers/Idempotency-Key", "required", "请提供幂等请求标识");
    if (id !== "others" && !uuidPattern.test(id))
      throw new HttpException(
        { code: "NOT_FOUND", message: "会话不存在或已失效" },
        404,
      );
    return this.database.transaction(async (connection) => {
      const { user, current } = await this.lockAccount(
        connection,
        owner,
        token,
      );
      const scope = {
        owner,
        method: "DELETE",
        route: `/api/v1/me/sessions/${id}`,
        key,
      };
      const values = body === undefined ? {} : body;
      const stored = await this.receipts.read(connection, scope, values);
      if (stored.receipt) return stored.receipt;
      if (Object.keys(object(values)).length)
        invalid("", "additionalProperties", "撤销会话不接受正文参数");
      let data: Record<string, unknown>;
      if (id === "others") {
        const changed = (
          await connection.query(
            `WITH changed AS(UPDATE travel.auth_sessions SET revoked_at=now()
          WHERE owner_user_id=$1 AND id<>$2 AND revoked_at IS NULL AND expires_at>now() AND security_revision=$3
          AND COALESCE(last_seen_at,authenticated_at)>now()-interval '30 minutes' RETURNING id) SELECT count(*)::text AS revoked_count FROM changed`,
            [owner, current.id, user.security_revision],
          )
        ).rows[0];
        const updated = (
          await connection.query(
            "UPDATE travel.users SET display_name=display_name WHERE id=$1 RETURNING revision::text",
            [owner],
          )
        ).rows[0];
        data = {
          revoked_count: changed.revoked_count,
          current_session_id: current.id,
          revision: updated.revision,
        };
        await this.event(connection, owner, requestId, {
          type: "USER",
          id: owner,
          before: user.revision,
          after: updated.revision,
          action: "OTHER_SESSIONS_REVOKED",
          summary: { revoked_count: changed.revoked_count },
        });
      } else {
        const previous = (
          await connection.query(
            "SELECT id,revision::text FROM travel.auth_sessions WHERE owner_user_id=$1 AND id=$2 FOR UPDATE",
            [owner, id],
          )
        ).rows[0];
        if (!previous)
          throw new HttpException(
            { code: "NOT_FOUND", message: "会话不存在或已失效" },
            404,
          );
        const expected =
          activity?.id === id &&
          BigInt(String(previous.revision)) === BigInt(activity.revision) + 1n
            ? activity.revision
            : previous.revision;
        matchRevision(revision, expected);
        const saved = (
          await connection.query(
            "UPDATE travel.auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING revision::text",
            [id],
          )
        ).rows[0];
        data = {
          id,
          revoked: true,
          was_current: id === current.id,
          revision: saved.revision,
        };
        await this.event(connection, owner, requestId, {
          type: "AUTH_SESSION",
          id,
          before: previous.revision,
          after: saved.revision,
          action: "SESSION_REVOKED",
          summary: { was_current: data.was_current },
        });
      }
      const result = { status: 200, data };
      await this.receipts.write(
        connection,
        scope,
        stored.digest,
        id === "others" ? owner : id,
        result,
        id === "others" ? "USER" : "AUTH_SESSION",
      );
      return result;
    });
  }
  async logout(owner: string, token: string, requestId: string) {
    await this.database.transaction(async (connection) => {
      const { current } = await this.lockAccount(connection, owner, token);
      const saved = (
        await connection.query(
          "UPDATE travel.auth_sessions SET revoked_at=now() WHERE id=$1 RETURNING revision::text",
          [current.id],
        )
      ).rows[0];
      await this.event(connection, owner, requestId, {
        type: "AUTH_SESSION",
        id: String(current.id),
        after: saved.revision,
        action: "SESSION_LOGGED_OUT",
        summary: { is_current: true },
      });
    });
  }
}
