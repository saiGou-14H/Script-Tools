import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, apiPage } from "../api";
import { useWorkspace } from "../context";

export interface PublisherExecutionRecord {
  id: string;
  revision: string;
  created_at: string;
  updated_at: string;
  script_version_id: string;
  script_id: string;
  script_name: string;
  version: string;
  status: string;
  duration_ms?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  source_digest?: string;
  artifact_digest?: string | null;
  failure_code?: string | null;
  has_log_segments?: boolean;
  has_test_evidence?: boolean;
  test_passed?: boolean | null;
  tested_execution_mode?: string | null;
}

export interface PublisherDeploymentRecord extends PublisherExecutionRecord {
  artifact_digest: string;
  artifact_available: boolean;
  configured_execution_mode: string | null;
  cpu: string | null;
  memory_mib: string | null;
  resource_profile_name: string;
  resource_profile_version: number;
  last_health_at: string | null;
  has_health_evidence: boolean;
  services: {
    id: string;
    title: string;
    status: string;
    is_current: boolean;
  }[];
}

export function usePublisherRecords<T>(
  resource: string,
  search: string,
  enabled: boolean,
) {
  const { bootstrap } = useWorkspace();
  return useInfiniteQuery({
    queryKey: [
      "publisher-records",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      resource,
      search,
    ],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams(search);
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);
      return apiPage<T>(`/${resource}?${params}`, { signal });
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
  });
}

export function usePublisherRecord<T>(
  resource: string,
  id: string | null,
  enabled: boolean,
) {
  const { bootstrap } = useWorkspace();
  return useQuery({
    queryKey: [
      "publisher-record",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      resource,
      id,
    ],
    enabled: enabled && !!id,
    retry: false,
    queryFn: ({ signal }) =>
      api<T>(`/${resource}/${encodeURIComponent(id!)}`, { signal }),
  });
}

export function recordDuration(milliseconds?: string | null) {
  if (milliseconds == null || !/^\d+$/.test(milliseconds)) return "—";
  const value = BigInt(milliseconds);
  if (value < 1000n) return `${value}ms`;
  const seconds = value / 1000n;
  return seconds < 60n ? `${seconds}s` : `${seconds / 60n}m${seconds % 60n}s`;
}

export const executionRecordLabels: Record<string, string> = {
  QUEUED: "排队中",
  PREPARING: "准备中",
  READY: "就绪",
  RUNNING: "运行中",
  STOPPING: "停止中",
  WAITING_INPUT: "等待输入",
  RECONCILING: "核验中",
  SUCCEEDED: "成功",
  FAILED: "失败",
  TIMED_OUT: "超时",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
  CLOSED_UNRESOLVED: "未核清关闭",
};

export const deploymentModeLabels: Record<string, string> = {
  docker: "Docker",
  qemu_kvm: "KVM",
  qemu_tcg: "TCG",
};
