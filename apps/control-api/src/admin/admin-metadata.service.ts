import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService, DatabaseRow } from "../database/database.service";
import { CurrentUser } from "../common/http";
import { parseQueryDate } from "../common/query-date";
import { randomUUID } from "node:crypto";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";

const userStates = ["UNVERIFIED", "ACTIVE", "FROZEN", "CLOSING", "CLOSED"];
const serviceStates = ["DRAFT", "ACTIVE", "PAUSED", "RETIRED", "BLOCKED"];
const versionStates = ["DRAFT", "SEALED", "READY", "RETIRED", "REVOKED"];
const nodeStates = [
  "REGISTERING",
  "ONLINE",
  "DRAINING",
  "OFFLINE",
  "QUARANTINED",
];
const imageStates = ["DRAFT", "READY", "RETIRED", "REVOKED"];
const executionModes = ["docker", "qemu_kvm", "qemu_tcg"];
const executionLeaseRows = `
  SELECT l.id,a.node_id,a.actual_execution_mode,
    (l.revoked_at IS NULL AND l.expires_at>now()
      AND a.status IN ('CREATED','PREPARING','RUNNING','STOPPING')
      AND r.status IN ('PREPARING','READY','RUNNING','STOPPING','WAITING_INPUT','RECONCILING')) AS active,
    (l.revoked_at IS NULL AND l.expires_at<=now()) AS expired_unrevoked
  FROM travel.execution_leases l
  JOIN travel.attempts a ON a.id=l.attempt_id AND a.owner_user_id=l.owner_user_id
    AND a.run_id=l.run_id AND a.lease_generation=l.generation
  JOIN travel.runs r ON r.id=l.run_id AND r.owner_user_id=l.owner_user_id
`;
function reportedInteger(field: string) {
  const value = `n.capabilities->>'${field}'`;
  return `CASE WHEN ${value} ~ '^(0|[1-9][0-9]{0,18})$'
    AND (length(${value})<19 OR ${value}<='9223372036854775807') THEN ${value} ELSE NULL END`;
}
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

  async runs(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    const options = this.options(
      query,
      [
        "QUEUED",
        "PREPARING",
        "READY",
        "RUNNING",
        "STOPPING",
        "WAITING_INPUT",
        "RECONCILING",
        "SUCCEEDED",
        "FAILED",
        "TIMED_OUT",
        "CANCELLED",
        "EXPIRED",
        "CLOSED_UNRESOLVED",
      ],
      ["node_id", "run_mode"],
    );
    const nodeId = referenceId(query.node_id, "node_id");
    const mode = query.run_mode;
    if (mode !== undefined && mode !== "finite" && mode !== "continuous")
      invalidQuery("run_mode应为finite或continuous");
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-runs",
      options,
      nodeId,
      mode,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.runRows(options.limit + 1, [
      options.status || null,
      literalPattern(options.q),
      nodeId,
      mode || null,
      cursor?.id || null,
      cursor?.created_at || null,
      null,
    ]);
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async run(actor: CurrentUser, id: string, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    const runId = referenceId(id, "运行编号");
    if (Object.keys(query).length) invalidQuery("运行详情不接受查询参数");
    const result = await this.runRows(1, [
      null,
      "%",
      null,
      null,
      null,
      null,
      runId,
    ]);
    if (!result.rows.length)
      throw new HttpException(
        { code: "NOT_FOUND", message: "运行记录不存在" },
        404,
      );
    const { cursor_created_at, ...item } = result.rows[0];
    return item;
  }

  private runRows(limit: number, values: unknown[]) {
    return this.database.query(
      `
      SELECT r.id,r.created_at,r.revision::text,r.task_id,r.script_version_id,r.run_mode,r.status,
        r.effect_status,r.verification_status,r.completion_kind,r.finished_at,r.last_progress_at,
        r.stop_requested_at,r.stop_deadline,r.deadline,r.restart_count,
        r.current_continuation::text,${cursorProjection("r")},
        CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',a.id,'attempt_no',a.attempt_no,'status',a.status,'node_id',a.node_id,
          'requested_execution_mode',a.requested_execution_mode,'actual_execution_mode',a.actual_execution_mode,
          'started_at',a.started_at,'finished_at',a.finished_at,'exit_code',a.exit_code,
          'lease_generation',a.lease_generation::text,
          'lease_state',CASE WHEN l.id IS NULL THEN 'ABSENT'
            WHEN l.attempt_id<>a.id OR l.generation<>a.lease_generation THEN 'MISMATCHED'
            WHEN l.revoked_at IS NOT NULL THEN 'REVOKED' WHEN l.expires_at<=now() THEN 'EXPIRED'
            WHEN a.status IN ('CREATED','PREPARING','RUNNING','STOPPING')
              AND r.status IN ('PREPARING','READY','RUNNING','STOPPING','WAITING_INPUT','RECONCILING') THEN 'ACTIVE'
            ELSE 'INACTIVE' END,
          'lease_expires_at',CASE WHEN l.attempt_id=a.id AND l.generation=a.lease_generation THEN l.expires_at END,
          'last_heartbeat_at',CASE WHEN l.attempt_id=a.id AND l.generation=a.lease_generation THEN l.last_heartbeat_at END,
          'cleanup_status',e.cleanup_status,'environment_stopped_at',e.stopped_at
        ) END AS latest_attempt
      FROM travel.runs r
      LEFT JOIN LATERAL (
        SELECT a.* FROM travel.attempts a WHERE a.run_id=r.id AND a.owner_user_id=r.owner_user_id
        ORDER BY a.attempt_no DESC,a.id DESC LIMIT 1
      ) a ON true
      LEFT JOIN travel.execution_leases l ON l.run_id=r.id AND l.owner_user_id=r.owner_user_id
      LEFT JOIN travel.environment_leases e ON e.attempt_id=a.id AND e.owner_user_id=r.owner_user_id AND e.node_id=a.node_id
      WHERE ($1::text IS NULL OR r.status=$1)
        AND (r.id::text ILIKE $2 ESCAPE '\\' OR r.task_id::text ILIKE $2 ESCAPE '\\' OR r.script_version_id::text ILIKE $2 ESCAPE '\\')
        AND ($3::uuid IS NULL OR a.node_id=$3) AND ($4::text IS NULL OR r.run_mode=$4)
        AND ($5::uuid IS NULL OR (r.created_at,r.id)<($6::timestamptz,$5::uuid))
        AND ($7::uuid IS NULL OR r.id=$7)
      ORDER BY r.created_at DESC,r.id DESC LIMIT $8`,
      [...values, limit],
    );
  }

  private observationWindow(query: Record<string, unknown>) {
    const from =
      query.from === undefined
        ? null
        : parseQueryDate(query.from).toISOString();
    const to =
      query.to === undefined ? null : parseQueryDate(query.to).toISOString();
    if (from && to && from >= to) invalidQuery("from必须早于to");
    return { from, to };
  }

  async platformLogSegments(
    actor: CurrentUser,
    query: Record<string, unknown>,
    requestId: string = randomUUID(),
  ) {
    this.authorize(actor, "runtime.observe");
    const options = this.options(
      query,
      ["COMMITTED", "MISSING", "DELETED"],
      ["view", "from", "to"],
    );
    if (query.view !== "segments")
      invalidQuery("日志分段查询须指定view=segments");
    const window = this.observationWindow(query);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-platform-log-segments",
      options,
      window,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT s.id,s.created_at,s.revision::text,s.source_instance_id,s.sequence_start::text,s.sequence_end::text,
        s.size_bytes::text,s.started_at,s.ended_at,s.archive_status,s.index_status,s.expires_at,
        (s.expires_at<=now()) AS expired,${cursorProjection("s")}
      FROM travel.platform_log_segments s
      WHERE ($1::text IS NULL OR s.archive_status=$1)
        AND (s.source_instance_id ILIKE $2 ESCAPE '\\' OR s.id::text ILIKE $2 ESCAPE '\\')
        AND ($3::timestamptz IS NULL OR s.ended_at>=$3) AND ($4::timestamptz IS NULL OR s.started_at<$4)
        AND ($5::uuid IS NULL OR (s.created_at,s.id)<($6::timestamptz,$5::uuid))
      ORDER BY s.created_at DESC,s.id DESC LIMIT $7`,
      [
        options.status || null,
        literalPattern(options.q),
        window.from,
        window.to,
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    const page = await this.pagination.page(scope, result.rows, options.limit);
    await this.database.query(
      `
      INSERT INTO travel.audit_events(id,actor_user_id,action,target_type,request_id,outcome,summary)
      VALUES(gen_random_uuid(),$1,'ops.logs.segments.read','platform_log_segments',$2,'SUCCESS',$3)`,
      [
        actor.id,
        requestId,
        JSON.stringify({
          view: "segments",
          returned: page.items.length,
          from: window.from,
          to: window.to,
        }),
      ],
    );
    return page;
  }

  async alerts(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.observe");
    const options = this.options(
      query,
      ["FIRING", "ACKNOWLEDGED", "RECOVERED"],
      ["severity", "from", "to"],
    );
    const severity = query.severity;
    if (
      severity !== undefined &&
      !["INFO", "WARNING", "CRITICAL"].includes(severity as string)
    )
      invalidQuery("告警严重级别无效");
    const window = this.observationWindow(query);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-alerts",
      options,
      severity,
      window,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT a.id,a.created_at,a.revision::text,a.rule_id,a.occurrence::text,a.status,
        a.first_seen_at,a.last_seen_at,a.recovered_at,r.rule_key,r.version AS rule_version,r.severity,
        (SELECT count(*)::text FROM travel.alert_events e WHERE e.instance_id=a.id) AS event_count,
        (SELECT count(*)::text FROM travel.alert_events e WHERE e.instance_id=a.id
          AND e.evidence NOT IN ('null'::jsonb,'{}'::jsonb,'[]'::jsonb)) AS evidence_event_count,
        ${cursorProjection("a")}
      FROM travel.alert_instances a JOIN travel.alert_rules r ON r.id=a.rule_id
      WHERE ($1::text IS NULL OR a.status=$1) AND ($2::text IS NULL OR r.severity=$2)
        AND (r.rule_key ILIKE $3 ESCAPE '\\' OR a.id::text ILIKE $3 ESCAPE '\\')
        AND ($4::timestamptz IS NULL OR a.last_seen_at>=$4) AND ($5::timestamptz IS NULL OR a.first_seen_at<$5)
        AND ($6::uuid IS NULL OR (a.created_at,a.id)<($7::timestamptz,$6::uuid))
      ORDER BY a.created_at DESC,a.id DESC LIMIT $8`,
      [
        options.status || null,
        severity || null,
        literalPattern(options.q),
        window.from,
        window.to,
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
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

  async nodes(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    if (query.view !== "metadata")
      invalidQuery("节点分页查询需要view=metadata");
    return this.nodePage(actor, query, null);
  }

  async node(actor: CurrentUser, id: string, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    if (Object.keys(query).length) invalidQuery("节点详情不支持查询参数");
    const nodeId = referenceId(id, "节点编号");
    const page = await this.nodePage(
      actor,
      { view: "metadata", limit: "1" },
      nodeId,
    );
    if (!page.items.length)
      throw new HttpException(
        { code: "NOT_FOUND", message: "节点不存在或已失效" },
        404,
      );
    return page.items[0];
  }

  private async nodePage(
    actor: CurrentUser,
    query: Record<string, unknown>,
    nodeId: string | null,
  ) {
    const options = this.options(query, nodeStates, ["view"]);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-nodes",
      options,
      nodeId,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      WITH lease_rows AS MATERIALIZED (${executionLeaseRows})
      SELECT n.id,n.name,n.status,n.revision::text,n.created_at,n.last_heartbeat_at,
        n.clock_offset_ms::text,n.isolation_epoch::text,
        ${reportedInteger("cpu_cores")} AS cpu_cores,${reportedInteger("memory_mib")} AS memory_mib,
        (SELECT count(*)::text FROM lease_rows l WHERE l.node_id=n.id AND l.active) AS active_leases,
        (SELECT count(*)::text FROM lease_rows l WHERE l.node_id=n.id AND l.expired_unrevoked) AS expired_unrevoked_leases,
        (SELECT count(*)::text FROM travel.environment_leases e
          JOIN travel.attempts a ON a.id=e.attempt_id AND a.owner_user_id=e.owner_user_id AND a.node_id=e.node_id
          WHERE e.node_id=n.id AND e.stopped_at IS NOT NULL AND e.cleanup_status IN ('PENDING','RUNNING')) AS cleanup_pending,
        (SELECT count(*)::text FROM travel.environment_leases e
          JOIN travel.attempts a ON a.id=e.attempt_id AND a.owner_user_id=e.owner_user_id AND a.node_id=e.node_id
          WHERE e.node_id=n.id AND e.cleanup_status='FAILED') AS cleanup_failed,
        ${cursorProjection("n")}
      FROM travel.nodes n WHERE ($1::text IS NULL OR n.status=$1) AND (
        n.name ILIKE $2 ESCAPE '\\' OR n.id::text ILIKE $2 ESCAPE '\\'
      ) AND ($3::uuid IS NULL OR (n.created_at,n.id)<($4::timestamptz,$3::uuid))
        AND ($6::uuid IS NULL OR n.id=$6)
      ORDER BY n.created_at DESC,n.id DESC LIMIT $5`,
      [
        options.status || null,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
        nodeId,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async images(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    const options = this.options(query, imageStates, ["mode"]);
    if (
      query.mode !== undefined &&
      (typeof query.mode !== "string" || !executionModes.includes(query.mode))
    )
      invalidQuery("镜像模式无效");
    const mode = query.mode || null;
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-images",
      options,
      mode,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT i.id,i.name,i.digest,i.language,i.version,i.architecture,i.modes,i.status,i.revision::text,i.created_at,
        ${evidencePresent("i")} AS has_evidence,
        COALESCE(i.evidence->'development_fixture'='true'::jsonb,false) AS development_fixture,
        ${cursorProjection("i")}
      FROM travel.runtime_images i WHERE ($1::text IS NULL OR i.status=$1) AND ($2::text IS NULL OR $2=ANY(i.modes)) AND (
        i.name ILIKE $3 ESCAPE '\\' OR i.digest ILIKE $3 ESCAPE '\\' OR i.id::text ILIKE $3 ESCAPE '\\'
      ) AND ($4::uuid IS NULL OR (i.created_at,i.id)<($5::timestamptz,$4::uuid))
      ORDER BY i.created_at DESC,i.id DESC LIMIT $6`,
      [
        options.status || null,
        mode,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  async scheduling(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    if (Object.keys(query).length) invalidQuery("调度快照不支持查询参数");
    const result = await this.database.query(`
      WITH lease_rows AS MATERIALIZED (${executionLeaseRows}),
      mode_counts AS (
        SELECT mode,
          (SELECT count(*)::text FROM lease_rows l WHERE l.actual_execution_mode=mode AND l.active) AS active_leases,
          (SELECT count(*)::text FROM lease_rows l WHERE l.actual_execution_mode=mode AND l.expired_unrevoked) AS expired_unrevoked_leases
        FROM unnest(ARRAY['docker','qemu_kvm','qemu_tcg']) AS mode
      )
      SELECT now() AS as_of,jsonb_build_object(
        'queued_runs',(SELECT count(*)::text FROM travel.runs WHERE status='QUEUED'),
        'active_runs',(SELECT count(*)::text FROM travel.runs WHERE status IN ('PREPARING','READY','RUNNING','STOPPING')),
        'waiting_bookings',(SELECT count(*)::text FROM travel.booking_operations WHERE status IN ('READY','SUBMITTING','UNKNOWN')),
        'unreported_mode_leases',(SELECT count(*)::text FROM lease_rows WHERE actual_execution_mode IS NULL AND active)
      ) AS counts,(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.mode) FROM mode_counts m) AS modes`);
    return result.rows[0];
  }

  async capacityQuotas(actor: CurrentUser, query: Record<string, unknown>) {
    this.authorize(actor, "runtime.manage");
    const options = this.options(query, []);
    const scope = JSON.stringify([
      actor.id,
      actor.security_revision,
      "admin-capacity-quotas",
      options,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      WITH latest AS (
        SELECT DISTINCT ON (scope,scope_key,resource_key) * FROM travel.quota_accounts
        WHERE scope IN ('NODE','GLOBAL') AND window_start<=now()
        ORDER BY scope,scope_key,resource_key,window_start DESC,id DESC
      )
      SELECT q.id,q.scope,q.scope_key,q.resource_key,q.window_start,q.revision::text,q.created_at,
        q.limit_amount::text,q.reserved_amount::text,q.consumed_amount::text,
        (q.limit_amount-q.reserved_amount-q.consumed_amount)::text AS available_amount,${cursorProjection("q")}
      FROM latest q WHERE (q.resource_key ILIKE $1 ESCAPE '\\' OR q.scope_key ILIKE $1 ESCAPE '\\')
        AND ($2::uuid IS NULL OR (q.created_at,q.id)<($3::timestamptz,$2::uuid))
      ORDER BY q.created_at DESC,q.id DESC LIMIT $4`,
      [
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }
}
