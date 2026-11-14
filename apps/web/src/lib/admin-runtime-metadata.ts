export interface RuntimeNodeMetadata {
  id: string;
  name: string;
  status: string;
  revision: string;
  last_heartbeat_at: string | null;
  clock_offset_ms: string | null;
  isolation_epoch: string;
  cpu_cores: string | null;
  memory_mib: string | null;
  active_leases: string;
  expired_unrevoked_leases: string;
  cleanup_pending: string;
  cleanup_failed: string;
}
export interface RuntimeImageMetadata {
  id: string;
  name: string;
  digest: string;
  language: string;
  version: string;
  architecture: string;
  modes: string[];
  status: string;
  revision: string;
  has_evidence: boolean;
  development_fixture: boolean;
}
export interface CapacityQuotaMetadata {
  id: string;
  scope: "GLOBAL" | "NODE";
  scope_key: string;
  resource_key: string;
  window_start: string;
  revision: string;
  limit_amount: string;
  reserved_amount: string;
  consumed_amount: string;
  available_amount: string;
}
export interface SchedulingMetadata {
  as_of: string;
  counts: {
    queued_runs: string;
    active_runs: string;
    waiting_bookings: string;
    unreported_mode_leases: string;
  };
  modes: {
    mode: string;
    active_leases: string;
    expired_unrevoked_leases: string;
  }[];
}
export const runtimeModeLabels: Record<string, string> = {
  docker: "Docker",
  qemu_kvm: "KVM",
  qemu_tcg: "TCG",
};
export const nodeStateLabels: Record<string, string> = {
  REGISTERING: "注册中",
  ONLINE: "在线",
  DRAINING: "排空中",
  OFFLINE: "离线",
  QUARANTINED: "已隔离",
};
