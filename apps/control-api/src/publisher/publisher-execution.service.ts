import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";
import { ScriptService } from "../scripts/script.service";

export type PublisherRecordKind = "builds" | "test-runs" | "deployments";

const runStates = [
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
];
const duration = (started: string) =>
  `CASE WHEN ${started} IS NOT NULL AND x.finished_at>=${started}
    THEN floor(extract(epoch FROM (x.finished_at-${started}))*1000)::text ELSE NULL END AS duration_ms`;
const joins = `JOIN travel.script_versions v ON v.id=x.script_version_id AND v.owner_user_id=x.owner_user_id
  JOIN travel.scripts s ON s.id=v.script_id AND s.owner_user_id=x.owner_user_id`;

const resources = {
  builds: {
    states: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
    from: `travel.builds x ${joins}`,
    projection: `x.started_at,x.finished_at,${duration("x.started_at")},x.failure_code,
      x.source_digest,x.artifact_digest,
      EXISTS(SELECT 1 FROM travel.log_segments l WHERE l.build_id=x.id AND l.owner_user_id=x.owner_user_id) AS has_log_segments`,
  },
  "test-runs": {
    states: runStates,
    from: `travel.runs x ${joins}
      JOIN travel.tasks t ON t.id=x.task_id AND t.owner_user_id=x.owner_user_id AND t.execution_context='AUTHOR_TEST'
      LEFT JOIN travel.version_test_evidence e ON e.run_id=x.id AND e.owner_user_id=x.owner_user_id AND e.script_version_id=x.script_version_id
      LEFT JOIN LATERAL (SELECT min(a.started_at) AS started_at FROM travel.attempts a
        WHERE a.run_id=x.id AND a.owner_user_id=x.owner_user_id) timing ON true`,
    projection: `x.task_id,x.action,x.run_mode,x.finished_at,timing.started_at,${duration("timing.started_at")},
      x.verification_status,x.effect_status,e.passed AS test_passed,e.execution_mode AS tested_execution_mode,
      (e.id IS NOT NULL) AS has_test_evidence,
      EXISTS(SELECT 1 FROM travel.log_segments l WHERE l.run_id=x.id AND l.owner_user_id=x.owner_user_id) AS has_log_segments`,
  },
  deployments: {
    states: ["PENDING", "DEPLOYING", "READY", "FAILED", "DEGRADED", "STOPPED"],
    from: `travel.deployments x ${joins}
      JOIN travel.artifacts a ON a.id=x.artifact_id AND a.owner_user_id=x.owner_user_id
      JOIN travel.builds b ON b.id=a.build_id AND b.owner_user_id=x.owner_user_id
      JOIN travel.resource_profiles p ON p.id=x.resource_profile_id
      LEFT JOIN travel.storage_objects o ON o.id=a.object_id AND o.owner_user_id=x.owner_user_id`,
    projection: `a.digest AS artifact_digest,x.last_health_at,x.failure_code,
      x.resource_profile_id,p.name AS resource_profile_name,p.version AS resource_profile_version,
      CASE WHEN x.runtime_snapshot->>'execution_mode' IN ('docker','qemu_kvm','qemu_tcg')
        THEN x.runtime_snapshot->>'execution_mode' ELSE NULL END AS configured_execution_mode,
      CASE WHEN p.limits->>'cpu' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' THEN p.limits->>'cpu' ELSE NULL END AS cpu,
      CASE WHEN p.limits->>'memory_mib' ~ '^(0|[1-9][0-9]*)$' THEN p.limits->>'memory_mib' ELSE NULL END AS memory_mib,
      COALESCE(b.script_version_id=x.script_version_id AND b.status='SUCCEEDED' AND b.artifact_digest=a.digest
        AND a.digest ~ '^(sha256:)?[a-f0-9]{64}$' AND regexp_replace(a.digest,'^sha256:','')=o.sha256
        AND o.status='READY' AND o.deleted_at IS NULL AND (o.expires_at IS NULL OR o.expires_at>now()),false) AS artifact_available,
      (x.health_evidence NOT IN ('null'::jsonb,'{}'::jsonb,'[]'::jsonb)) AS has_health_evidence,
      COALESCE((SELECT jsonb_agg(to_jsonb(linked) ORDER BY linked.title,linked.id) FROM (
        SELECT service.id,service.title,service.status,COALESCE(bool_or(service.current_release_id=release.id),false) AS is_current
        FROM travel.service_releases release JOIN travel.services service
          ON service.id=release.service_id AND service.owner_user_id=release.owner_user_id
        WHERE release.owner_user_id=x.owner_user_id AND release.deployment_id=x.id AND release.script_version_id=x.script_version_id
        GROUP BY service.id,service.title,service.status
      ) linked),'[]'::jsonb) AS services`,
  },
};

