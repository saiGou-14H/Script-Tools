import type { RJSFSchema } from "@rjsf/utils";

export interface ScriptVersionSummary {
  id: string;
  script_id: string;
  script_name: string;
  description: string;
  version: string;
  revision: string;
  content_status: string;
  source_digest: string | null;
  schema_digest: string | null;
  artifact_digest: string | null;
  artifact_available: boolean;
  artifact_build_status: string | null;
  latest_build_id: string | null;
  latest_build_status: string | null;
  deployment_states: { status: string; count: string }[];
  current_service_states: { status: string; count: string }[];
}

export interface ScriptActionMetadata {
  name: string;
  title: string;
  input_schema: RJSFSchema | boolean | null;
  input_schema_digest: string | null;
  input_schema_available: boolean;
  output_schema: RJSFSchema | boolean | null;
}

export interface ScriptVersionMetadata extends ScriptVersionSummary {
  default_action: string | null;
  action_source: "DRAFT_MANIFEST" | "STORED_PROJECTION";
  actions: ScriptActionMetadata[];
}
