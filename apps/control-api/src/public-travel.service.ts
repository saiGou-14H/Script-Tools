import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService, DatabaseRow } from "./database/database.service";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "./common/pagination.service";

interface PublicChannel {
  id: string;
  name: string;
  adapter_status: string;
  current_rule_version: number | null;
  rule_verified_at: string | null;
  rule_verified: boolean;
  rule_source_url: string | null;
}
interface AttractionRecord extends DatabaseRow {
  id: string;
  channels: PublicChannel[];
  links: { service_id: string; channel_id: string }[];
}
const attractionProjection = `
  a.id,a.created_at,a.revision::text,a.city_id,a.name,a.description,a.timezone,a.ticket_price_kind,
  c.name AS city_name,'0'::text AS ticket_price_minor,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',ch.id,'name',ch.name,'adapter_status',ch.adapter_status,
    'current_rule_version',r.version,'rule_verified_at',r.verified_at,
    'rule_verified',COALESCE(r.verified_at<=now(),false),'rule_source_url',r.source_url
  ) ORDER BY ch.created_at,ch.id)
    FROM travel.channels ch LEFT JOIN travel.channel_rule_versions r
      ON r.id=ch.current_rule_version_id AND r.channel_id=ch.id
    WHERE ch.attraction_id=a.id AND ch.adapter_status<>'DISABLED'),'[]'::jsonb) AS channels,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('service_id',l.service_id,'channel_id',l.channel_id))
    FROM travel.attraction_service_links l
    JOIN travel.services s ON s.id=l.service_id AND s.owner_user_id=l.owner_user_id
    JOIN travel.channels ch ON ch.id=l.channel_id AND ch.attraction_id=l.attraction_id AND ch.adapter_status<>'DISABLED'
    WHERE l.attraction_id=a.id),'[]'::jsonb) AS links`;
const cursorProjection = (alias: string) =>
  `to_char(${alias}.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at`;
const literalPattern = (value: string) =>
  `%${value.replace(/[\\%_]/g, "\\$&")}%`;

