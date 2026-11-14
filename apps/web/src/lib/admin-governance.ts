export interface GrantMetadata {
  id: string;
  revision: string;
  account_mask: string;
  account_status: string;
  capabilities: string[];
  reason: string;
  expires_at: string | null;
  revoked_at: string | null;
  status: string;
  is_current_user: boolean;
  is_last_access_manager: boolean;
}
export interface AuditMetadata {
  id: string;
  created_at: string;
  revision: string;
  actor_mask: string;
  subject_mask: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string;
  outcome: string;
  before_revision: string | null;
  after_revision: string | null;
  reason: string | null;
}
export interface AccessSessionMetadata {
  id: string;
  revision: string;
  capability_grant_id: string;
  purpose: string;
  ticket_ref: string;
  scope_count: string;
  expires_at: string;
  revoked_at: string | null;
  status: string;
}
export interface BackupMetadata {
  id: string;
  revision: string;
  completed_at: string;
  expires_at: string;
  expired: boolean;
  has_revocation_watermark: boolean;
}
export interface DrillMetadata {
  id: string;
  revision: string;
  backup_id: string;
  backup_completed_at: string;
  backup_expired: boolean;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  has_evidence: boolean;
}
export interface CleanupMetadata {
  id: string;
  revision: string;
  request_id: string;
  request_status: string;
  scope_type: string;
  store: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  latest_backup_expiry: string | null;
}
export interface RetentionPolicyMetadata {
  id: string;
  revision: string;
  kind: string;
  version: number;
  effective_at: string;
  is_current: boolean;
  is_future: boolean;
}
export const grantStateLabels: Record<string, string> = {
  ACTIVE: "生效中",
  REVOKED: "已撤销",
  EXPIRED: "已到期",
  ACCOUNT_INACTIVE: "账号不可用",
};
export const governanceCapabilities = [
  ["commerce.manage", "管理服务订单、退款与结算"],
  ["catalog.manage", "维护目录、风险停销与核查恢复"],
  ["runtime.manage", "管理运行环境与调度配置"],
  ["access.manage", "管理账号、角色与权限授权"],
  ["data.diagnose", "按对象与字段范围限时读取排障数据，密钥不可读"],
];
