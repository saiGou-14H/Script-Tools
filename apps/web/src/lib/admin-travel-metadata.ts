export interface CityMetadata {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  revision: string;
  attraction_count: string;
}
export interface AttractionMetadata {
  id: string;
  city_id: string;
  name: string;
  description: string;
  timezone: string;
  enabled: boolean;
  city_enabled: boolean;
  revision: string;
  ticket_price_kind: "FREE";
  channel_count: string;
  rule_source_count: string;
  linked_service_count: string;
}
export interface ChannelMetadata {
  id: string;
  attraction_id: string;
  attraction_name: string;
  name: string;
  official_url: string;
  timezone: string;
  adapter_status: string;
  revision: string;
  current_rule_version_id: string | null;
  rule_version: number | null;
  source_url: string | null;
  verified_at: string | null;
  has_evidence: boolean;
  rule_binding_state: "BOUND" | "UNBOUND" | "INVALID";
}
export interface ChannelRuleMetadata {
  id: string;
  channel_id: string;
  version: number;
  revision: string;
  source_url: string;
  verified_at: string | null;
  has_evidence: boolean;
  is_current: boolean;
}
export const channelCapabilityLabels: Record<string, string> = {
  UNVERIFIED: "未验证",
  MONITOR_ONLY: "仅监控",
  BOOKING_SUPPORTED: "支持预约",
  DEGRADED: "降级",
  DISABLED: "已禁用",
};
export function metadataTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value))
    : "暂无验证时间";
}
export function sourceHref(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
