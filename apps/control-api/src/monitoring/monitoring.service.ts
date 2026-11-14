import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { parseQueryDate } from "../common/query-date";

@Injectable()
export class MonitoringService {
  constructor(private readonly database: DatabaseService) {}

  async overview(ownerId: string, query: Record<string, unknown> = {}) {
    if (Object.keys(query).some((key) => key !== "from" && key !== "to"))
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "仅支持from和to时间窗口参数" },
        422,
      );
    const to = query.to === undefined ? new Date() : parseQueryDate(query.to);
    const from =
      query.from === undefined
        ? new Date(to.getTime() - 30 * 86_400_000)
        : parseQueryDate(query.from);
    if (from >= to)
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "from必须早于to" },
        422,
      );
    const result = await this.database.query(
      `
      WITH owned_tasks AS MATERIALIZED (
        SELECT id,name,status,created_at FROM travel.tasks WHERE owner_user_id=$1
      ), owned_runs AS MATERIALIZED (
        SELECT r.id,r.task_id,r.status,r.created_at,r.updated_at,t.name AS task_name
        FROM travel.runs r JOIN owned_tasks t ON t.id=r.task_id
        WHERE r.owner_user_id=$1
      ), owned_pending AS MATERIALIZED (
        SELECT p.id,p.run_id,p.reason,p.created_at,r.task_name
        FROM travel.pending_actions p JOIN owned_runs r ON r.id=p.run_id
        WHERE p.owner_user_id=$1 AND p.status='OPEN' AND p.expires_at>now()
          AND r.status IN ('QUEUED','PREPARING','READY','RUNNING','STOPPING','WAITING_INPUT','RECONCILING')
      ), owned_orders AS MATERIALIZED (
        SELECT o.id,o.status,o.amount_minor,o.currency,o.created_at,o.paid_at,o.funding_transaction_id,
          r.title,r.description,r.delivery_policy->>'icon' AS icon
        FROM travel.service_orders o JOIN travel.service_releases r ON r.id=o.service_release_id
        WHERE o.owner_user_id=$1
      ), owned_entitlements AS MATERIALIZED (
        SELECT e.id,e.order_id,e.status,e.valid_until,e.revoked_at,e.used_count,e.reserved_count,
          o.title,o.description,o.icon,o.status AS order_status,o.paid_at,o.funding_transaction_id,e.created_at
        FROM travel.entitlements e JOIN owned_orders o ON o.id=e.order_id
        WHERE e.owner_user_id=$1
      ), visible_outputs AS MATERIALIZED (
        SELECT o.id,o.kind,o.file_name,o.title,o.created_at,r.task_name,r.id AS run_id,
          CASE WHEN o.kind='file' THEN 'file' WHEN o.kind='json' THEN 'database' ELSE 'box' END AS icon
        FROM travel.script_outputs o
        JOIN travel.output_batches b ON b.id=o.batch_id AND b.owner_user_id=$1
        JOIN travel.output_series s ON s.id=b.output_series_id AND s.owner_user_id=$1
        JOIN owned_runs r ON r.id=s.run_id
        LEFT JOIN travel.storage_objects storage ON storage.id=o.object_id AND storage.owner_user_id=$1
        WHERE o.owner_user_id=$1 AND o.status='READY' AND o.expires_at>now() AND o.deleted_at IS NULL
          AND b.commit_status='COMMITTED'
          AND (o.kind<>'file' OR (storage.status='READY' AND storage.deleted_at IS NULL AND (storage.expires_at IS NULL OR storage.expires_at>now())))
      )
        SELECT now() AS as_of,jsonb_build_object('from',$2::timestamptz,'to',$3::timestamptz) AS window,
        jsonb_build_object(
          'unused_entitlements',(SELECT count(*)::text FROM owned_entitlements WHERE status='ACTIVE' AND valid_until>now() AND revoked_at IS NULL AND used_count=0 AND reserved_count=0 AND order_status='ACTIVE' AND paid_at IS NOT NULL AND funding_transaction_id IS NOT NULL),
          'in_progress',(SELECT count(*)::text FROM owned_runs WHERE status IN ('QUEUED','PREPARING','READY','RUNNING','STOPPING','RECONCILING')),
          'pending_actions',(SELECT count(*)::text FROM owned_pending),
          'processing_refunds',(SELECT count(*)::text FROM travel.refunds WHERE owner_user_id=$1 AND status IN ('REQUESTED','PROCESSING','UNKNOWN')),
          'tasks',(SELECT count(*)::text FROM owned_tasks WHERE created_at >= $2 AND created_at < $3),
          'runs',(SELECT count(*)::text FROM owned_runs WHERE created_at >= $2 AND created_at < $3),
          'ready_outputs',(SELECT count(*)::text FROM visible_outputs),
          'entitlements',(SELECT count(*)::text FROM owned_entitlements WHERE status IN ('PENDING','ACTIVE','RESERVED') AND revoked_at IS NULL AND (status='RESERVED' OR valid_until>now()))
        ) AS counts,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,title,description,icon,status,order_id,valid_until,created_at FROM owned_entitlements WHERE status IN ('PENDING','ACTIVE','RESERVED') AND revoked_at IS NULL AND (status='RESERVED' OR valid_until>now()) ORDER BY created_at DESC,id DESC LIMIT 3
        ) item),'[]'::jsonb) AS services,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,title,icon,status,amount_minor::text,currency,created_at FROM owned_orders WHERE created_at >= $2 AND created_at < $3 ORDER BY created_at DESC,id DESC LIMIT 3
        ) item),'[]'::jsonb) AS orders,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT id,task_id,task_name,status,updated_at FROM owned_runs WHERE updated_at >= $2 AND updated_at < $3 ORDER BY updated_at DESC,id DESC LIMIT 2
        ) item),'[]'::jsonb) AS activity,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,run_id,task_name,reason,created_at FROM owned_pending ORDER BY created_at DESC,id DESC LIMIT 1
        ) item),'[]'::jsonb) AS pending,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,kind,file_name,title,task_name,run_id,icon,created_at FROM visible_outputs WHERE created_at >= $2 AND created_at < $3 ORDER BY created_at DESC,id DESC LIMIT 2
        ) item),'[]'::jsonb) AS results,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.currency) FROM (
          SELECT currency,sum(funded)::text AS funded_service_fee_minor,sum(refunded)::text AS refunded_service_fee_minor
          FROM (
            SELECT currency,amount_minor AS funded,0::bigint AS refunded FROM owned_orders
            WHERE paid_at >= $2 AND paid_at < $3 AND funding_transaction_id IS NOT NULL
            UNION ALL SELECT currency,0::bigint,amount_minor FROM travel.refunds
            WHERE owner_user_id=$1 AND status='SUCCEEDED' AND succeeded_at >= $2 AND succeeded_at < $3
          ) fee_rows GROUP BY currency
        ) item),'[]'::jsonb) AS fees
    `,
      [ownerId, from.toISOString(), to.toISOString()],
    );
    return result.rows[0];
  }
}
