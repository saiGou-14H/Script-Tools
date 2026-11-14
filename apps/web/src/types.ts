export type Role = "GUEST" | "USER" | "PUBLISHER" | "ADMIN";
export interface User {
  id: string;
  display_name: string;
  roles: Role[];
  capabilities: string[];
  security_revision: number;
}
export interface Service {
  id: string;
  title: string;
  description: string;
  category: string;
  scene_key: string | null;
  amount_minor: string;
  currency: string;
  release_id: string;
  script_version_id: string;
  action: string;
  deployment_status: string;
  max_service_seconds: number | string;
  resolution_seconds?: number | string;
  validity_seconds?: number | string;
  script_version?: string;
  published_at?: string;
  updated_at?: string;
  output_schema?: import("@rjsf/utils").RJSFSchema | boolean;
  availability?: { can_purchase: boolean; reason: string | null };
  price_plan_id: string;
  input_schema: import("@rjsf/utils").RJSFSchema;
  input_schema_digest: string;
  input_ui_schema?: import("@rjsf/utils").UiSchema;
  delivery_policy: {
    summary: string;
    publisher_name: string;
    icon: string;
    development_fixture?: boolean;
  };
  refund_policy: { summary: string };
}
export interface Bootstrap {
  user: User | null;
  csrf_token: string | null;
  data_mode: "prototype" | "live";
  demo_accounts: { email: string; name: string; role: Role }[];
}

export interface PublisherProfile {
  id: string;
  public_name: string;
  description: string;
  terms_version: string;
  enabled: boolean;
  revision: string;
  created_at: string;
  updated_at: string;
}
export interface PublisherProfileView {
  profile: PublisherProfile | null;
  terms: { version: string; paragraphs: string[] };
}

export interface OutputMetadata {
  id: string;
  revision: string;
  kind: "file" | "text" | "json" | "message";
  title: string | null;
  file_name: string | null;
  media_type: string;
  size_bytes: string;
  status: string;
  availability: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  failure_code: string | null;
  batch_id: string;
  batch_key: string;
  phase: "ACTION" | "OUTPUT_HOOK";
  run_id: string;
  run_status: string;
  task_name: string;
  content_access_configured: boolean;
  deliveries: {
    id: string;
    status: string;
    attempt_count: string;
    next_attempt_at: string | null;
  }[];
}

export interface PersonalOverview {
  as_of: string;
  window: { from: string; to: string };
  fees: {
    currency: string;
    funded_service_fee_minor: string;
    refunded_service_fee_minor: string;
  }[];
  counts: {
    unused_entitlements: string;
    in_progress: string;
    pending_actions: string;
    processing_refunds: string;
    tasks: string;
    runs: string;
    ready_outputs: string;
    entitlements: string;
  };
  services: {
    id: string;
    title: string;
    description: string;
    icon: string | null;
    status: string;
    order_id: string;
    valid_until: string;
    created_at: string;
  }[];
  orders: {
    id: string;
    title: string;
    icon: string | null;
    status: string;
    amount_minor: string;
    currency: string;
    created_at: string;
  }[];
  activity: {
    id: string;
    task_id: string;
    task_name: string;
    status: string;
    updated_at: string;
  }[];
  pending: {
    id: string;
    run_id: string;
    task_name: string;
    reason: string;
    created_at: string;
  }[];
  results: {
    id: string;
    kind: string;
    file_name: string | null;
    title: string | null;
    task_name: string;
    run_id: string;
    icon: string;
    created_at: string;
  }[];
}
