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
const channelStates = [
  "UNVERIFIED",
  "MONITOR_ONLY",
  "BOOKING_SUPPORTED",
  "DEGRADED",
  "DISABLED",
];
const literalPattern = (value: string) =>
  `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const evidencePresent = (alias: string) =>
  `COALESCE(${alias}.evidence NOT IN ('null'::jsonb,'{}'::jsonb,'[]'::jsonb),false)`;
function referenceId(value: unknown, name: string) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !uuidPattern.test(value))
    invalidQuery(`${name}应为UUID`);
  return value.toLowerCase();
}
function enabledFilter(value: unknown) {
  if (value === undefined) return null;
  if (value !== "true" && value !== "false")
    invalidQuery("enabled应为true或false");
  return value === "true";
}
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
    const pattern = literalPattern(options.q);
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
      ["view", "attraction_id"],
    );
    const attractionId = referenceId(query.attraction_id, "attraction_id");
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-catalog",
      view,
      options,
      attractionId,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const pattern = literalPattern(options.q);
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
      ) AND ($6::uuid IS NULL OR EXISTS(
        SELECT 1 FROM travel.attraction_service_links l
        JOIN travel.channels lc ON lc.id=l.channel_id AND lc.attraction_id=l.attraction_id
        WHERE l.attraction_id=$6::uuid AND l.service_id=s.id AND l.owner_user_id=s.owner_user_id
      )) AND ($3::uuid IS NULL OR (s.created_at,s.id)<($4::timestamptz,$3::uuid))
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
      ) AND ($6::uuid IS NULL OR EXISTS(
        SELECT 1 FROM travel.attraction_service_links l
        JOIN travel.channels lc ON lc.id=l.channel_id AND lc.attraction_id=l.attraction_id
        JOIN travel.service_releases lr ON lr.service_id=l.service_id AND lr.owner_user_id=l.owner_user_id
        WHERE l.attraction_id=$6::uuid AND lr.script_version_id=sv.id AND lr.owner_user_id=sv.owner_user_id
      )) AND ($3::uuid IS NULL OR (sv.created_at,sv.id)<($4::timestamptz,$3::uuid))
      ORDER BY sv.created_at DESC,sv.id DESC LIMIT $5`,
      [
        options.status || null,
        pattern,
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
        attractionId,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async cities(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "catalog.manage");
    const options = this.options(query, [], ["enabled"]);
    const enabled = enabledFilter(query.enabled);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-cities",
      options,
      enabled,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT c.id,c.code,c.name,c.enabled,c.revision::text,c.created_at,
        (SELECT count(*)::text FROM travel.attractions a WHERE a.city_id=c.id) AS attraction_count,
        ${cursorProjection("c")}
      FROM travel.cities c WHERE ($1::boolean IS NULL OR c.enabled=$1) AND (
        c.name ILIKE $2 ESCAPE '\\' OR c.code ILIKE $2 ESCAPE '\\' OR c.id::text ILIKE $2 ESCAPE '\\'
      ) AND ($3::uuid IS NULL OR (c.created_at,c.id)<($4::timestamptz,$3::uuid))
      ORDER BY c.created_at DESC,c.id DESC LIMIT $5`,
      [
        enabled,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async attractions(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "catalog.manage");
    const options = this.options(query, [], ["enabled", "city_id"]);
    const enabled = enabledFilter(query.enabled),
      cityId = referenceId(query.city_id, "city_id");
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-attractions",
      options,
      enabled,
      cityId,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT a.id,a.city_id,a.name,a.description,a.timezone,a.enabled,a.ticket_price_kind,a.revision::text,a.created_at,
        c.name AS city_name,c.enabled AS city_enabled,
        (SELECT count(*)::text FROM travel.channels ch WHERE ch.attraction_id=a.id) AS channel_count,
        (SELECT count(DISTINCT r.source_url)::text FROM travel.channels ch
          JOIN travel.channel_rule_versions r ON r.id=ch.current_rule_version_id AND r.channel_id=ch.id
          WHERE ch.attraction_id=a.id AND length(trim(r.source_url))>0) AS rule_source_count,
        (SELECT count(DISTINCT s.id)::text FROM travel.attraction_service_links l
          JOIN travel.services s ON s.id=l.service_id AND s.owner_user_id=l.owner_user_id
          JOIN travel.channels ch ON ch.id=l.channel_id AND ch.attraction_id=l.attraction_id
          WHERE l.attraction_id=a.id) AS linked_service_count,
        ${cursorProjection("a")}
      FROM travel.attractions a JOIN travel.cities c ON c.id=a.city_id
      WHERE ($1::uuid IS NULL OR a.city_id=$1) AND ($2::boolean IS NULL OR a.enabled=$2) AND (
        a.name ILIKE $3 ESCAPE '\\' OR a.id::text ILIKE $3 ESCAPE '\\'
      ) AND ($4::uuid IS NULL OR (a.created_at,a.id)<($5::timestamptz,$4::uuid))
      ORDER BY a.created_at DESC,a.id DESC LIMIT $6`,
      [
        cityId,
        enabled,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async channels(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "catalog.manage");
    const options = this.options(query, channelStates, ["attraction_id"]);
    const attractionId = referenceId(query.attraction_id, "attraction_id");
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-channels",
      options,
      attractionId,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT ch.id,ch.attraction_id,ch.name,ch.official_url,ch.timezone,ch.adapter_status,ch.revision::text,ch.created_at,
        a.name AS attraction_name,a.city_id,ch.current_rule_version_id,
        r.version AS rule_version,r.source_url,r.verified_at,${evidencePresent("r")} AS has_evidence,
        CASE WHEN ch.current_rule_version_id IS NULL THEN 'UNBOUND'
          WHEN r.id IS NULL THEN 'INVALID' ELSE 'BOUND' END AS rule_binding_state,
        ${cursorProjection("ch")}
      FROM travel.channels ch JOIN travel.attractions a ON a.id=ch.attraction_id
      LEFT JOIN travel.channel_rule_versions r ON r.id=ch.current_rule_version_id AND r.channel_id=ch.id
      WHERE ($1::uuid IS NULL OR ch.attraction_id=$1) AND ($2::text IS NULL OR ch.adapter_status=$2) AND (
        ch.name ILIKE $3 ESCAPE '\\' OR ch.id::text ILIKE $3 ESCAPE '\\' OR a.name ILIKE $3 ESCAPE '\\'
      ) AND ($4::uuid IS NULL OR (ch.created_at,ch.id)<($5::timestamptz,$4::uuid))
      ORDER BY ch.created_at DESC,ch.id DESC LIMIT $6`,
      [
        attractionId,
        options.status || null,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async channelRules(
    actor: CurrentUser,
    id: string,
    query: Record<string, unknown>,
  ) {
    this.authorize(actor, "catalog.manage");
    if (!uuidPattern.test(id)) invalidQuery("渠道编号无效");
    if (Object.keys(query).some((key) => !["limit", "cursor"].includes(key)))
      invalidQuery("规则查询仅支持limit和cursor");
    const { limit } = this.options(query, []);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-channel-rules",
      id.toLowerCase(),
      limit,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      WITH channel AS MATERIALIZED (SELECT id,current_rule_version_id FROM travel.channels WHERE id=$1::uuid),
      page_rows AS (
        SELECT r.id,r.channel_id,r.version,r.revision::text,r.created_at,r.source_url,r.verified_at,
          ${evidencePresent("r")} AS has_evidence,
          COALESCE(r.id=(SELECT current_rule_version_id FROM channel),false) AS is_current,${cursorProjection("r")}
        FROM travel.channel_rule_versions r WHERE r.channel_id=$1::uuid
          AND ($2::uuid IS NULL OR (r.created_at,r.id)<($3::timestamptz,$2::uuid))
        ORDER BY r.created_at DESC,r.id DESC LIMIT $4
      )
      SELECT EXISTS(SELECT 1 FROM channel) AS channel_exists,
        COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb) AS versions`,
      [
        id.toLowerCase(),
        cursor?.id || null,
        cursor?.created_at || null,
        limit + 1,
      ],
    );
    if (!result.rows[0].channel_exists)
      throw new HttpException(
        { code: "NOT_FOUND", message: "渠道不存在或已失效" },
        404,
      );
    return this.pagination.page(
      scope,
      result.rows[0].versions as DatabaseRow[],
      limit,
    );
  }
}
