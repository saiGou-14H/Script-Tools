import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService, DatabaseRow } from "../database/database.service";
import { CurrentUser } from "../common/http";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";

const userStates = ["UNVERIFIED", "ACTIVE", "FROZEN", "CLOSING", "CLOSED"];
const serviceStates = ["DRAFT", "ACTIVE", "PAUSED", "RETIRED", "BLOCKED"];
const versionStates = ["DRAFT", "SEALED", "READY", "RETIRED", "REVOKED"];
const cursorProjection = (alias: string) =>
  `to_char(${alias}.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at`;
const accountMask = (alias: string) => `'u****'||right(${alias}.id::text,4)`;
const nameMask = (alias: string) =>
  `CASE WHEN length(${alias}.display_name)=0 THEN '未命名' ELSE left(${alias}.display_name,1)||'**' END`;
const entitlementCount = (predicate: string) => `(
  SELECT count(*)::text FROM travel.entitlements e
  JOIN travel.service_orders o ON o.id=e.order_id AND o.owner_user_id=e.owner_user_id AND o.service_release_id=e.service_release_id
  JOIN travel.service_releases er ON er.id=o.service_release_id AND er.owner_user_id=o.publisher_id
  WHERE ${predicate} AND e.status IN ('PENDING','ACTIVE','RESERVED')
    AND e.revoked_at IS NULL AND (e.status='RESERVED' OR e.valid_until>now())
)`;

