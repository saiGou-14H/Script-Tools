import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { invalidQuery, uuidPattern } from "../common/pagination.service";
import { parseQueryDate } from "../common/query-date";

@Injectable()
export class PublisherOverviewService {
  constructor(private readonly database: DatabaseService) {}

  async get(owner: string, query: Record<string, unknown> = {}) {
    const allowed = ["from", "to", "service_id", "version", "q", "status"];
    if (Object.keys(query).some((key) => !allowed.includes(key)))
      invalidQuery("包含不支持的概况筛选参数");
    const to = query.to === undefined ? new Date() : parseQueryDate(query.to);
    const from =
      query.from === undefined
        ? parseQueryDate(new Date(to.getTime() - 30 * 86_400_000).toISOString())
        : parseQueryDate(query.from);
    if (from >= to) invalidQuery("from必须早于to");
    const service = query.service_id;
    if (
      service !== undefined &&
      (typeof service !== "string" || !uuidPattern.test(service))
    )
      invalidQuery("service_id应为UUID");
    const version = query.version;
    if (
      version !== undefined &&
      (typeof version !== "string" ||
        !/^[1-9]\d{0,9}$/.test(version) ||
        BigInt(version) > 2147483647n)
    )
      invalidQuery("version应为正整数服务发布版本号");
    const q = query.q === undefined ? "" : query.q;
    if (typeof q !== "string" || q.length > 200)
      invalidQuery("q应为不超过200字的字符串");
    const status = query.status;
    if (
      status !== undefined &&
      !["ACTIVE", "DRAFT", "OFF_SALE"].includes(status as string)
    )
      invalidQuery("status应为ACTIVE、DRAFT或OFF_SALE");
    const result = await this.database.query(
      `
      WITH clock AS MATERIALIZED (
        SELECT now() AS as_of,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_from
      ), profile AS MATERIALIZED (
        SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1 AND enabled
      ), owned_services AS MATERIALIZED (
        SELECT s.* FROM travel.services s WHERE s.owner_user_id=$1
          AND ($4::uuid IS NULL OR s.id=$4) AND EXISTS (SELECT 1 FROM profile)
      ), releases AS MATERIALIZED (
        SELECT r.*,v.script_id,v.version AS script_version,s.name AS script_name
        FROM travel.service_releases r JOIN owned_services service ON service.id=r.service_id
        JOIN travel.script_versions v ON v.id=r.script_version_id AND v.owner_user_id=$1
        JOIN travel.scripts s ON s.id=v.script_id AND s.owner_user_id=$1
        WHERE r.owner_user_id=$1 AND ($5::int IS NULL OR r.version=$5)
      ), scoped_services AS MATERIALIZED (
        SELECT s.id,s.title,s.status,s.updated_at,r.id AS release_id,r.version AS release_version,
          r.script_id,r.script_version,r.script_version_id,r.script_name,r.deployment_id,
          r.delivery_policy->>'icon' AS icon,r.refund_policy->>'summary' AS refund_summary,
          p.unit_amount_minor::text AS amount_minor,p.currency,
          CASE WHEN s.status='ACTIVE' THEN 'ACTIVE' WHEN s.status='DRAFT' THEN 'DRAFT' ELSE 'OFF_SALE' END AS sale_group
        FROM owned_services s
        LEFT JOIN releases r ON r.service_id=s.id AND (($5::int IS NULL AND r.id=s.current_release_id) OR r.version=$5)
        LEFT JOIN LATERAL (
          SELECT unit_amount_minor,currency FROM travel.price_plans
          WHERE owner_user_id=$1 AND service_release_id=r.id AND retired_at IS NULL
          ORDER BY version DESC,id DESC LIMIT 1
        ) p ON true
        WHERE $5::int IS NULL OR r.id IS NOT NULL
      ), deployments AS MATERIALIZED (
        SELECT d.id,d.script_version_id,d.status,d.updated_at,d.last_health_at,d.health_evidence<>'{}'::jsonb AS has_health_evidence,
          v.script_id,v.version AS script_version,s.name AS script_name
        FROM travel.deployments d
        JOIN travel.script_versions v ON v.id=d.script_version_id AND v.owner_user_id=$1
        JOIN travel.scripts s ON s.id=v.script_id AND s.owner_user_id=$1
        WHERE d.owner_user_id=$1 AND EXISTS (SELECT 1 FROM profile)
          AND (($4::uuid IS NULL AND $5::int IS NULL) OR EXISTS (
            SELECT 1 FROM releases r WHERE r.deployment_id=d.id AND r.script_version_id=d.script_version_id
          ))
      ), orders AS MATERIALIZED (
        SELECT o.id,o.service_release_id,r.service_id,r.title,o.status,o.currency,o.amount_minor,o.created_at,o.paid_at,o.funding_transaction_id
        FROM travel.service_orders o JOIN releases r ON r.id=o.service_release_id
        WHERE o.publisher_id=$1
      ), refunds AS MATERIALIZED (
        SELECT f.id,f.order_id,o.service_id,o.title,f.status,f.amount_minor,f.currency,f.created_at,f.succeeded_at
        FROM travel.refunds f JOIN orders o ON o.id=f.order_id
        JOIN travel.service_orders source ON source.id=o.id AND source.owner_user_id=f.owner_user_id
        WHERE f.currency=o.currency
      ), ledger AS MATERIALIZED (
        SELECT a.currency,a.code,e.credit_minor,e.debit_minor,e.order_id,t.kind,t.posted_at
        FROM travel.ledger_accounts a
        JOIN travel.ledger_entries e ON e.account_id=a.id AND e.currency=a.currency
        JOIN travel.ledger_transactions t ON t.id=e.transaction_id AND t.currency=e.currency
        CROSS JOIN clock
        WHERE a.party_user_id=$1 AND a.code='PUBLISHER_PENDING' AND t.posted_at<=clock.as_of
          AND EXISTS (SELECT 1 FROM profile)
      ), settled AS MATERIALIZED (
        SELECT b.currency,b.amount_minor FROM travel.settlement_batches b CROSS JOIN clock
        WHERE b.owner_user_id=$1 AND b.status='SETTLED' AND b.settled_at<=clock.as_of
          AND EXISTS (SELECT 1 FROM profile)
      ), currencies AS MATERIALIZED (
        SELECT currency FROM orders UNION SELECT currency FROM scoped_services WHERE currency IS NOT NULL
        UNION SELECT currency FROM ledger UNION SELECT currency FROM settled
      ), matching_services AS MATERIALIZED (
        SELECT s.*,d.status AS deployment_status,d.has_health_evidence,d.last_health_at
        FROM scoped_services s LEFT JOIN deployments d ON d.id=s.deployment_id AND d.script_version_id=s.script_version_id
        WHERE ($6::text IS NULL OR s.title ILIKE $6 ESCAPE '\\') AND ($7::text IS NULL OR s.sale_group=$7)
      )
      SELECT EXISTS (SELECT 1 FROM profile) AS publisher_enabled,
        ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM owned_services)) AS service_exists,
        clock.as_of,jsonb_build_object('from',$2::timestamptz,'to',$3::timestamptz,'timezone','UTC',
          'day_from',clock.day_from,'week_from',clock.day_from-interval '6 days') AS window,
        jsonb_build_object('service_id',$4::uuid,'version',$5::int,'q',$8::text,'status',$7::text) AS filters,
        'registered_status'::text AS deployment_basis,'publisher_current'::text AS balance_scope,
        jsonb_build_object(
          'services',(SELECT count(*)::text FROM scoped_services),
          'active_services',(SELECT count(*)::text FROM scoped_services WHERE sale_group='ACTIVE'),
          'draft_services',(SELECT count(*)::text FROM scoped_services WHERE sale_group='DRAFT'),
          'off_sale_services',(SELECT count(*)::text FROM scoped_services WHERE sale_group='OFF_SALE'),
          'matching_services',(SELECT count(*)::text FROM matching_services),
          'deployments',(SELECT count(*)::text FROM deployments),
          'ready_deployments',(SELECT count(*)::text FROM deployments WHERE status='READY'),
          'abnormal_deployments',(SELECT count(*)::text FROM deployments WHERE status IN ('FAILED','DEGRADED')),
          'window_sales',(SELECT count(*)::text FROM orders WHERE paid_at >= $2 AND paid_at < $3 AND funding_transaction_id IS NOT NULL),
          'today_sales',(SELECT count(*)::text FROM orders WHERE paid_at >= clock.day_from AND paid_at<=clock.as_of AND funding_transaction_id IS NOT NULL),
          'processing_refunds',(SELECT count(*)::text FROM refunds WHERE status IN ('REQUESTED','PROCESSING','UNKNOWN'))
        ) AS counts,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT s.*,
            (SELECT count(*)::text FROM orders o WHERE o.service_id=s.id AND o.paid_at >= $2 AND o.paid_at < $3 AND o.funding_transaction_id IS NOT NULL) AS sold_count,
            COALESCE((SELECT jsonb_agg(to_jsonb(fee) ORDER BY fee.currency) FROM (
              SELECT o.currency,sum(o.amount_minor)::text AS funded_minor FROM orders o
              WHERE o.service_id=s.id AND o.paid_at >= $2 AND o.paid_at < $3 AND o.funding_transaction_id IS NOT NULL GROUP BY o.currency
            ) fee),'[]'::jsonb) AS sales
          FROM matching_services s ORDER BY updated_at DESC,id DESC LIMIT 6
        ) item),'[]'::jsonb) AS services,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT * FROM deployments WHERE status IN ('FAILED','DEGRADED') ORDER BY updated_at DESC,id DESC LIMIT 2
        ) item),'[]'::jsonb) AS alerts,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,order_id,service_id,title,status,amount_minor::text,currency,created_at,succeeded_at
          FROM refunds WHERE created_at >= $2 AND created_at < $3 ORDER BY created_at DESC,id DESC LIMIT 2
        ) item),'[]'::jsonb) AS refunds,
        COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.currency) FROM (
          SELECT c.currency,
            COALESCE((SELECT sum(o.amount_minor) FROM orders o WHERE o.currency=c.currency AND o.paid_at >= $2 AND o.paid_at < $3 AND o.funding_transaction_id IS NOT NULL),0)::text AS funded_minor,
            COALESCE((SELECT sum(f.amount_minor) FROM refunds f WHERE f.currency=c.currency AND f.status='SUCCEEDED' AND f.succeeded_at >= $2 AND f.succeeded_at < $3),0)::text AS refunded_minor,
            COALESCE((SELECT sum(l.credit_minor-l.debit_minor) FROM ledger l WHERE l.currency=c.currency),0)::text AS pending_minor,
            COALESCE((SELECT sum(s.amount_minor) FROM settled s WHERE s.currency=c.currency),0)::text AS settled_minor,
            COALESCE((SELECT sum(l.credit_minor-l.debit_minor) FROM ledger l WHERE l.currency=c.currency AND l.kind='ALLOCATION' AND l.posted_at >= $2 AND l.posted_at < $3 AND EXISTS (SELECT 1 FROM orders o WHERE o.id=l.order_id)),0)::text AS allocated_minor,
            COALESCE((SELECT sum(l.credit_minor-l.debit_minor) FROM ledger l WHERE l.currency=c.currency AND l.kind='ALLOCATION' AND l.posted_at >= clock.day_from),0)::text AS today_allocated_minor,
            COALESCE((SELECT sum(l.credit_minor-l.debit_minor) FROM ledger l WHERE l.currency=c.currency AND l.kind='ALLOCATION' AND l.posted_at >= clock.day_from-interval '1 day' AND l.posted_at < clock.day_from),0)::text AS yesterday_allocated_minor,
            COALESCE((SELECT sum(l.credit_minor-l.debit_minor) FROM ledger l WHERE l.currency=c.currency AND l.kind='ALLOCATION' AND l.posted_at >= clock.day_from-interval '6 days'),0)::text AS week_allocated_minor
          FROM currencies c
        ) item),'[]'::jsonb) AS finances
      FROM clock`,
      [
        owner,
        from.toISOString(),
        to.toISOString(),
        service || null,
        version || null,
        q.trim() ? `%${q.trim().replace(/[\\%_]/g, "\\$&")}%` : null,
        status || null,
        q.trim(),
      ],
    );
    const { publisher_enabled, service_exists, ...overview } = result.rows[0];
    if (!publisher_enabled)
      throw new HttpException(
        { code: "FORBIDDEN", message: "需要已启用的发布者身份" },
        403,
      );
    if (!service_exists)
      throw new HttpException(
        { code: "NOT_FOUND", message: "服务不存在" },
        404,
      );
    return overview;
  }
}