function publicSource(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class PublicTravelService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pagination: PaginationService,
  ) {}

  private options(query: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(query).some((key) => !allowed.includes(key)))
      invalidQuery("查询参数无效");
    const q = query.q === undefined ? "" : query.q;
    if (typeof q !== "string" || q.length > 200)
      invalidQuery("q应为不超过200字的字符串");
    if (
      query.city_id !== undefined &&
      (typeof query.city_id !== "string" || !uuidPattern.test(query.city_id))
    )
      invalidQuery("city_id应为UUID");
    const date = query.date;
    if (
      date !== undefined &&
      (typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        date.startsWith("0000"))
    )
      invalidQuery("date应为有效的YYYY-MM-DD日期");
    const size = query.limit === undefined ? "20" : query.limit;
    if (typeof size !== "string" || !/^(?:[1-9]\d?|100)$/.test(size))
      invalidQuery("limit应为1至100的整数");
    return {
      q: q.trim(),
      cityId: (query.city_id as string | undefined)?.toLowerCase() || null,
      date: (date as string | undefined) || null,
      limit: Number(size),
    };
  }

  async cities(query: Record<string, unknown>) {
    const options = this.options(query, ["q", "limit", "cursor"]);
    const scope = JSON.stringify(["public-cities", options.q, options.limit]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `
      SELECT c.id,c.created_at,c.revision::text,c.code,c.name,
        (SELECT count(*)::text FROM travel.attractions a WHERE a.city_id=c.id AND a.enabled) AS attraction_count,
        ${cursorProjection("c")}
      FROM travel.cities c WHERE c.enabled AND (c.name ILIKE $1 ESCAPE '\\' OR c.code ILIKE $1 ESCAPE '\\')
        AND ($2::uuid IS NULL OR (c.created_at,c.id)<($3::timestamptz,$2::uuid))
      ORDER BY c.created_at DESC,c.id DESC LIMIT $4`,
      [
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(scope, result.rows, options.limit);
  }

  private linkedServices(
    row: AttractionRecord,
    catalog: DatabaseRow[],
  ): DatabaseRow[] {
    const channels = new Map(
      row.channels.map((channel) => [channel.id, channel]),
    );
    return catalog
      .filter(
        (service) =>
          service.scene_key === "travel" &&
          row.links.some((link) => link.service_id === service.id),
      )
      .map((service) => {
        const bookingReady = row.links.some((link) => {
          const channel = channels.get(link.channel_id);
          return (
            link.service_id === service.id &&
            channel?.adapter_status === "BOOKING_SUPPORTED" &&
            channel.rule_verified
          );
        });
        const current = service.availability as
          { can_purchase: boolean; reason: string | null } | undefined;
        const catalogReady =
          current?.can_purchase ?? service.deployment_status === "READY";
        return {
          ...service,
          availability: {
            can_purchase: catalogReady && bookingReady,
            reason: !catalogReady
              ? current?.reason || "服务当前不可售"
              : !bookingReady
                ? "渠道能力或当前规则待验证"
                : null,
          },
        };
      });
  }

  private serialize(
    row: AttractionRecord,
    catalog: DatabaseRow[],
    date: string | null,
  ) {
    const { links, channels, ...record } = row;
    const services = this.linkedServices(row, catalog).map((service) => ({
      id: service.id,
      title: service.title,
      amount_minor: service.amount_minor,
      currency: service.currency,
      availability: service.availability,
    }));
    return {
      ...record,
      requested_date: date,
      inventory_status: "NOT_QUERIED",
      channels: channels.map((channel) => ({
        ...channel,
        rule_source_url: publicSource(channel.rule_source_url),
      })),
      services,
    };
  }

  async attractions(query: Record<string, unknown>, catalog: DatabaseRow[]) {
    const options = this.options(query, [
      "city_id",
      "q",
      "date",
      "limit",
      "cursor",
    ]);
    const scope = JSON.stringify(["public-attractions", options]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query<AttractionRecord>(
      `
      SELECT ${attractionProjection},${cursorProjection("a")}
      FROM travel.attractions a JOIN travel.cities c ON c.id=a.city_id AND c.enabled
      WHERE a.enabled AND ($1::uuid IS NULL OR a.city_id=$1)
        AND (a.name ILIKE $2 ESCAPE '\\' OR c.name ILIKE $2 ESCAPE '\\')
        AND ($3::uuid IS NULL OR (a.created_at,a.id)<($4::timestamptz,$3::uuid))
      ORDER BY a.created_at DESC,a.id DESC LIMIT $5`,
      [
        options.cityId,
        literalPattern(options.q),
        cursor?.id || null,
        cursor?.created_at || null,
        options.limit + 1,
      ],
    );
    return this.pagination.page(
      scope,
      result.rows.map((row) => this.serialize(row, catalog, options.date)),
      options.limit,
    );
  }

  private async record(id: string) {
    if (!uuidPattern.test(id))
      throw new HttpException(
        { code: "NOT_FOUND", message: "景点不存在或暂未开放" },
        404,
      );
    const result = await this.database.query<AttractionRecord>(
      `
      SELECT ${attractionProjection} FROM travel.attractions a JOIN travel.cities c ON c.id=a.city_id AND c.enabled
      WHERE a.enabled AND a.id=$1`,
      [id.toLowerCase()],
    );
    if (!result.rows[0])
      throw new HttpException(
        { code: "NOT_FOUND", message: "景点不存在或暂未开放" },
        404,
      );
    return result.rows[0];
  }

  async attraction(
    id: string,
    query: Record<string, unknown>,
    catalog: DatabaseRow[],
  ) {
    const options = this.options(query, ["date"]);
    return this.serialize(await this.record(id), catalog, options.date);
  }

  async services(
    id: string,
    query: Record<string, unknown>,
    catalog: DatabaseRow[],
  ) {
    this.options(query, ["date"]);
    return this.linkedServices(await this.record(id), catalog);
  }
}
