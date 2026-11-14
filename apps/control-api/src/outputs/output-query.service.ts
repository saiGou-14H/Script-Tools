import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";
import { parseQueryDate } from "../common/query-date";

const outputKinds = ["text", "json", "file", "message"];
const outputStates = [
  "STAGED",
  "VALIDATING",
  "WAITING_DEPENDENCY",
  "READY",
  "FAILED",
  "EXPIRED",
  "DELETED",
];
const phases = ["ACTION", "OUTPUT_HOOK"];
const joins = `FROM travel.script_outputs o
  JOIN travel.output_batches b ON b.id=o.batch_id AND b.owner_user_id=o.owner_user_id
  JOIN travel.output_series series ON series.id=b.output_series_id AND series.owner_user_id=o.owner_user_id
  JOIN travel.runs r ON r.id=series.run_id AND r.owner_user_id=o.owner_user_id
  JOIN travel.tasks t ON t.id=r.task_id AND t.owner_user_id=o.owner_user_id
  LEFT JOIN travel.storage_objects object ON object.id=o.object_id AND object.owner_user_id=o.owner_user_id
  LEFT JOIN travel.private_payloads payload ON payload.id=o.payload_id AND payload.owner_user_id=o.owner_user_id`;
const projection = `o.id,o.revision::text,o.kind,o.title,o.file_name,o.media_type,o.size_bytes::text,
  o.status,o.created_at,o.updated_at,o.expires_at,o.failure_code,
  b.id AS batch_id,b.batch_key,b.phase,r.id AS run_id,r.status AS run_status,t.name AS task_name,
  CASE WHEN o.expires_at<=now() OR o.status='EXPIRED' THEN 'EXPIRED'
    WHEN o.status<>'READY' THEN o.status
    WHEN o.kind='file' AND object.status='QUARANTINED' THEN 'QUARANTINED'
    WHEN o.kind='file' AND (object.id IS NULL OR object.status<>'READY' OR object.deleted_at IS NOT NULL) THEN 'UNAVAILABLE'
    WHEN o.kind='file' AND object.expires_at<=now() THEN 'EXPIRED'
    WHEN o.kind<>'file' AND (payload.id IS NULL OR payload.deleted_at IS NOT NULL OR payload.expires_at<=now()) THEN 'UNAVAILABLE'
    ELSE 'READY' END AS availability,
  false AS content_access_configured,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'status',d.status,'attempt_count',d.attempt_count::text,'next_attempt_at',d.next_attempt_at) ORDER BY d.created_at,d.id)
    FROM travel.notification_deliveries d WHERE d.owner_user_id=o.owner_user_id AND
      (d.message_output_id=o.id OR EXISTS (SELECT 1 FROM travel.output_dependencies dep
        WHERE dep.owner_user_id=o.owner_user_id AND dep.attachment_output_id=o.id AND dep.message_output_id=d.message_output_id))),'[]'::jsonb) AS deliveries`;

@Injectable()
export class OutputQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pagination: PaginationService,
  ) {}
  private notFound(): never {
    throw new HttpException(
      { code: "NOT_FOUND", message: "产物或运行不存在或已失效" },
      404,
    );
  }
  private async ownRun(owner: string, id: string) {
    if (!uuidPattern.test(id)) this.notFound();
    if (
      !(
        await this.database.query(
          "SELECT id FROM travel.runs WHERE id=$1 AND owner_user_id=$2",
          [id, owner],
        )
      ).rows.length
    )
      this.notFound();
  }
  async get(owner: string, id: string) {
    if (!uuidPattern.test(id)) this.notFound();
    const row = (
      await this.database.query(
        `SELECT ${projection} ${joins}
      WHERE o.id=$2 AND o.owner_user_id=$1 AND b.commit_status='COMMITTED' AND o.deleted_at IS NULL AND o.status<>'DELETED'`,
        [owner, id],
      )
    ).rows[0];
    if (!row) this.notFound();
    return row;
  }
  async list(owner: string, query: Record<string, unknown>, run?: string) {
    const routeRun = run?.toLowerCase();
    if (routeRun) await this.ownRun(owner, routeRun);
    const allowed = [
      "run_id",
      "kind",
      "phase",
      "state",
      "from",
      "to",
      "limit",
      "cursor",
    ];
    if (Object.keys(query).some((key) => !allowed.includes(key)))
      invalidQuery("包含不支持的产物筛选参数");
    const scalar = (key: string) => {
      const value = query[key];
      if (value === undefined) return null;
      if (typeof value !== "string" || !value) invalidQuery(`${key}参数无效`);
      return value;
    };
    const runId = scalar("run_id")?.toLowerCase() || null;
    if (runId && !uuidPattern.test(runId)) invalidQuery("run_id参数无效");
    if (routeRun && runId && routeRun !== runId)
      invalidQuery("运行筛选与路径不一致");
    if (!routeRun && runId) await this.ownRun(owner, runId);
    const kind = scalar("kind"),
      phase = scalar("phase"),
      state = scalar("state");
    if (kind && !outputKinds.includes(kind)) invalidQuery("产物类型无效");
    if (phase && !phases.includes(phase)) invalidQuery("产物阶段无效");
    if (state && !outputStates.includes(state)) invalidQuery("产物状态无效");
    const timestamp = (key: string) => {
      const value = scalar(key);
      if (!value) return null;
      const fraction = value.match(/\.(\d+)(?:Z|[+-])/);
      return parseQueryDate(value)
        .toISOString()
        .replace(/\.\d{3}Z$/, `.${fraction?.[1] || "000"}Z`);
    };
    const from = timestamp("from"),
      to = timestamp("to");
    if (from && to) {
      const range = (
        await this.database.query(
          "SELECT $1::timestamptz<$2::timestamptz AS valid",
          [from, to],
        )
      ).rows[0];
      if (!range.valid) invalidQuery("from必须早于to");
    }
    const limitValue = scalar("limit") || "20";
    if (!/^(?:[1-9]\d?|100)$/.test(limitValue))
      invalidQuery("limit应为1至100的整数");
    const limit = Number(limitValue);
    const filters = {
      run_id: routeRun || runId,
      kind,
      phase,
      state,
      from,
      to,
      limit,
    };
    const scope = JSON.stringify([owner, "outputs", filters]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const rows = await this.database.query(
      `SELECT ${projection},
      to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at ${joins}
      WHERE o.owner_user_id=$1 AND b.commit_status='COMMITTED' AND o.deleted_at IS NULL AND o.status<>'DELETED'
      AND ($2::uuid IS NULL OR r.id=$2) AND ($3::text IS NULL OR o.kind=$3)
      AND ($4::text IS NULL OR b.phase=$4) AND ($5::text IS NULL OR o.status=$5)
      AND ($6::timestamptz IS NULL OR o.created_at>=$6) AND ($7::timestamptz IS NULL OR o.created_at<$7)
      AND ($8::timestamptz IS NULL OR (o.created_at,o.id)<($8,$9::uuid))
      ORDER BY o.created_at DESC,o.id DESC LIMIT $10`,
      [
        owner,
        filters.run_id,
        kind,
        phase,
        state,
        from,
        to,
        cursor?.created_at || null,
        cursor?.id || null,
        limit + 1,
      ],
    );
    return this.pagination.page(scope, rows.rows, limit);
  }
}
