export interface DeliveryMetadata {
  id: string;
  revision: string;
  notification_id: string;
  channel: string;
  status: string;
  source: "EVENT" | "OUTPUT";
  event_type: string | null;
  receipt_mask: string | null;
  masked_target: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  dependency_deadline: string | null;
  failure_code: string | null;
  rendering_mode: string | null;
  read_at: string | null;
  notification_expires_at: string;
  notification_expired: boolean;
  binding_state: string;
  binding_verified_at: string | null;
  binding_disabled_at: string | null;
  output_binding_matches: boolean;
  latest_attempt: {
    id: string;
    attempt_no: number;
    status: string;
    sent_at: string | null;
    response_at: string | null;
    receipt_mask: string | null;
    failure_code: string | null;
    duplicate_risk: boolean;
  } | null;
}
export interface FeatureMetadata {
  id: string;
  key: string;
  revision: string;
  enabled: boolean;
  phase: string;
  has_evidence: boolean;
}
export interface PolicyMetadata {
  id: string;
  revision: string;
  version: number;
  policy_key?: string;
  effective_at: string;
  is_current: boolean;
  is_future: boolean;
}
export interface ResourceProfileMetadata {
  id: string;
  name: string;
  revision: string;
  version: number;
  retired_at: string | null;
}
export const deliveryStateLabels: Record<string, string> = {
  PENDING: "排队中",
  SENDING: "发送中",
  SENT: "服务商已接受",
  UNKNOWN: "UNKNOWN",
  FAILED: "失败",
  SUPPRESSED: "已抑制",
};
export const deliveryChannelLabels: Record<string, string> = {
  IN_APP: "站内",
  EMAIL: "邮件",
  WEBHOOK: "Webhook",
  PUSH: "推送",
};
