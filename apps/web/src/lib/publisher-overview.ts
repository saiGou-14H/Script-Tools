import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspace } from "../context";

export interface PublisherOverview {
  as_of: string;
  window: {
    from: string;
    to: string;
    timezone: "UTC";
    day_from: string;
    week_from: string;
  };
  filters: {
    service_id: string | null;
    version: number | null;
    q: string;
    status: string | null;
  };
  deployment_basis: "registered_status";
  balance_scope: "publisher_current";
  counts: Record<
    | "services"
    | "active_services"
    | "draft_services"
    | "off_sale_services"
    | "matching_services"
    | "deployments"
    | "ready_deployments"
    | "abnormal_deployments"
    | "window_sales"
    | "today_sales"
    | "processing_refunds",
    string
  >;
  services: {
    id: string;
    title: string;
    status: string;
    sale_group: string;
    script_name: string | null;
    script_version: string | null;
    script_id: string | null;
    script_version_id: string | null;
    deployment_id: string | null;
    deployment_status: string | null;
    has_health_evidence: boolean | null;
    last_health_at: string | null;
    refund_summary: string | null;
    amount_minor: string | null;
    currency: string | null;
    sold_count: string;
    sales: { currency: string; funded_minor: string }[];
    icon: string | null;
  }[];
  alerts: {
    id: string;
    script_name: string;
    status: string;
    updated_at: string;
  }[];
  refunds: {
    id: string;
    order_id: string;
    title: string;
    status: string;
    amount_minor: string;
    currency: string;
    created_at: string;
  }[];
  finances: {
    currency: string;
    funded_minor: string;
    refunded_minor: string;
    pending_minor: string;
    settled_minor: string;
    allocated_minor: string;
    today_allocated_minor: string;
    yesterday_allocated_minor: string;
    week_allocated_minor: string;
  }[];
}

export function usePublisherOverview(search: string, enabled: boolean) {
  const { bootstrap } = useWorkspace();
  return useQuery({
    queryKey: [
      "publisher-overview",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      search,
    ],
    queryFn: ({ signal }) =>
      api<PublisherOverview>(`/publisher/overview?${search}`, { signal }),
    enabled,
    refetchInterval: 30_000,
  });
}
