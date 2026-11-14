import { useInfiniteQuery } from "@tanstack/react-query";
import { apiPage } from "../api";
import { useWorkspace } from "../context";

export interface AdminUserMetadata {
  id: string;
  display_name_mask: string;
  account_mask: string;
  status: string;
  revision: string;
  publisher: boolean;
  is_current: boolean;
  is_last_access_manager: boolean;
  quota_resource_count: string;
  open_order_count: string;
}

export interface AdminQuotaMetadata {
  id: string;
  revision: string;
  resource_key: string;
  window_start: string;
  limit_amount: string;
  reserved_amount: string;
  consumed_amount: string;
  available_amount: string;
}

export interface AdminCatalogMetadata {
  id: string;
  kind: "service" | "script_version";
  title: string;
  publisher: string;
  status: string;
  revision: string;
  release_id: string | null;
  script_version_id: string | null;
  version: string | null;
  content_status: string | null;
  deployment_status: string | null;
  entitlement_count: string;
  development_fixture: boolean;
}

export function useAdminMetadata<T>(
  resource: string,
  search: string,
  enabled: boolean,
) {
  const { bootstrap } = useWorkspace();
  return useInfiniteQuery({
    queryKey: [
      "admin",
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
      return apiPage<T>(`/admin/${resource}?${params}`, { signal });
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
  });
}
