export interface RunMetadata {
  id: string;
  revision: string;
  task_id: string;
  script_version_id: string;
  run_mode: string;
  status: string;
  effect_status: string;
  verification_status: string;
  completion_kind: string | null;
  finished_at: string | null;
  last_progress_at: string | null;
  stop_requested_at: string | null;
  stop_deadline: string | null;
  deadline: string | null;
  restart_count: number;
  current_continuation: string;
  latest_attempt: {
    id: string;
    attempt_no: number;
    status: string;
    node_id: string;
    requested_execution_mode: string;
    actual_execution_mode: string | null;
    lease_generation: string;
    lease_state: string;
    lease_expires_at: string | null;
    last_heartbeat_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    exit_code: number | null;
    cleanup_status: string | null;
    environment_stopped_at: string | null;
  } | null;
}
export interface PlatformLogSegmentMetadata {
  id: string;
  revision: string;
  source_instance_id: string;
  sequence_start: string;
  sequence_end: string;
  size_bytes: string;
  started_at: string;
  ended_at: string;
  archive_status: string;
  index_status: string;
  expires_at: string;
  expired: boolean;
}
export interface AlertMetadata {
  id: string;
  rule_id: string;
  revision: string;
  occurrence: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  recovered_at: string | null;
  rule_key: string;
  rule_version: number;
  severity: string;
  event_count: string;
  evidence_event_count: string;
}
export const runStateLabels: Record<string, string> = {
  QUEUED: "排队中",
  PREPARING: "准备中",
  READY: "就绪",
  RUNNING: "运行中",
  STOPPING: "停止中",
  WAITING_INPUT: "等待输入",
  RECONCILING: "效果核验中",
  SUCCEEDED: "执行成功",
  FAILED: "执行失败",
  TIMED_OUT: "超时",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
  CLOSED_UNRESOLVED: "结果未明关闭",
};
export const diagnosticTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未记录";
