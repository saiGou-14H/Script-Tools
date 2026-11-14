import westlakeImage from "../assets/travel/westlake-example.png";
import historyImage from "../assets/travel/history-example.png";
import exhibitionImage from "../assets/travel/exhibition-example.png";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Service } from "../types";

export interface PublicAttraction {
  id: string;
  revision: string;
  city_id: string;
  city_name: string;
  name: string;
  description: string;
  timezone: string;
  ticket_price_kind: "FREE";
  ticket_price_minor: string;
  requested_date: string | null;
  inventory_status: "NOT_QUERIED";
  channels: {
    id: string;
    name: string;
    adapter_status: string;
    rule_verified: boolean;
    rule_verified_at: string | null;
    rule_source_url: string | null;
    current_rule_version: number | null;
  }[];
  services: Pick<
    Service,
    "id" | "title" | "amount_minor" | "currency" | "availability"
  >[];
}
export function usePublicAttraction(
  id: string | undefined,
  date: string,
  enabled: boolean,
) {
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  return useQuery({
    queryKey: ["public", "attraction", id, date],
    enabled: enabled && Boolean(id),
    queryFn: ({ signal }) =>
      api<PublicAttraction>(
        `/attractions/${encodeURIComponent(id!)}?${query}`,
        { signal },
      ),
  });
}

export const attractionFixtures = [
  {
    id: "westlake",
    city: "杭州",
    title: "西湖博物馆",
    open: true,
    ticketMinor: "0",
    description: "示例景点，支持使用脚本服务完成预约等操作。",
    galleryDescription:
      "展示城市历史与人文的综合性博物馆，适合进行门票预约与到访辅助服务。",
    image: westlakeImage,
    serviceSchemaDigest: "schema-calendar",
  },
  {
    id: "beijing",
    city: "北京",
    title: "城市历史馆",
    open: true,
    ticketMinor: "0",
    description: "示例景点，提供按次使用的预约服务。",
    galleryDescription:
      "以城市发展脉络为主线的专题展馆，提供预约办理与相关数据处理支持。",
    image: historyImage,
    serviceSchemaDigest: "schema-calendar",
  },
  {
    id: "suzhou",
    city: "苏州",
    title: "城市展览馆",
    open: false,
    ticketMinor: "0",
    description: "示例景点，当前暂未开放脚本服务接入。",
    galleryDescription: "展示城市建设与文化成果的展馆，当前暂未接入脚本服务。",
    image: exhibitionImage,
    serviceSchemaDigest: "schema-calendar",
  },
];

export function fixtureAttractionService(
  attraction: (typeof attractionFixtures)[number],
  services: Service[],
) {
  const matches = services.filter(
    (service) =>
      service.scene_key === "travel" &&
      service.input_schema_digest === attraction.serviceSchemaDigest &&
      service.delivery_policy.development_fixture === true,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function validVisitDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !value.startsWith("0000") &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function readTravelContext(params: URLSearchParams, prototype: boolean) {
  const attractionId =
    params.get("attraction") || (prototype ? "westlake" : undefined);
  const attraction = prototype
    ? attractionFixtures.find((item) => item.id === attractionId)
    : undefined;
  const date = params.get("date") || (prototype ? "2026-11-20" : "");
  const slot = params.get("slot") || (prototype ? "上午" : "");
  const partySize = params.get("party_size") || (prototype ? "1" : "");
  const validDate = !date || validVisitDate(date);
  const invalid =
    (prototype && Boolean(attractionId) && !attraction) ||
    !validDate ||
    slot.length > 100 ||
    Boolean(
      partySize &&
      (!/^[1-9]\d*$/.test(partySize) ||
        !Number.isSafeInteger(Number(partySize))),
    );
  const context = new URLSearchParams();
  for (const [key, value] of Object.entries({
    attraction: attractionId,
    date,
    slot,
    party_size: partySize,
  })) {
    if (value) context.set(key, value);
  }
  return { attraction, date, slot, partySize, context, invalid };
}