@Injectable()
export class AdminMetadataService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pagination: PaginationService,
  ) {}

  private authorize(actor: CurrentUser, capability: string) {
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.capabilities.includes(capability)
    )
      throw new HttpException(
        { code: "ACCESS_SCOPE_DENIED", message: "当前账号无权查询后台元数据" },
        403,
      );
  }

  private options(
    query: Record<string, unknown>,
    states: string[],
    extra: string[] = [],
  ) {
    if (
      Object.keys(query).some(
        (key) => !["q", "status", "limit", "cursor", ...extra].includes(key),
      )
    )
      invalidQuery("查询参数无效");
    const q = query.q === undefined ? "" : query.q;
    if (typeof q !== "string" || q.length > 200)
      invalidQuery("q应为不超过200字的字符串");
    if (
      query.status !== undefined &&
      (typeof query.status !== "string" || !states.includes(query.status))
    )
      invalidQuery("状态筛选无效");
    const size = query.limit === undefined ? "20" : query.limit;
    if (typeof size !== "string" || !/^(?:[1-9]\d?|100)$/.test(size))
      invalidQuery("limit应为1至100的整数");
    return {
      q: q.trim(),
      status: query.status as string | undefined,
      limit: Number(size),
    };
  }

  async users(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "user.manage");
    const options = this.options(query, userStates);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-users",
      options,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const pattern = `%${options.q.replace(/[\\%_]/g, "\\$&")}%`;
    const result = await this.database.query(
      `
      WITH access_managers AS MATERIALIZED (
        SELECT DISTINCT g.owner_user_id FROM travel.management_role_grants g
        JOIN travel.users manager ON manager.id=g.owner_user_id
        WHERE manager.status='ACTIVE' AND manager.verified_at IS NOT NULL
          AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
          AND 'access.manage'=ANY(g.capabilities)
      )
      SELECT u.id,${nameMask("u")} AS display_name_mask,${accountMask("u")} AS account_mask,
        u.status,u.revision::text,u.created_at,
        EXISTS(SELECT 1 FROM travel.publisher_profiles p WHERE p.owner_user_id=u.id AND p.enabled) AS publisher,
        (u.id=$1::uuid) AS is_current,
        ((SELECT count(*) FROM access_managers)=1 AND u.id IN (SELECT owner_user_id FROM access_managers)) AS is_last_access_manager,
        (SELECT count(DISTINCT q.resource_key)::text FROM travel.quota_accounts q
          WHERE q.scope='USER' AND q.scope_key=u.id::text AND q.window_start<=now()) AS quota_resource_count,
        (SELECT count(*)::text FROM travel.service_orders o
          WHERE (o.owner_user_id=u.id OR o.publisher_id=u.id) AND o.status IN ('AWAITING_PAYMENT','ACTIVE')) AS open_order_count,
        ${cursorProjection("u")}
      FROM travel.users u
      WHERE ($2::text IS NULL OR u.status=$2) AND (
        u.display_name ILIKE $3 ESCAPE '\\' OR u.email_normalized ILIKE $3 ESCAPE '\\'
        OR u.id::text ILIKE $3 ESCAPE '\\' OR (${accountMask("u")}) ILIKE $3 ESCAPE '\\'
      ) AND ($4::uuid IS NULL OR (u.created_at,u.id)<($5::timestamptz,$4::uuid))
      ORDER BY u.created_at DESC,u.id DESC LIMIT $6`,
      [
        actor.id,
        options.status || null,
        pattern,
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async quotas(actor: CurrentUser, id: string, query: Record<string, unknown>) {
    this.authorize(actor, "user.manage");
    if (!uuidPattern.test(id)) invalidQuery("账号编号无效");
    if (Object.keys(query).some((key) => !["limit", "cursor"].includes(key)))
      invalidQuery("配额查询仅支持limit和cursor");
    const { limit } = this.options(query, []);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-quotas",
      id.toLowerCase(),
      limit,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      WITH account AS MATERIALIZED (SELECT id FROM travel.users WHERE id=$1::uuid),
      latest AS (
        SELECT DISTINCT ON (resource_key) id,created_at,revision,resource_key,window_start,
          limit_amount,reserved_amount,consumed_amount
        FROM travel.quota_accounts WHERE scope='USER' AND scope_key=$1::text
          AND window_start<=now() AND EXISTS(SELECT 1 FROM account)
        ORDER BY resource_key,window_start DESC,id DESC
      ), page_rows AS (
        SELECT q.id,q.created_at,q.revision::text,q.resource_key,q.window_start,q.limit_amount::text,
          q.reserved_amount::text,q.consumed_amount::text,
          (q.limit_amount-q.reserved_amount-q.consumed_amount)::text AS available_amount,
          ${cursorProjection("q")}
        FROM latest q WHERE ($2::uuid IS NULL OR (q.created_at,q.id)<($3::timestamptz,$2::uuid))
        ORDER BY q.created_at DESC,q.id DESC LIMIT $4
      )
      SELECT EXISTS(SELECT 1 FROM account) AS account_exists,
        COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb) AS resources`,
      [
        id.toLowerCase(),
        cursor?.id || null,
        cursor?.created_at || null,
        limit + 1,
      ],
    );
    if (!result.rows[0].account_exists)
      throw new HttpException(
        { code: "NOT_FOUND", message: "账号不存在或已失效" },
        404,
      );
    return this.pagination.page(
      scope,
      result.rows[0].resources as DatabaseRow[],
      limit,
    );
  }

  async catalog(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "catalog.manage");
    const view = query.view === undefined ? "services" : query.view;
    if (view !== "services" && view !== "versions")
      invalidQuery("view应为services或versions");
    const options = this.options(
      query,
      view === "services" ? serviceStates : versionStates,
      ["view"],
    );
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-catalog",
      view,
      options,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const pattern = `%${options.q.replace(/[\\%_]/g, "\\$&")}%`;
    const result = await this.database.query(
      view === "services"
        ? `
      SELECT s.id,'service' AS kind,s.title,s.owner_user_id,s.status,s.revision::text,s.created_at,
        COALESCE(p.public_name,${nameMask("u")}) AS publisher,
        r.id AS release_id,r.script_version_id,sv.script_id,sv.version,sv.content_status,
        d.status AS deployment_status,
        COALESCE(r.delivery_policy->'development_fixture'='true'::jsonb,false) AS development_fixture,
        ${entitlementCount("er.service_id=s.id")} AS entitlement_count,
        ${cursorProjection("s")}
      FROM travel.services s JOIN travel.users u ON u.id=s.owner_user_id
      LEFT JOIN travel.publisher_profiles p ON p.owner_user_id=s.owner_user_id
      LEFT JOIN travel.service_releases r ON r.id=s.current_release_id AND r.service_id=s.id AND r.owner_user_id=s.owner_user_id
      LEFT JOIN travel.script_versions sv ON sv.id=r.script_version_id AND sv.owner_user_id=s.owner_user_id
      LEFT JOIN travel.deployments d ON d.id=r.deployment_id AND d.owner_user_id=s.owner_user_id
      WHERE ($1::text IS NULL OR s.status=$1) AND (
        s.title ILIKE $2 ESCAPE '\\' OR s.id::text ILIKE $2 ESCAPE '\\'
        OR p.public_name ILIKE $2 ESCAPE '\\' OR (${accountMask("u")}) ILIKE $2 ESCAPE '\\'
      ) AND ($3::uuid IS NULL OR (s.created_at,s.id)<($4::timestamptz,$3::uuid))
      ORDER BY s.created_at DESC,s.id DESC LIMIT $5`
        : `
      SELECT sv.id,'script_version' AS kind,sc.name AS title,sv.owner_user_id,
        sv.content_status AS status,sv.revision::text,sv.created_at,
        COALESCE(p.public_name,${nameMask("u")}) AS publisher,
        NULL::uuid AS release_id,sv.id AS script_version_id,sv.script_id,sv.version,sv.content_status,
        NULL::text AS deployment_status,false AS development_fixture,
        ${entitlementCount("er.script_version_id=sv.id")} AS entitlement_count,
        ${cursorProjection("sv")}
      FROM travel.script_versions sv JOIN travel.scripts sc ON sc.id=sv.script_id AND sc.owner_user_id=sv.owner_user_id
      JOIN travel.users u ON u.id=sv.owner_user_id
      LEFT JOIN travel.publisher_profiles p ON p.owner_user_id=sv.owner_user_id
      WHERE ($1::text IS NULL OR sv.content_status=$1) AND (
        sc.name ILIKE $2 ESCAPE '\\' OR sv.version ILIKE $2 ESCAPE '\\'
        OR sv.id::text ILIKE $2 ESCAPE '\\' OR p.public_name ILIKE $2 ESCAPE '\\'
        OR (${accountMask("u")}) ILIKE $2 ESCAPE '\\'
      ) AND ($3::uuid IS NULL OR (sv.created_at,sv.id)<($4::timestamptz,$3::uuid))
      ORDER BY sv.created_at DESC,sv.id DESC LIMIT $5`,
      [
        options.status || null,
        pattern,
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }
}