@Injectable()
export class PublisherExecutionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pagination: PaginationService,
    private readonly scripts: ScriptService,
  ) {}

  private notFound(): never {
    throw new HttpException(
      { code: "NOT_FOUND", message: "记录不存在或已失效" },
      404,
    );
  }

  async get(owner: string, kind: PublisherRecordKind, id: string) {
    if (!uuidPattern.test(id)) this.notFound();
    const page = await this.read(owner, kind, {}, id.toLowerCase());
    if (!page.items.length) this.notFound();
    return page.items[0];
  }

  async list(
    owner: string,
    kind: PublisherRecordKind,
    query: Record<string, unknown>,
    version?: string,
  ) {
    if (version) {
      if (!uuidPattern.test(version)) this.notFound();
      if (
        !(
          await this.database.query(
            "SELECT id FROM travel.script_versions WHERE id=$1 AND owner_user_id=$2",
            [version, owner],
          )
        ).rows.length
      )
        this.notFound();
    }
    return this.read(owner, kind, query, null, version?.toLowerCase());
  }

  private async read(
    owner: string,
    kind: PublisherRecordKind,
    query: Record<string, unknown>,
    record: string | null,
    routeVersion?: string,
  ) {
    await this.scripts.requirePublisher(this.database, owner);
    const allowed = [
      "q",
      "script_name",
      "script_id",
      "script_version_id",
      "version",
      "status",
      "limit",
      "cursor",
    ];
    if (Object.keys(query).some((key) => !allowed.includes(key)))
      invalidQuery("包含不支持的记录筛选参数");
    function scalar(key: string, max = 200) {
      const value = query[key];
      if (value === undefined) return null;
      if (typeof value !== "string" || !value || value.length > max)
        invalidQuery(`${key}参数无效`);
      return value;
    }
    const q = scalar("q");
    const name = scalar("script_name", 120);
    const scriptId = scalar("script_id")?.toLowerCase() || null;
    if (scriptId && !uuidPattern.test(scriptId))
      invalidQuery("script_id应为UUID");
    const version = scalar("version", 128);
    const status = scalar("status");
    const requestedVersion = scalar("script_version_id");
    if (requestedVersion && !uuidPattern.test(requestedVersion))
      invalidQuery("script_version_id应为UUID");
    if (
      routeVersion &&
      requestedVersion &&
      routeVersion !== requestedVersion.toLowerCase()
    )
      invalidQuery("版本筛选与路径不一致");
    if (status && !resources[kind].states.includes(status))
      invalidQuery("记录状态无效");
    const size = scalar("limit") || "20";
    if (!/^(?:[1-9]\d?|100)$/.test(size)) invalidQuery("limit应为1至100的整数");
    const limit = Number(size);
    const versionId = routeVersion || requestedVersion?.toLowerCase() || null;
    const scope = JSON.stringify([
      owner,
      kind,
      { q, name, scriptId, version, status, versionId, limit },
      record,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const resource = resources[kind];
    const result = await this.database.query(
      `SELECT x.id,x.revision::text,x.created_at,x.updated_at,x.status,x.script_version_id,
        v.script_id,s.name AS script_name,v.version,${resource.projection},
        to_char(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM ${resource.from} WHERE x.owner_user_id=$1
        AND ($2::text IS NULL OR s.name=$2) AND ($3::text IS NULL OR v.version=$3)
        AND ($4::text IS NULL OR x.status=$4) AND ($5::uuid IS NULL OR x.script_version_id=$5)
        AND ($6::text IS NULL OR s.name ILIKE $6 ESCAPE '\\' OR v.version ILIKE $6 ESCAPE '\\' OR x.id::text ILIKE $6 ESCAPE '\\')
        AND ($7::uuid IS NULL OR x.id=$7)
        AND ($8::timestamptz IS NULL OR (x.created_at,x.id)<($8,$9::uuid))
        AND ($11::uuid IS NULL OR v.script_id=$11)
      ORDER BY x.created_at DESC,x.id DESC LIMIT $10`,
      [
        owner,
        name,
        version,
        status,
        versionId,
        q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null,
        record,
        cursor?.created_at || null,
        cursor?.id || null,
        limit + 1,
        scriptId,
      ],
    );
    return this.pagination.page(scope, result.rows, limit);
  }
}
