CREATE SCHEMA travel;
SET search_path = travel, pg_catalog;

CREATE TABLE users (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  email_normalized TEXT,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  security_revision BIGINT NOT NULL DEFAULT 1 CHECK (security_revision > 0),
  verified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED', 'ACTIVE', 'FROZEN', 'CLOSING', 'CLOSED')),
  CONSTRAINT ck_users_1 CHECK (status = 'CLOSED' OR (email_normalized IS NOT NULL AND password_hash IS NOT NULL)),
  CONSTRAINT ck_users_2 CHECK (status <> 'CLOSED' OR (email_normalized IS NULL AND password_hash IS NULL AND closed_at IS NOT NULL))
);

COMMENT ON TABLE users IS '个人账号';

CREATE TABLE user_preferences (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preferences)='object'),
  CONSTRAINT uq_user_preferences_owner_user_id UNIQUE (owner_user_id),
  CONSTRAINT uq_user_preferences_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE user_preferences IS '个人偏好';

CREATE TABLE private_payloads (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  purpose TEXT NOT NULL,
  key_version TEXT NOT NULL,
  ciphertext BYTEA,
  object_key TEXT,
  content_hmac TEXT NOT NULL,
  encoding TEXT NOT NULL DEFAULT 'json-utf8',
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_private_payloads_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_private_payloads_1 CHECK ((deleted_at IS NULL AND num_nonnulls(ciphertext,object_key)=1) OR (deleted_at IS NOT NULL AND ciphertext IS NULL AND object_key IS NULL))
);

COMMENT ON TABLE private_payloads IS '加密私有正文';

CREATE TABLE auth_sessions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  token_hash TEXT NOT NULL,
  security_revision BIGINT NOT NULL,
  authenticated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  client_summary TEXT,
  CONSTRAINT uq_auth_sessions_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_auth_sessions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE auth_sessions IS '登录会话';

CREATE TABLE auth_challenges (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD','EMAIL_OLD','EMAIL_NEW','BINDING_VERIFY','CLOSURE_RECEIPT','ACCOUNT_RECOVERY')),
  token_hash TEXT NOT NULL,
  target_payload_id UUID,
  group_key UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  CONSTRAINT uq_auth_challenges_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_auth_challenges_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE auth_challenges IS '单次认证挑战';

CREATE TABLE recovery_intakes (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  receipt_token_hash TEXT NOT NULL,
  candidate_user_id UUID,
  ciphertext BYTEA,
  key_version TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  erased_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'CHALLENGED', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT uq_recovery_intakes_receipt_token_hash UNIQUE (receipt_token_hash),
  CONSTRAINT ck_recovery_intakes_1 CHECK (erased_at IS NULL OR ciphertext IS NULL)
);

COMMENT ON TABLE recovery_intakes IS '匿名恢复材料隔离接收';

CREATE TABLE account_recovery_cases (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  intake_id UUID NOT NULL,
  requester_payload_id UUID NOT NULL,
  challenge_group UUID NOT NULL,
  reason TEXT NOT NULL,
  resolution_payload_id UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'VERIFYING', 'RESOLVED', 'REJECTED', 'CLOSED')),
  CONSTRAINT uq_account_recovery_cases_intake_id UNIQUE (intake_id),
  CONSTRAINT uq_account_recovery_cases_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE account_recovery_cases IS '账号恢复例外工单';

CREATE TABLE management_role_grants (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role='ADMIN'),
  capabilities TEXT[] NOT NULL CHECK (cardinality(capabilities)>0),
  granted_by UUID,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_management_role_grants_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE management_role_grants IS '后台能力授权';

CREATE TABLE management_guard (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  singleton BOOLEAN NOT NULL DEFAULT true CHECK (singleton),
  bootstrap_consumed_at TIMESTAMPTZ,
  CONSTRAINT uq_management_guard_singleton UNIQUE (singleton)
);

COMMENT ON TABLE management_guard IS '权限管理员保护锁';

CREATE TABLE data_access_sessions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  capability_grant_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  ticket_ref TEXT NOT NULL,
  scope JSONB NOT NULL CHECK (jsonb_typeof(scope)='array'),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_data_access_sessions_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_data_access_sessions_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_data_access_sessions_1 CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour')
);

COMMENT ON TABLE data_access_sessions IS '管理员短时排障范围';

CREATE TABLE personal_api_tokens (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  token_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT uq_personal_api_tokens_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_personal_api_tokens_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE personal_api_tokens IS '个人API令牌';

CREATE TABLE action_previews (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  action_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_revision BIGINT NOT NULL,
  scope_digest TEXT NOT NULL,
  summary JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT uq_action_previews_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_action_previews_1 CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);

COMMENT ON TABLE action_previews IS '有期限操作预览';

CREATE TABLE storage_objects (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  purpose TEXT NOT NULL,
  bucket_alias TEXT NOT NULL,
  object_key TEXT NOT NULL,
  object_version TEXT,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  key_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'READY', 'QUARANTINED', 'DELETED')),
  CONSTRAINT uq_storage_objects_bucket_alias_object_key UNIQUE (bucket_alias,object_key),
  CONSTRAINT uq_storage_objects_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE storage_objects IS '私有对象存储登记';

CREATE TABLE script_uploads (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  object_id UUID,
  expected_size BIGINT NOT NULL CHECK (expected_size > 0),
  expected_sha256 TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UPLOADING', 'UPLOADED', 'ABORTED', 'EXPIRED')),
  CONSTRAINT uq_script_uploads_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE script_uploads IS '源代码上传会话';

CREATE TABLE scripts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility='PRIVATE'),
  retired_at TIMESTAMPTZ,
  CONSTRAINT uq_scripts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE scripts IS '代码资产';

CREATE TABLE script_versions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_id UUID NOT NULL,
  version TEXT NOT NULL,
  source_object_id UUID,
  manifest JSONB,
  content_hash TEXT,
  schema_digest TEXT,
  build_artifact_id UUID,
  sealed_at TIMESTAMPTZ,
  revoked_reason TEXT,
  content_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (content_status IN ('DRAFT', 'SEALED', 'READY', 'RETIRED', 'REVOKED')),
  CONSTRAINT uq_script_versions_script_id_version UNIQUE (script_id,version),
  CONSTRAINT uq_script_versions_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_script_versions_1 CHECK (content_status='DRAFT' OR (source_object_id IS NOT NULL AND manifest IS NOT NULL AND content_hash IS NOT NULL AND schema_digest IS NOT NULL AND sealed_at IS NOT NULL)),
  CONSTRAINT ck_script_versions_2 CHECK (content_status NOT IN ('READY','RETIRED') OR build_artifact_id IS NOT NULL)
);

COMMENT ON TABLE script_versions IS '封存脚本版本';

CREATE TABLE script_actions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  name TEXT NOT NULL,
  handler TEXT,
  input_schema JSONB NOT NULL,
  input_schema_digest TEXT NOT NULL,
  output_schema JSONB,
  output_schema_digest TEXT,
  definition JSONB NOT NULL,
  CONSTRAINT uq_script_actions_script_version_id_name UNIQUE (script_version_id,name),
  CONSTRAINT uq_script_actions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE script_actions IS '封存动作关系投影';

CREATE TABLE script_imports (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('upload','git','url')),
  source_payload_id UUID NOT NULL,
  source_credential_version_id UUID,
  resolved_revision TEXT,
  snapshot_object_id UUID,
  snapshot_digest TEXT,
  materialized_version_id UUID,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'FETCHING', 'READY', 'FAILED', 'CANCELLED')),
  CONSTRAINT uq_script_imports_materialized_version_id UNIQUE (materialized_version_id),
  CONSTRAINT uq_script_imports_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE script_imports IS '来源导入候选';

CREATE TABLE import_attempts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  import_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT uq_import_attempts_import_id_attempt_no UNIQUE (import_id,attempt_no),
  CONSTRAINT uq_import_attempts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE import_attempts IS '获取尝试';

CREATE TABLE version_adapter_specs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  payload_id UUID NOT NULL,
  spec_digest TEXT NOT NULL,
  runtime_digest TEXT NOT NULL,
  CONSTRAINT uq_version_adapter_specs_script_version_id UNIQUE (script_version_id),
  CONSTRAINT uq_version_adapter_specs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE version_adapter_specs IS '固定兼容描述';

CREATE TABLE runtime_images (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  digest TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('python','node','guest','adapter')),
  version TEXT NOT NULL,
  architecture TEXT NOT NULL DEFAULT 'x86_64',
  modes TEXT[] NOT NULL CHECK (cardinality(modes)>0),
  evidence JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY', 'RETIRED', 'REVOKED')),
  CONSTRAINT uq_runtime_images_digest UNIQUE (digest)
);

COMMENT ON TABLE runtime_images IS '全局运行镜像';

CREATE TABLE builds (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  base_image_id UUID NOT NULL,
  source_digest TEXT NOT NULL,
  artifact_digest TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT uq_builds_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE builds IS '隔离依赖构建';

CREATE TABLE artifacts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  build_id UUID NOT NULL,
  object_id UUID NOT NULL,
  digest TEXT NOT NULL,
  dependency_manifest JSONB NOT NULL,
  CONSTRAINT uq_artifacts_build_id UNIQUE (build_id),
  CONSTRAINT uq_artifacts_owner_user_id_digest UNIQUE (owner_user_id,digest),
  CONSTRAINT uq_artifacts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE artifacts IS '代码和依赖制品';

CREATE TABLE version_test_evidence (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  run_id UUID NOT NULL,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('docker','qemu_kvm','qemu_tcg')),
  passed BOOLEAN NOT NULL,
  evidence_digest TEXT NOT NULL,
  CONSTRAINT uq_version_test_evidence_run_id UNIQUE (run_id),
  CONSTRAINT uq_version_test_evidence_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE version_test_evidence IS '版本测试证据';

CREATE TABLE deployments (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  artifact_id UUID NOT NULL,
  resource_profile_id UUID NOT NULL,
  runtime_snapshot JSONB NOT NULL,
  health_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_health_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DEPLOYING', 'READY', 'FAILED', 'DEGRADED', 'STOPPED')),
  CONSTRAINT uq_deployments_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE deployments IS '服务部署配置';

CREATE TABLE nodes (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  certificate_fingerprint TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at TIMESTAMPTZ,
  clock_offset_ms BIGINT,
  isolation_epoch BIGINT NOT NULL DEFAULT 1 CHECK (isolation_epoch>0),
  status TEXT NOT NULL DEFAULT 'REGISTERING' CHECK (status IN ('REGISTERING', 'ONLINE', 'DRAINING', 'OFFLINE', 'QUARANTINED')),
  CONSTRAINT uq_nodes_certificate_fingerprint UNIQUE (certificate_fingerprint)
);

COMMENT ON TABLE nodes IS '可信执行节点';

CREATE TABLE node_commands (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  node_id UUID NOT NULL,
  command_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('START','STOP','ISOLATE','CLEANUP','DRAIN','PROBE')),
  attempt_id UUID,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'ACKED', 'FAILED', 'EXPIRED')),
  CONSTRAINT uq_node_commands_command_id UNIQUE (command_id)
);

COMMENT ON TABLE node_commands IS '节点受控命令回执';

CREATE TABLE resource_profiles (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  version INT NOT NULL CHECK (version>0),
  limits JSONB NOT NULL,
  retired_at TIMESTAMPTZ,
  CONSTRAINT uq_resource_profiles_name_version UNIQUE (name,version)
);

COMMENT ON TABLE resource_profiles IS '版本化资源模板';

CREATE TABLE runtime_policies (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  version INT NOT NULL CHECK (version>0),
  policy JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  CONSTRAINT uq_runtime_policies_version UNIQUE (version)
);

COMMENT ON TABLE runtime_policies IS '版本化执行策略';

CREATE TABLE network_policies (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  policy_key TEXT NOT NULL,
  version INT NOT NULL CHECK (version>0),
  rules JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  CONSTRAINT uq_network_policies_policy_key_version UNIQUE (policy_key,version)
);

COMMENT ON TABLE network_policies IS '版本化出站策略';

CREATE TABLE credentials (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  current_version_id UUID,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_credentials_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE credentials IS '个人凭据资产';

CREATE TABLE credential_versions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  credential_id UUID NOT NULL,
  version INT NOT NULL CHECK (version>0),
  payload_id UUID NOT NULL,
  allowed_targets JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_credential_versions_credential_id_version UNIQUE (credential_id,version),
  CONSTRAINT uq_credential_versions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE credential_versions IS '不可变凭据版本';

CREATE TABLE execution_authorizations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  config_digest TEXT,
  grants JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT uq_execution_authorizations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE execution_authorizations IS '执行授权快照';

CREATE TABLE authorization_credentials (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  authorization_id UUID NOT NULL,
  alias TEXT NOT NULL,
  credential_version_id UUID NOT NULL,
  CONSTRAINT uq_authorization_credentials_authorization_id_alias UNIQUE (authorization_id,alias),
  CONSTRAINT uq_authorization_credentials_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE authorization_credentials IS '授权凭据绑定';

CREATE TABLE quota_accounts (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  scope TEXT NOT NULL CHECK (scope IN ('USER','NODE','TARGET','GLOBAL')),
  scope_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  limit_amount BIGINT NOT NULL CHECK (limit_amount >= 0),
  reserved_amount BIGINT NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  consumed_amount BIGINT NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  CONSTRAINT uq_quota_accounts_scope_scope_key_resource_key_window_start UNIQUE (scope,scope_key,resource_key,window_start),
  CONSTRAINT ck_quota_accounts_1 CHECK (reserved_amount + consumed_amount <= limit_amount)
);

COMMENT ON TABLE quota_accounts IS '配额计数与隔离容量';

CREATE TABLE quota_reservations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  quota_account_id UUID NOT NULL,
  attempt_id UUID,
  output_upload_id UUID,
  resource_key TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  CONSTRAINT uq_quota_reservations_attempt_id_quota_account__6772760f5bb8 UNIQUE (attempt_id,quota_account_id,resource_key),
  CONSTRAINT uq_quota_reservations_output_upload_id_quota_ac_94cacb8ed897 UNIQUE (output_upload_id,quota_account_id,resource_key),
  CONSTRAINT uq_quota_reservations_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_quota_reservations_1 CHECK (num_nonnulls(attempt_id,output_upload_id)=1)
);

COMMENT ON TABLE quota_reservations IS '配额预占明细';

CREATE TABLE resource_usage_segments (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempt_id UUID NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence>=0),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  usage JSONB NOT NULL,
  CONSTRAINT uq_resource_usage_segments_attempt_id_sequence UNIQUE (attempt_id,sequence),
  CONSTRAINT uq_resource_usage_segments_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_resource_usage_segments_1 CHECK (ended_at>=started_at)
);

COMMENT ON TABLE resource_usage_segments IS '持续用量分段';

CREATE TABLE publisher_profiles (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  public_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_publisher_profiles_owner_user_id UNIQUE (owner_user_id),
  CONSTRAINT uq_publisher_profiles_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE publisher_profiles IS '发布者公开资料';

CREATE TABLE payout_profiles (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  version INT NOT NULL CHECK (version>0),
  provider TEXT NOT NULL,
  merchant_account TEXT NOT NULL,
  account_payload_id UUID NOT NULL,
  masked_account TEXT NOT NULL,
  verified_reference TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'INVALID', 'REVOKED')),
  CONSTRAINT uq_payout_profiles_owner_user_id_version UNIQUE (owner_user_id,version),
  CONSTRAINT uq_payout_profiles_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payout_profiles IS '发布者收款资料版本';

CREATE TABLE service_categories (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_service_categories_key UNIQUE (key)
);

COMMENT ON TABLE service_categories IS '服务分类';

CREATE TABLE services (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id UUID NOT NULL,
  scene_key TEXT,
  current_release_id UUID,
  blocked_reason TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED', 'BLOCKED')),
  CONSTRAINT uq_services_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE services IS '脚本服务商品';

CREATE TABLE service_releases (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  service_id UUID NOT NULL,
  version INT NOT NULL CHECK (version>0),
  script_version_id UUID NOT NULL,
  deployment_id UUID NOT NULL,
  action TEXT NOT NULL,
  input_schema_digest TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  delivery_policy JSONB NOT NULL,
  goal_definition JSONB NOT NULL,
  verification_method JSONB NOT NULL,
  refund_policy JSONB NOT NULL,
  max_service_seconds BIGINT NOT NULL CHECK (max_service_seconds>0),
  resolution_seconds BIGINT NOT NULL CHECK (resolution_seconds>0),
  contract_digest TEXT NOT NULL,
  CONSTRAINT uq_service_releases_service_id_version UNIQUE (service_id,version),
  CONSTRAINT uq_service_releases_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE service_releases IS '不可变服务发布合同';

CREATE TABLE commerce_policies (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  version INT NOT NULL CHECK (version>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  platform_fee_bps INT NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  platform_fixed_fee_minor BIGINT NOT NULL CHECK (platform_fixed_fee_minor>=0),
  channel_cost_bearer TEXT NOT NULL CHECK (channel_cost_bearer IN ('PLATFORM','PUBLISHER')),
  rounding_rule TEXT NOT NULL CHECK (rounding_rule IN ('FLOOR_PLATFORM_REMAINDER_PUBLISHER')),
  settlement_delay_seconds BIGINT NOT NULL CHECK (settlement_delay_seconds>=0),
  refund_rules JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  CONSTRAINT uq_commerce_policies_version_currency UNIQUE (version,currency)
);

COMMENT ON TABLE commerce_policies IS '平台费用及结算规则';

CREATE TABLE price_plans (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  service_release_id UUID NOT NULL,
  version INT NOT NULL CHECK (version>0),
  commerce_policy_id UUID NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'PER_USE' CHECK (billing_mode='PER_USE'),
  unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  use_limit INT NOT NULL DEFAULT 1 CHECK (use_limit=1),
  validity_seconds BIGINT NOT NULL CHECK (validity_seconds>0),
  retired_at TIMESTAMPTZ,
  CONSTRAINT uq_price_plans_service_release_id_version UNIQUE (service_release_id,version),
  CONSTRAINT uq_price_plans_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE price_plans IS '不可变按次价格方案';

CREATE TABLE quotes (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  publisher_id UUID NOT NULL,
  service_release_id UUID NOT NULL,
  price_plan_id UUID NOT NULL,
  authorization_id UUID NOT NULL,
  input_payload_id UUID NOT NULL,
  input_digest TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  terms_snapshot JSONB NOT NULL,
  snapshot_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_quotes_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE quotes IS '一次性报价快照';

CREATE TABLE service_orders (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  publisher_id UUID NOT NULL,
  quote_id UUID NOT NULL,
  service_release_id UUID NOT NULL,
  price_plan_id UUID NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity=1),
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  terms_snapshot JSONB NOT NULL,
  terms_digest TEXT NOT NULL,
  payment_deadline TIMESTAMPTZ NOT NULL,
  funding_payment_id UUID,
  funding_transaction_id UUID,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK (status IN ('AWAITING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT uq_service_orders_quote_id UNIQUE (quote_id),
  CONSTRAINT uq_service_orders_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_service_orders_1 CHECK (num_nonnulls(funding_payment_id,funding_transaction_id) IN (0,2))
);

COMMENT ON TABLE service_orders IS '平台服务订单';

CREATE TABLE payments (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  order_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  provider TEXT NOT NULL,
  merchant_account TEXT NOT NULL,
  provider_request_id TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_action_payload_id UUID,
  next_reconcile_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CLOSED', 'UNKNOWN')),
  CONSTRAINT uq_payments_order_id_attempt_no UNIQUE (order_id,attempt_no),
  CONSTRAINT uq_payments_provider_merchant_account_provider_request_id UNIQUE (provider,merchant_account,provider_request_id),
  CONSTRAINT uq_payments_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payments IS '支付请求尝试';

CREATE TABLE provider_receipts (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  provider TEXT NOT NULL,
  merchant_account TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('PAYMENT','REFUND','PAYOUT')),
  provider_event_id TEXT NOT NULL,
  provider_transaction_id TEXT,
  payload_digest TEXT NOT NULL,
  ciphertext BYTEA,
  key_version TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  matched_owner_id UUID,
  failure_code TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VERIFIED', 'APPLIED', 'REJECTED', 'UNMATCHED')),
  CONSTRAINT uq_provider_receipts_provider_merchant_account__4da2192c3884 UNIQUE (provider,merchant_account,event_kind,provider_event_id)
);

COMMENT ON TABLE provider_receipts IS '资金渠道原始回执隔离区';

CREATE TABLE payment_transactions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  payment_id UUID NOT NULL,
  order_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  provider TEXT NOT NULL,
  merchant_account TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  received_at TIMESTAMPTZ NOT NULL,
  refunded_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_amount_minor>=0),
  refund_reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (refund_reserved_minor>=0),
  allocation TEXT NOT NULL CHECK (allocation IN ('FUNDING','EXCESS','LATE','SUSPENSE')),
  CONSTRAINT uq_payment_transactions_provider_merchant_accou_05c84a75981c UNIQUE (provider,merchant_account,provider_transaction_id),
  CONSTRAINT uq_payment_transactions_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_payment_transactions_1 CHECK (refunded_amount_minor+refund_reserved_minor<=amount_minor)
);

COMMENT ON TABLE payment_transactions IS '真实收款事实';

CREATE TABLE payment_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  payment_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_payment_events_receipt_id UNIQUE (receipt_id),
  CONSTRAINT uq_payment_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payment_events IS '支付事件处理回执';

CREATE TABLE entitlements (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  order_id UUID NOT NULL,
  service_release_id UUID NOT NULL,
  use_limit INT NOT NULL DEFAULT 1 CHECK (use_limit=1),
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND 1),
  reserved_count INT NOT NULL DEFAULT 0 CHECK (reserved_count BETWEEN 0 AND 1),
  valid_until TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  service_deadline TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'RESERVED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  CONSTRAINT uq_entitlements_order_id UNIQUE (order_id),
  CONSTRAINT uq_entitlements_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_entitlements_1 CHECK (used_count+reserved_count<=use_limit),
  CONSTRAINT ck_entitlements_2 CHECK (status<>'CONSUMED' OR (used_count=1 AND consumed_at IS NOT NULL AND service_deadline IS NOT NULL))
);

COMMENT ON TABLE entitlements IS '一次使用权益';

CREATE TABLE usage_reservations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  entitlement_id UUID NOT NULL,
  run_id UUID NOT NULL,
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
  CONSTRAINT uq_usage_reservations_run_id UNIQUE (run_id),
  CONSTRAINT uq_usage_reservations_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_usage_reservations_1 CHECK (status<>'COMMITTED' OR committed_at IS NOT NULL),
  CONSTRAINT ck_usage_reservations_2 CHECK (status<>'RELEASED' OR released_at IS NOT NULL)
);

COMMENT ON TABLE usage_reservations IS '权益Run预占与消耗';

CREATE TABLE fulfillment_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  order_id UUID NOT NULL,
  run_id UUID,
  source_event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  evidence_payload_id UUID,
  reason TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('REPORTED','VERIFIED','DISPUTED','NOT_APPLICABLE')),
  CONSTRAINT uq_fulfillment_events_source_event_id UNIQUE (source_event_id),
  CONSTRAINT uq_fulfillment_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE fulfillment_events IS '履约与目标证据';

CREATE TABLE service_disputes (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  order_id UUID NOT NULL,
  reason TEXT NOT NULL,
  evidence_payload_id UUID,
  resolution TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVING', 'RESOLVED', 'CLOSED')),
  CONSTRAINT uq_service_disputes_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE service_disputes IS '售后异常及结算冻结';

CREATE TABLE refunds (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  order_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  payment_transaction_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reserved_at TIMESTAMPTZ NOT NULL,
  succeeded_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  CONSTRAINT uq_refunds_payment_transaction_id_request_key UNIQUE (payment_transaction_id,request_key),
  CONSTRAINT uq_refunds_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE refunds IS '逻辑退款及资金预占';

CREATE TABLE refund_attempts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  refund_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  provider_request_id TEXT NOT NULL,
  provider_ref TEXT,
  next_reconcile_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  CONSTRAINT uq_refund_attempts_refund_id_attempt_no UNIQUE (refund_id,attempt_no),
  CONSTRAINT uq_refund_attempts_provider_request_id UNIQUE (provider_request_id),
  CONSTRAINT uq_refund_attempts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE refund_attempts IS '退款发送尝试';

CREATE TABLE refund_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  refund_attempt_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_refund_events_receipt_id UNIQUE (receipt_id),
  CONSTRAINT uq_refund_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE refund_events IS '退款可信事件';

CREATE TABLE ledger_accounts (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  party_key TEXT NOT NULL,
  party_user_id UUID,
  code TEXT NOT NULL CHECK (code IN ('CHANNEL_CLEARING','BUYER_LIABILITY','PUBLISHER_PENDING','PUBLISHER_AVAILABLE','PUBLISHER_RESERVED','PUBLISHER_DEBT','PLATFORM_REVENUE','CHANNEL_EXPENSE','REFUND_CLEARING','SUSPENSE')),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT uq_ledger_accounts_party_key_code_currency UNIQUE (party_key,code,currency),
  CONSTRAINT uq_ledger_accounts_id_currency UNIQUE (id,currency)
);

COMMENT ON TABLE ledger_accounts IS '资金科目';

CREATE TABLE ledger_transactions (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_event_id UUID NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  kind TEXT NOT NULL CHECK (kind IN ('RECEIPT','ALLOCATION','MATURITY','REFUND','PAYOUT_RESERVE','PAYOUT','PAYOUT_RELEASE','REVERSAL','SUSPENSE')),
  order_id UUID,
  reversal_of UUID,
  posted_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_ledger_transactions_source_event_id UNIQUE (source_event_id),
  CONSTRAINT uq_ledger_transactions_id_currency UNIQUE (id,currency)
);

COMMENT ON TABLE ledger_transactions IS '平衡记账事件';

CREATE TABLE ledger_entries (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  transaction_id UUID NOT NULL,
  line_no INT NOT NULL CHECK (line_no>0),
  account_id UUID NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor>=0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor>=0),
  order_id UUID,
  publisher_id UUID,
  matures_at TIMESTAMPTZ,
  CONSTRAINT uq_ledger_entries_transaction_id_line_no UNIQUE (transaction_id,line_no),
  CONSTRAINT ck_ledger_entries_1 CHECK ((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0))
);

COMMENT ON TABLE ledger_entries IS '追加复式分录';

CREATE TABLE publisher_balances (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor>=0),
  reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor>=0),
  debt_minor BIGINT NOT NULL DEFAULT 0 CHECK (debt_minor>=0),
  last_ledger_transaction_id UUID,
  CONSTRAINT uq_publisher_balances_owner_user_id_currency UNIQUE (owner_user_id,currency),
  CONSTRAINT uq_publisher_balances_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE publisher_balances IS '发布者余额锁及账本投影';

CREATE TABLE settlement_batches (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  policy_snapshot JSONB NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor>=0),
  freeze_reason TEXT,
  settled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FROZEN', 'READY', 'PROCESSING', 'SETTLED')),
  CONSTRAINT uq_settlement_batches_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_settlement_batches_1 CHECK (period_end>period_start)
);

COMMENT ON TABLE settlement_batches IS '发布者结算批次';

CREATE TABLE settlement_lines (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  batch_id UUID NOT NULL,
  ledger_entry_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor<>0),
  released_at TIMESTAMPTZ,
  CONSTRAINT uq_settlement_lines_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE settlement_lines IS '结算行及占用防重';

CREATE TABLE payouts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  batch_id UUID NOT NULL,
  payout_profile_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_request_id TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  next_reconcile_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PROCESSING', 'PAID', 'FAILED', 'UNKNOWN')),
  CONSTRAINT uq_payouts_batch_id UNIQUE (batch_id),
  CONSTRAINT uq_payouts_provider_request_id UNIQUE (provider_request_id),
  CONSTRAINT uq_payouts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payouts IS '逻辑打款';

CREATE TABLE payout_attempts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  payout_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  provider_request_id TEXT NOT NULL,
  provider_ref TEXT,
  failure_code TEXT,
  next_reconcile_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PROCESSING', 'PAID', 'FAILED', 'UNKNOWN')),
  CONSTRAINT uq_payout_attempts_payout_id_attempt_no UNIQUE (payout_id,attempt_no),
  CONSTRAINT uq_payout_attempts_provider_request_id UNIQUE (provider_request_id),
  CONSTRAINT uq_payout_attempts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payout_attempts IS '打款安全重试记录';

CREATE TABLE payout_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  payout_attempt_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_payout_events_receipt_id UNIQUE (receipt_id),
  CONSTRAINT uq_payout_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE payout_events IS '打款可信事件';

CREATE TABLE financial_reconciliations (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  provider TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PAYMENT','REFUND','PAYOUT','UNMATCHED')),
  payment_id UUID,
  refund_attempt_id UUID,
  payout_attempt_id UUID,
  receipt_id UUID,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  difference JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'MATCHED', 'DIFFERENCE', 'FAILED')),
  CONSTRAINT ck_financial_reconciliations_1 CHECK (num_nonnulls(payment_id,refund_attempt_id,payout_attempt_id,receipt_id)=1)
);

COMMENT ON TABLE financial_reconciliations IS '资金对账与异常任务';

CREATE TABLE tasks (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  name TEXT NOT NULL,
  execution_context TEXT NOT NULL CHECK (execution_context IN ('PAID_SERVICE','PRIVATE_SELF_USE','AUTHOR_TEST')),
  draft_payload_id UUID,
  current_config_version BIGINT,
  next_fire_at TIMESTAMPTZ,
  created_run_count BIGINT NOT NULL DEFAULT 0 CHECK (created_run_count>=0),
  missed_count BIGINT NOT NULL DEFAULT 0 CHECK (missed_count>=0),
  last_missed_at TIMESTAMPTZ,
  concurrency_key TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'ARCHIVED')),
  CONSTRAINT uq_tasks_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_tasks_1 CHECK (status='DRAFT' OR current_config_version IS NOT NULL)
);

COMMENT ON TABLE tasks IS '逻辑任务';

CREATE TABLE task_config_versions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID NOT NULL,
  version BIGINT NOT NULL CHECK (version>0),
  execution_context TEXT NOT NULL CHECK (execution_context IN ('PAID_SERVICE','PRIVATE_SELF_USE','AUTHOR_TEST')),
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  input_payload_id UUID NOT NULL,
  input_digest TEXT NOT NULL,
  schema_digest TEXT NOT NULL,
  schedule JSONB NOT NULL,
  execution JSONB NOT NULL,
  authorization_id UUID NOT NULL,
  service_order_id UUID,
  entitlement_id UUID,
  service_release_id UUID,
  notification_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_digest TEXT NOT NULL,
  CONSTRAINT uq_task_config_versions_task_id_version UNIQUE (task_id,version),
  CONSTRAINT uq_task_config_versions_task_id_version_owner_user_id UNIQUE (task_id,version,owner_user_id),
  CONSTRAINT uq_task_config_versions_task_id_version_script__28df02999f58 UNIQUE (task_id,version,script_version_id,action,owner_user_id),
  CONSTRAINT uq_task_config_versions_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_task_config_versions_1 CHECK ((execution_context='PAID_SERVICE' AND num_nonnulls(service_order_id,entitlement_id,service_release_id)=3) OR (execution_context<>'PAID_SERVICE' AND num_nonnulls(service_order_id,entitlement_id,service_release_id)=0))
);

COMMENT ON TABLE task_config_versions IS '不可变可执行配置';

CREATE TABLE task_display_preferences (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  pinned BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_task_display_preferences_owner_user_id_task_id UNIQUE (owner_user_id,task_id),
  CONSTRAINT uq_task_display_preferences_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE task_display_preferences IS '任务标签与置顶';

CREATE TABLE runs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID NOT NULL,
  config_version BIGINT NOT NULL,
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  original_input_ref UUID NOT NULL,
  schema_digest TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','scheduled','service','test','replacement')),
  trigger_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  entitlement_id UUID,
  supersedes_run_id UUID,
  run_mode TEXT NOT NULL CHECK (run_mode IN ('finite','continuous')),
  current_continuation BIGINT NOT NULL DEFAULT 0 CHECK (current_continuation>=0),
  not_before TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  completion_kind TEXT CHECK (completion_kind IN ('SCRIPT_RESULT','TRUSTED_VERIFICATION','MANUAL_RESOLUTION','PROCESS_EXIT')),
  verification_status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (verification_status IN ('NOT_APPLICABLE','REPORTED','VERIFIED','DISPUTED')),
  effect_status TEXT NOT NULL DEFAULT 'NONE_OBSERVED' CHECK (effect_status IN ('NONE_OBSERVED','POSSIBLE','UNKNOWN','RESOLVED')),
  last_progress_at TIMESTAMPTZ,
  stop_requested_at TIMESTAMPTZ,
  stop_deadline TIMESTAMPTZ,
  restart_count INT NOT NULL DEFAULT 0 CHECK (restart_count>=0),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PREPARING', 'READY', 'RUNNING', 'STOPPING', 'WAITING_INPUT', 'RECONCILING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'EXPIRED', 'CLOSED_UNRESOLVED')),
  CONSTRAINT uq_runs_task_id_trigger_key UNIQUE (task_id,trigger_key),
  CONSTRAINT uq_runs_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_runs_1 CHECK (status NOT IN ('FAILED','TIMED_OUT','CANCELLED','EXPIRED') OR effect_status NOT IN ('POSSIBLE','UNKNOWN')),
  CONSTRAINT ck_runs_2 CHECK (status<>'CLOSED_UNRESOLVED' OR effect_status='UNKNOWN')
);

COMMENT ON TABLE runs IS '一次逻辑执行';

CREATE TABLE concurrency_locks (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  key TEXT NOT NULL,
  run_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  CONSTRAINT uq_concurrency_locks_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE concurrency_locks IS '本人逻辑并发锁';

CREATE TABLE task_holds (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('WAITING_INPUT','SIDE_EFFECT_UNKNOWN','CREDENTIAL_INVALID','VERSION_REVOKED','ACCOUNT_RESTRICTED','POLICY_DENIED','SCENE_UNAVAILABLE','MIGRATION_REQUIRED')),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_reason TEXT,
  CONSTRAINT uq_task_holds_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE task_holds IS '任务独立阻塞';

CREATE TABLE continuations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  number BIGINT NOT NULL CHECK (number>=0),
  pending_action_id UUID,
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  input_ref UUID NOT NULL,
  schema_digest TEXT NOT NULL,
  authorization_id UUID NOT NULL,
  credential_snapshot JSONB NOT NULL,
  checkpoint_id UUID,
  CONSTRAINT uq_continuations_run_id_number UNIQUE (run_id,number),
  CONSTRAINT uq_continuations_pending_action_id UNIQUE (pending_action_id),
  CONSTRAINT uq_continuations_run_id_number_owner_user_id UNIQUE (run_id,number,owner_user_id),
  CONSTRAINT uq_continuations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE continuations IS '不可变接续输入';

CREATE TABLE attempts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  continuation_number BIGINT NOT NULL CHECK (continuation_number>=0),
  node_id UUID NOT NULL,
  lease_generation BIGINT NOT NULL CHECK (lease_generation>0),
  requested_execution_mode TEXT NOT NULL CHECK (requested_execution_mode IN ('docker','qemu_kvm','qemu_tcg')),
  actual_execution_mode TEXT CHECK (actual_execution_mode IN ('docker','qemu_kvm','qemu_tcg')),
  mode_reason TEXT,
  runtime_policy_id UUID NOT NULL,
  retry_of UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  exit_code INT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PREPARING', 'RUNNING', 'STOPPING', 'EXITED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'LOST')),
  CONSTRAINT uq_attempts_run_id_attempt_no UNIQUE (run_id,attempt_no),
  CONSTRAINT uq_attempts_id_run_id_owner_user_id UNIQUE (id,run_id,owner_user_id),
  CONSTRAINT uq_attempts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE attempts IS '实际执行尝试';

CREATE TABLE execution_leases (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  generation BIGINT NOT NULL CHECK (generation>0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_execution_leases_run_id UNIQUE (run_id),
  CONSTRAINT uq_execution_leases_attempt_id UNIQUE (attempt_id),
  CONSTRAINT uq_execution_leases_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE execution_leases IS '当前Run执行租约';

CREATE TABLE hook_invocations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempt_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('BUSINESS','VERIFICATION')),
  input_ref UUID NOT NULL,
  schema_digest TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  effect_status TEXT NOT NULL DEFAULT 'NONE_OBSERVED' CHECK (effect_status IN ('NONE_OBSERVED','POSSIBLE','UNKNOWN','RESOLVED')),
  result_id UUID,
  output_stream_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (output_stream_status IN ('OPEN','SEALED')),
  status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'RUNNING', 'RESULT_ACCEPTED', 'FAILED', 'LOST')),
  CONSTRAINT uq_hook_invocations_result_id UNIQUE (result_id),
  CONSTRAINT uq_hook_invocations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE hook_invocations IS '动作调用与最终回执';

CREATE TABLE invocation_permissions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  lease_generation BIGINT NOT NULL CHECK (lease_generation>0),
  phase TEXT NOT NULL CHECK (phase IN ('BUSINESS','OUTPUT','RECEIPT','DIAGNOSTIC','VERIFY')),
  token_hash TEXT NOT NULL,
  grants JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_invocation_permissions_token_hash UNIQUE (token_hash),
  CONSTRAINT uq_invocation_permissions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE invocation_permissions IS '分阶段短期许可';

CREATE TABLE execution_results (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('COMPLETED','ACTION_REQUIRED','ERROR')),
  data_ref UUID NOT NULL,
  envelope_ref UUID NOT NULL,
  payload_digest TEXT NOT NULL,
  schema_digest TEXT,
  verification_status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (verification_status IN ('NOT_APPLICABLE','REPORTED','VERIFIED','DISPUTED')),
  accepted_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_execution_results_invocation_id UNIQUE (invocation_id),
  CONSTRAINT uq_execution_results_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE execution_results IS '不可变结果信封';

CREATE TABLE pending_actions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  invocation_id UUID NOT NULL,
  reason TEXT NOT NULL,
  instructions_ref UUID NOT NULL,
  resume_action TEXT,
  schema_digest TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CONSUMED', 'EXPIRED', 'CLOSED')),
  CONSTRAINT uq_pending_actions_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_pending_actions_1 CHECK (num_nonnulls(resume_action,schema_digest) IN (0,2))
);

COMMENT ON TABLE pending_actions IS '有期限人工待处理';

CREATE TABLE external_requests (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  request_id TEXT NOT NULL,
  target_digest TEXT NOT NULL,
  network_mode TEXT NOT NULL CHECK (network_mode IN ('HTTP','BROKER','PROXY')),
  lease_generation BIGINT NOT NULL CHECK (lease_generation>0),
  effect_status TEXT NOT NULL DEFAULT 'NONE_OBSERVED' CHECK (effect_status IN ('NONE_OBSERVED','POSSIBLE','UNKNOWN','RESOLVED')),
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  response_status INT,
  phase TEXT NOT NULL DEFAULT 'PREPARED' CHECK (phase IN ('PREPARED', 'DISPATCHING', 'RESPONSE_RECEIVED', 'FAILED_BEFORE_SEND', 'UNKNOWN')),
  CONSTRAINT uq_external_requests_invocation_id_request_id UNIQUE (invocation_id,request_id),
  CONSTRAINT uq_external_requests_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE external_requests IS '发送前外部请求账';

CREATE TABLE hook_observations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  event_key TEXT NOT NULL,
  hook_name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('STARTED','COMPLETED','FAILED')),
  trust_level TEXT NOT NULL DEFAULT 'SCRIPT' CHECK (trust_level='SCRIPT'),
  summary TEXT NOT NULL,
  CONSTRAINT uq_hook_observations_invocation_id_event_key UNIQUE (invocation_id,event_key),
  CONSTRAINT uq_hook_observations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE hook_observations IS '非权威生命周期观测';

CREATE TABLE run_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  attempt_id UUID,
  event_type TEXT NOT NULL,
  source_event_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  summary JSONB NOT NULL,
  CONSTRAINT uq_run_events_source_event_id UNIQUE (source_event_id),
  CONSTRAINT uq_run_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE run_events IS '可信运行阶段事件';

CREATE TABLE verification_bindings (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID NOT NULL,
  config_version BIGINT NOT NULL,
  connector_version_id UUID,
  script_action_id UUID,
  authorization_id UUID NOT NULL,
  input_mapping JSONB NOT NULL,
  budget JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_verification_bindings_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_verification_bindings_1 CHECK (num_nonnulls(connector_version_id,script_action_id)=1)
);

COMMENT ON TABLE verification_bindings IS '独立可信核验授权';

CREATE TABLE verification_jobs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  binding_id UUID NOT NULL,
  booking_operation_id UUID,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  evidence_ref UUID,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'RESOLVED', 'EXPIRED', 'FAILED')),
  CONSTRAINT uq_verification_jobs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE verification_jobs IS '效果核验任务';

CREATE TABLE resolution_records (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  invocation_id UUID,
  disposition TEXT NOT NULL CHECK (disposition IN ('completed','not_executed','close_unresolved')),
  source TEXT NOT NULL CHECK (source IN ('USER_REPORTED','TRUSTED_VERIFIER')),
  reason TEXT NOT NULL,
  evidence_ref UUID,
  confirmed BOOLEAN NOT NULL,
  CONSTRAINT uq_resolution_records_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_resolution_records_1 CHECK (disposition='close_unresolved' OR confirmed)
);

COMMENT ON TABLE resolution_records IS '明确结案记录';

CREATE TABLE late_evidence (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  invocation_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('LATE_SCRIPT','TRUSTED_VERIFIER','PROVIDER')),
  payload_digest TEXT NOT NULL,
  evidence_ref UUID NOT NULL,
  CONSTRAINT uq_late_evidence_invocation_id_payload_digest UNIQUE (invocation_id,payload_digest),
  CONSTRAINT uq_late_evidence_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE late_evidence IS '晚到调用证据';

CREATE TABLE environment_leases (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempt_id UUID NOT NULL,
  node_id UUID NOT NULL,
  environment_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  stopped_at TIMESTAMPTZ,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  cleanup_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (cleanup_status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  CONSTRAINT uq_environment_leases_attempt_id UNIQUE (attempt_id),
  CONSTRAINT uq_environment_leases_node_id_environment_id UNIQUE (node_id,environment_id),
  CONSTRAINT uq_environment_leases_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE environment_leases IS '执行环境回收账';

CREATE TABLE output_series (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID NOT NULL,
  task_id UUID NOT NULL,
  config_version BIGINT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('RUN','TASK_CONFIG')),
  checkpoint_revision BIGINT NOT NULL DEFAULT 0 CHECK (checkpoint_revision>=0),
  current_checkpoint_id UUID,
  dedup_expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  CONSTRAINT uq_output_series_run_id UNIQUE (run_id),
  CONSTRAINT uq_output_series_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE output_series IS 'Run产物系列与检查点头';

CREATE TABLE output_generations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  output_series_id UUID NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence>=0),
  producer_kind TEXT NOT NULL CHECK (producer_kind IN ('ACTION','HOOK','LEGACY')),
  reason TEXT NOT NULL CHECK (reason IN ('explicit','interval','checkpoint','final')),
  snapshot_ref UUID,
  deadline TIMESTAMPTZ NOT NULL,
  error_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'SKIPPED')),
  CONSTRAINT uq_output_generations_output_series_id_sequence UNIQUE (output_series_id,sequence),
  CONSTRAINT uq_output_generations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE output_generations IS '独立产物emission';

CREATE TABLE output_batches (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  output_series_id UUID NOT NULL,
  batch_key TEXT NOT NULL,
  invocation_id UUID NOT NULL,
  emission_id UUID NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('ACTION','OUTPUT_HOOK')),
  payload_digest TEXT,
  producer_outcome TEXT CHECK (producer_outcome IN ('COMPLETED','FAILED','TIMED_OUT','CANCELLED')),
  producer_error_ref UUID,
  committed_at TIMESTAMPTZ,
  checkpoint_revision BIGINT,
  aggregate_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (aggregate_status IN ('NONE','PENDING','READY','PARTIAL','FAILED')),
  commit_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (commit_status IN ('OPEN', 'COMMITTED', 'ABORTED', 'EXPIRED')),
  CONSTRAINT uq_output_batches_output_series_id_batch_key UNIQUE (output_series_id,batch_key),
  CONSTRAINT uq_output_batches_emission_id UNIQUE (emission_id),
  CONSTRAINT uq_output_batches_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_output_batches_1 CHECK (commit_status<>'COMMITTED' OR (payload_digest IS NOT NULL AND committed_at IS NOT NULL AND producer_outcome IS NOT NULL)),
  CONSTRAINT ck_output_batches_2 CHECK (producer_outcome IS NULL OR (producer_outcome='COMPLETED' AND producer_error_ref IS NULL) OR (producer_outcome<>'COMPLETED' AND producer_error_ref IS NOT NULL))
);

COMMENT ON TABLE output_batches IS '不可变产物批次回执';

CREATE TABLE output_uploads (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  output_series_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  invocation_id UUID NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('ACTION','OUTPUT')),
  upload_key TEXT NOT NULL,
  expected_size BIGINT NOT NULL CHECK (expected_size>=0),
  expected_sha256 TEXT NOT NULL,
  object_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UPLOADING', 'UPLOADED', 'ABORTED', 'EXPIRED')),
  CONSTRAINT uq_output_uploads_batch_id_upload_key UNIQUE (batch_id,upload_key),
  CONSTRAINT uq_output_uploads_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE output_uploads IS '产物上传会话';

CREATE TABLE output_upload_parts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  upload_id UUID NOT NULL,
  part_no INT NOT NULL CHECK (part_no>0),
  size_bytes BIGINT NOT NULL CHECK (size_bytes>=0),
  sha256 TEXT NOT NULL,
  provider_part_ref TEXT NOT NULL,
  CONSTRAINT uq_output_upload_parts_upload_id_part_no UNIQUE (upload_id,part_no),
  CONSTRAINT uq_output_upload_parts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE output_upload_parts IS '产物分片摘要';

CREATE TABLE script_outputs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  batch_id UUID NOT NULL,
  output_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','json','file','message')),
  title TEXT,
  payload_id UUID,
  upload_id UUID,
  object_id UUID,
  content_digest TEXT NOT NULL,
  file_name TEXT,
  media_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes>=0),
  expires_at TIMESTAMPTZ NOT NULL,
  failure_code TEXT,
  deleted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'VALIDATING', 'WAITING_DEPENDENCY', 'READY', 'FAILED', 'EXPIRED', 'DELETED')),
  CONSTRAINT uq_script_outputs_batch_id_output_key UNIQUE (batch_id,output_key),
  CONSTRAINT uq_script_outputs_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_script_outputs_1 CHECK ((kind='file' AND upload_id IS NOT NULL AND payload_id IS NULL) OR (kind<>'file' AND payload_id IS NOT NULL AND upload_id IS NULL)),
  CONSTRAINT ck_script_outputs_2 CHECK (status<>'READY' OR kind<>'file' OR object_id IS NOT NULL)
);

COMMENT ON TABLE script_outputs IS '用户运行产物';

CREATE TABLE output_dependencies (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  message_output_id UUID NOT NULL,
  attachment_output_id UUID NOT NULL,
  CONSTRAINT uq_output_dependencies_message_output_id_attach_6d528e5c7a0b UNIQUE (message_output_id,attachment_output_id),
  CONSTRAINT uq_output_dependencies_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_output_dependencies_1 CHECK (message_output_id<>attachment_output_id)
);

COMMENT ON TABLE output_dependencies IS '消息附件依赖';

CREATE TABLE result_output_refs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  result_id UUID NOT NULL,
  output_id UUID NOT NULL,
  ordinal INT NOT NULL CHECK (ordinal>=0),
  CONSTRAINT uq_result_output_refs_result_id_output_id UNIQUE (result_id,output_id),
  CONSTRAINT uq_result_output_refs_result_id_ordinal UNIQUE (result_id,ordinal),
  CONSTRAINT uq_result_output_refs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE result_output_refs IS '结果接受时产物引用快照';

CREATE TABLE checkpoints (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  output_series_id UUID NOT NULL,
  task_id UUID NOT NULL,
  config_version BIGINT NOT NULL,
  checkpoint_revision BIGINT NOT NULL CHECK (checkpoint_revision>0),
  script_version_id UUID NOT NULL,
  action TEXT NOT NULL,
  schema_digest TEXT NOT NULL,
  payload_id UUID NOT NULL,
  batch_id UUID,
  CONSTRAINT uq_checkpoints_output_series_id_checkpoint_revision UNIQUE (output_series_id,checkpoint_revision),
  CONSTRAINT uq_checkpoints_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE checkpoints IS '不可变检查点历史';

CREATE TABLE script_events (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  invocation_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  event_key TEXT NOT NULL,
  data_ref UUID NOT NULL,
  payload_digest TEXT NOT NULL,
  schema_digest TEXT NOT NULL,
  CONSTRAINT uq_script_events_invocation_id_event_name_event_key UNIQUE (invocation_id,event_name,event_key),
  CONSTRAINT uq_script_events_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE script_events IS '发布者自定义事件';

CREATE TABLE notification_bindings (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WEBHOOK','PUSH')),
  display_name TEXT NOT NULL DEFAULT '',
  target_payload_id UUID NOT NULL,
  masked_target TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_notification_bindings_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE notification_bindings IS '本人消息接收渠道';

CREATE TABLE notification_subscriptions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  binding_id UUID NOT NULL,
  event_scope TEXT NOT NULL,
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_notification_subscriptions_owner_user_id_bin_dd62fb369fcb UNIQUE (owner_user_id,binding_id,event_scope),
  CONSTRAINT uq_notification_subscriptions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE notification_subscriptions IS '本人事件订阅';

CREATE TABLE notification_cooldowns (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  subscription_id UUID NOT NULL,
  business_key TEXT NOT NULL,
  last_notified_at TIMESTAMPTZ NOT NULL,
  next_allowed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_notification_cooldowns_subscription_id_business_key UNIQUE (subscription_id,business_key),
  CONSTRAINT uq_notification_cooldowns_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE notification_cooldowns IS '跨调用通知冷却';

CREATE TABLE notifications (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  event_id UUID,
  message_output_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WEBHOOK','PUSH')),
  content_ref UUID NOT NULL,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_notifications_event_id_owner_user_id_channel UNIQUE (event_id,owner_user_id,channel),
  CONSTRAINT uq_notifications_message_output_id_owner_user_id_channel UNIQUE (message_output_id,owner_user_id,channel),
  CONSTRAINT uq_notifications_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_notifications_1 CHECK (num_nonnulls(event_id,message_output_id)=1)
);

COMMENT ON TABLE notifications IS '用户通知事实';

CREATE TABLE notification_deliveries (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  notification_id UUID NOT NULL,
  message_output_id UUID,
  channel_binding_id UUID NOT NULL,
  delivery_key TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at TIMESTAMPTZ,
  dependency_deadline TIMESTAMPTZ,
  provider_ref TEXT,
  rendering_mode TEXT,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'UNKNOWN', 'FAILED', 'SUPPRESSED')),
  CONSTRAINT uq_notification_deliveries_notification_id_chan_f5bbde809fd2 UNIQUE (notification_id,channel_binding_id),
  CONSTRAINT uq_notification_deliveries_message_output_id_ch_0c9e1f05c31f UNIQUE (message_output_id,channel_binding_id),
  CONSTRAINT uq_notification_deliveries_delivery_key UNIQUE (delivery_key),
  CONSTRAINT uq_notification_deliveries_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE notification_deliveries IS '逻辑通知投递';

CREATE TABLE delivery_attempts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  delivery_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no>0),
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  provider_ref TEXT,
  duplicate_risk BOOLEAN NOT NULL DEFAULT false,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'SENT', 'UNKNOWN', 'FAILED')),
  CONSTRAINT uq_delivery_attempts_delivery_id_attempt_no UNIQUE (delivery_id,attempt_no),
  CONSTRAINT uq_delivery_attempts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE delivery_attempts IS '外部消息发送尝试';

CREATE TABLE cities (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_cities_code UNIQUE (code)
);

COMMENT ON TABLE cities IS '城市目录';

CREATE TABLE attractions (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  city_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  ticket_price_kind TEXT NOT NULL DEFAULT 'FREE' CHECK (ticket_price_kind='FREE'),
  CONSTRAINT uq_attractions_city_id_name UNIQUE (city_id,name)
);

COMMENT ON TABLE attractions IS '景点目录';

CREATE TABLE channels (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attraction_id UUID NOT NULL,
  name TEXT NOT NULL,
  official_url TEXT NOT NULL,
  timezone TEXT NOT NULL,
  current_rule_version_id UUID,
  adapter_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (adapter_status IN ('UNVERIFIED', 'MONITOR_ONLY', 'BOOKING_SUPPORTED', 'DEGRADED', 'DISABLED')),
  CONSTRAINT uq_channels_attraction_id_name UNIQUE (attraction_id,name)
);

COMMENT ON TABLE channels IS '景点预约渠道';

CREATE TABLE channel_rule_versions (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  channel_id UUID NOT NULL,
  version INT NOT NULL CHECK (version>0),
  rules JSONB NOT NULL,
  source_url TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  evidence JSONB NOT NULL,
  CONSTRAINT uq_channel_rule_versions_channel_id_version UNIQUE (channel_id,version)
);

COMMENT ON TABLE channel_rule_versions IS '景点渠道规则快照';

CREATE TABLE connector_versions (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  code_digest TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_connector_versions_key_version UNIQUE (key,version)
);

COMMENT ON TABLE connector_versions IS '可信领域连接器';

CREATE TABLE attraction_service_links (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attraction_id UUID NOT NULL,
  service_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  CONSTRAINT uq_attraction_service_links_attraction_id_servi_4348667fa044 UNIQUE (attraction_id,service_id,channel_id),
  CONSTRAINT uq_attraction_service_links_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE attraction_service_links IS '景点与商品关联';

CREATE TABLE channel_accounts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  channel_id UUID NOT NULL,
  account_key_hmac TEXT NOT NULL,
  credential_version_id UUID NOT NULL,
  masked_account TEXT NOT NULL,
  CONSTRAINT uq_channel_accounts_owner_user_id_channel_id_ac_ec29d5d4da34 UNIQUE (owner_user_id,channel_id,account_key_hmac),
  CONSTRAINT uq_channel_accounts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE channel_accounts IS '本人渠道账号标识';

CREATE TABLE travelers (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  masked_name TEXT NOT NULL,
  current_version_id UUID,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_travelers_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE travelers IS '出行人资产';

CREATE TABLE traveler_versions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  traveler_id UUID NOT NULL,
  version INT NOT NULL CHECK (version>0),
  payload_id UUID NOT NULL,
  identity_hmac TEXT NOT NULL,
  CONSTRAINT uq_traveler_versions_traveler_id_version UNIQUE (traveler_id,version),
  CONSTRAINT uq_traveler_versions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE traveler_versions IS '不可变出行人资料';

CREATE TABLE booking_authorizations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  task_id UUID,
  channel_account_id UUID NOT NULL,
  channel_rule_version_id UUID NOT NULL,
  attraction_id UUID NOT NULL,
  visit_date DATE NOT NULL,
  ticket_type TEXT NOT NULL,
  allowed_slots JSONB NOT NULL,
  allow_alternatives BOOLEAN NOT NULL DEFAULT false,
  allow_partial BOOLEAN NOT NULL DEFAULT false,
  max_ticket_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (max_ticket_amount_minor=0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_booking_authorizations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE booking_authorizations IS '本人预约范围授权';

CREATE TABLE booking_authorization_travelers (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  booking_authorization_id UUID NOT NULL,
  traveler_version_id UUID NOT NULL,
  CONSTRAINT uq_booking_authorization_travelers_booking_auth_fb889d811475 UNIQUE (booking_authorization_id,traveler_version_id),
  CONSTRAINT uq_booking_authorization_travelers_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE booking_authorization_travelers IS '授权人员固定快照';

CREATE TABLE booking_targets (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  channel_account_id UUID NOT NULL,
  target_key TEXT NOT NULL,
  target_snapshot_ref UUID NOT NULL,
  active_operation_id UUID,
  CONSTRAINT uq_booking_targets_owner_user_id_target_key UNIQUE (owner_user_id,target_key),
  CONSTRAINT uq_booking_targets_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE booking_targets IS '跨任务预约目标锁';

CREATE TABLE booking_operations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  target_id UUID NOT NULL,
  authorization_id UUID NOT NULL,
  invocation_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  next_reconcile_at TIMESTAMPTZ,
  evidence_ref UUID,
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'SUBMITTING', 'CONFIRMED', 'FAILED', 'UNKNOWN', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT uq_booking_operations_request_key UNIQUE (request_key),
  CONSTRAINT uq_booking_operations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE booking_operations IS '受控预约提交';

CREATE TABLE booking_orders (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  operation_id UUID NOT NULL,
  service_order_id UUID,
  channel_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  external_order_hmac TEXT NOT NULL,
  order_payload_id UUID NOT NULL,
  ticket_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (ticket_amount_minor=0),
  payment_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (payment_status='NOT_REQUIRED'),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('REPORTED','VERIFIED','DISPUTED')),
  verified_at TIMESTAMPTZ,
  CONSTRAINT uq_booking_orders_channel_account_id_external_order_hmac UNIQUE (channel_account_id,external_order_hmac),
  CONSTRAINT uq_booking_orders_operation_id UNIQUE (operation_id),
  CONSTRAINT uq_booking_orders_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE booking_orders IS '外部免费预约记录';

CREATE TABLE inventory_observations (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  channel_id UUID NOT NULL,
  invocation_id UUID NOT NULL,
  visit_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  quantity BIGINT CHECK (quantity>=0),
  observed_at TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('REPORTED','VERIFIED','DISPUTED')),
  status TEXT NOT NULL DEFAULT 'NOT_RELEASED' CHECK (status IN ('NOT_RELEASED', 'AVAILABLE', 'SOLD_OUT', 'CLOSED', 'UNKNOWN')),
  CONSTRAINT uq_inventory_observations_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE inventory_observations IS '本人场景库存观察';

CREATE TABLE outbox_events (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  owner_user_id UUID,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_revision BIGINT NOT NULL CHECK (aggregate_revision>0),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  request_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  last_error TEXT,
  CONSTRAINT uq_outbox_events_aggregate_type_aggregate_id_ag_abe397766cb0 UNIQUE (aggregate_type,aggregate_id,aggregate_revision,event_type)
);

COMMENT ON TABLE outbox_events IS '事务事件与可靠唤醒';

CREATE TABLE consumer_receipts (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  consumer TEXT NOT NULL,
  event_id UUID NOT NULL,
  applied_revision BIGINT NOT NULL CHECK (applied_revision>0),
  applied_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_consumer_receipts_consumer_event_id UNIQUE (consumer,event_id)
);

COMMENT ON TABLE consumer_receipts IS '消费者幂等及投影进度';

CREATE TABLE audit_events (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  actor_user_id UUID,
  actor_service TEXT,
  subject_owner_user_id UUID,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  before_revision BIGINT,
  after_revision BIGINT,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS','DENIED','FAILED')),
  summary JSONB NOT NULL,
  CONSTRAINT ck_audit_events_1 CHECK (num_nonnulls(actor_user_id,actor_service)=1)
);

COMMENT ON TABLE audit_events IS '不可变审计';

CREATE TABLE idempotency_records (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  response_payload_id UUID,
  response_status INT,
  resource_type TEXT,
  resource_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_idempotency_records_owner_user_id_method_route_key UNIQUE (owner_user_id,method,route,key),
  CONSTRAINT uq_idempotency_records_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE idempotency_records IS '用户HTTP命令回执';

CREATE TABLE operation_jobs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  kind TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  input_ref UUID,
  result_ref UUID,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  deadline TIMESTAMPTZ,
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation>=0),
  lease_expires_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT uq_operation_jobs_owner_user_id_kind_request_key UNIQUE (owner_user_id,kind,request_key),
  CONSTRAINT uq_operation_jobs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE operation_jobs IS '异步管理/业务作业回执';

CREATE TABLE platform_features (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  phase TEXT NOT NULL CHECK (phase IN ('P0','P1','P2','SCENE')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID NOT NULL,
  CONSTRAINT uq_platform_features_key UNIQUE (key)
);

COMMENT ON TABLE platform_features IS '当前能力开关';

CREATE TABLE deletion_requests (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ACCOUNT','RUN','LOG','OUTPUT','CREDENTIAL','TRAVELER','EXPORT')),
  scope_id UUID,
  reason TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  latest_backup_expiry TIMESTAMPTZ,
  retained_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT uq_deletion_requests_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_deletion_requests_1 CHECK ((scope_type='ACCOUNT' AND scope_id IS NULL) OR (scope_type<>'ACCOUNT' AND scope_id IS NOT NULL))
);

COMMENT ON TABLE deletion_requests IS '持久删除范围墓碑';

CREATE TABLE deletion_steps (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  request_id UUID NOT NULL,
  store TEXT NOT NULL CHECK (store IN ('DATABASE','OBJECT','LOKI','TRACE','CACHE','EXPORT','NODE_WAL','WORKSPACE','CHECKPOINT','BACKUP')),
  object_scope TEXT NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  failure_code TEXT,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  CONSTRAINT uq_deletion_steps_request_id_store_object_scope UNIQUE (request_id,store,object_scope),
  CONSTRAINT uq_deletion_steps_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE deletion_steps IS '跨存储清理回执';

CREATE TABLE retention_holds (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  authorized_by UUID NOT NULL,
  released_at TIMESTAMPTZ,
  CONSTRAINT uq_retention_holds_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE retention_holds IS '有界证据保留';

CREATE TABLE backup_manifests (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  backup_key TEXT NOT NULL,
  database_lsn TEXT NOT NULL,
  object_manifest_key TEXT NOT NULL,
  revocation_watermark TEXT NOT NULL,
  key_policy_version TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  checksum TEXT NOT NULL,
  CONSTRAINT uq_backup_manifests_backup_key UNIQUE (backup_key)
);

COMMENT ON TABLE backup_manifests IS '备份与恢复点清单';

CREATE TABLE recovery_drills (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  backup_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED')),
  CONSTRAINT uq_recovery_drills_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE recovery_drills IS '恢复演练登记';

CREATE TABLE node_bootstrap_tokens (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  node_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  issued_by UUID NOT NULL,
  CONSTRAINT uq_node_bootstrap_tokens_token_hash UNIQUE (token_hash)
);

COMMENT ON TABLE node_bootstrap_tokens IS '单次节点引导凭证';

CREATE TABLE node_certificates (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  node_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  not_before TIMESTAMPTZ NOT NULL,
  not_after TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_node_certificates_fingerprint UNIQUE (fingerprint),
  CONSTRAINT ck_node_certificates_1 CHECK (not_after>not_before)
);

COMMENT ON TABLE node_certificates IS '节点证书轮换历史';

CREATE TABLE agent_sessions (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempt_id UUID NOT NULL,
  challenge_hash TEXT NOT NULL,
  certificate_fingerprint TEXT NOT NULL,
  image_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_agent_sessions_attempt_id UNIQUE (attempt_id),
  CONSTRAINT uq_agent_sessions_challenge_hash UNIQUE (challenge_hash),
  CONSTRAINT uq_agent_sessions_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE agent_sessions IS 'Attempt专属Guest身份';

CREATE TABLE agent_message_receipts (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  agent_session_id UUID NOT NULL,
  message_id UUID NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence>=0),
  direction TEXT NOT NULL CHECK (direction IN ('COMMAND','REPLY')),
  lease_generation BIGINT NOT NULL CHECK (lease_generation>0),
  kind TEXT NOT NULL CHECK (kind IN ('prepare','start','stop','inspect','collect-result','heartbeat')),
  payload_digest TEXT NOT NULL,
  receipt JSONB NOT NULL,
  CONSTRAINT uq_agent_message_receipts_message_id UNIQUE (message_id),
  CONSTRAINT uq_agent_message_receipts_agent_session_id_dire_5d600c94bf4d UNIQUE (agent_session_id,direction,sequence),
  CONSTRAINT uq_agent_message_receipts_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE agent_message_receipts IS 'Agent控制消息防重';

CREATE TABLE log_segments (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID,
  build_id UUID,
  source_instance_id TEXT NOT NULL,
  sequence_start BIGINT NOT NULL CHECK (sequence_start>=0),
  sequence_end BIGINT NOT NULL,
  object_id UUID NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes>=0),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  archive_status TEXT NOT NULL CHECK (archive_status IN ('COMMITTED','MISSING','DELETED')),
  index_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (index_status IN ('PENDING','INDEXED','FAILED','EXPIRED','DELETED')),
  live_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (live_status IN ('PENDING','PUBLISHED','FAILED','EXPIRED','DELETED')),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_log_segments_source_instance_id_sequence_sta_d1fdb3c96e30 UNIQUE (source_instance_id,sequence_start,sequence_end),
  CONSTRAINT uq_log_segments_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_log_segments_1 CHECK (num_nonnulls(run_id,build_id)=1),
  CONSTRAINT ck_log_segments_2 CHECK (sequence_end>=sequence_start),
  CONSTRAINT ck_log_segments_3 CHECK (ended_at>=started_at)
);

COMMENT ON TABLE log_segments IS '脱敏日志分段清单';

CREATE TABLE platform_log_segments (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_instance_id TEXT NOT NULL,
  sequence_start BIGINT NOT NULL CHECK (sequence_start>=0),
  sequence_end BIGINT NOT NULL,
  object_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes>=0),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  archive_status TEXT NOT NULL CHECK (archive_status IN ('COMMITTED','MISSING','DELETED')),
  index_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (index_status IN ('PENDING','INDEXED','FAILED','EXPIRED','DELETED')),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_platform_log_segments_source_instance_id_seq_78a053bf14fa UNIQUE (source_instance_id,sequence_start,sequence_end),
  CONSTRAINT uq_platform_log_segments_object_key UNIQUE (object_key),
  CONSTRAINT ck_platform_log_segments_1 CHECK (sequence_end>=sequence_start),
  CONSTRAINT ck_platform_log_segments_2 CHECK (ended_at>=started_at)
);

COMMENT ON TABLE platform_log_segments IS '全局平台日志分段';

CREATE TABLE log_stream_gaps (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  run_id UUID,
  source_instance_id TEXT NOT NULL,
  sequence_start BIGINT NOT NULL CHECK (sequence_start>=0),
  sequence_end BIGINT NOT NULL,
  reason TEXT NOT NULL,
  CONSTRAINT uq_log_stream_gaps_id_owner_user_id UNIQUE (id,owner_user_id),
  CONSTRAINT ck_log_stream_gaps_1 CHECK (sequence_end>=sequence_start)
);

COMMENT ON TABLE log_stream_gaps IS '日志缺口与丢弃';

CREATE TABLE log_query_jobs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  query_snapshot JSONB NOT NULL,
  access_session_id UUID,
  scan_budget_bytes BIGINT NOT NULL CHECK (scan_budget_bytes>0),
  result_object_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT uq_log_query_jobs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE log_query_jobs IS '归档查询任务';

CREATE TABLE log_export_jobs (
  id UUID NOT NULL PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  query_snapshot JSONB NOT NULL,
  access_session_id UUID,
  format TEXT NOT NULL CHECK (format IN ('JSONL','TXT')),
  object_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  failure_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'DELETED')),
  CONSTRAINT uq_log_export_jobs_id_owner_user_id UNIQUE (id,owner_user_id)
);

COMMENT ON TABLE log_export_jobs IS '日志导出任务';

CREATE TABLE observability_policies (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  kind TEXT NOT NULL,
  version INT NOT NULL CHECK (version>0),
  policy JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  CONSTRAINT uq_observability_policies_kind_version UNIQUE (kind,version)
);

COMMENT ON TABLE observability_policies IS '版本化日志保留与配额';

CREATE TABLE alert_rules (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  rule_key TEXT NOT NULL,
  version INT NOT NULL CHECK (version>0),
  expression TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  for_seconds BIGINT NOT NULL CHECK (for_seconds>=0),
  receiver_policy JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_alert_rules_rule_key_version UNIQUE (rule_key,version)
);

COMMENT ON TABLE alert_rules IS '告警规则版本';

CREATE TABLE alert_instances (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  rule_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  occurrence BIGINT NOT NULL CHECK (occurrence>0),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  recovered_at TIMESTAMPTZ,
  acknowledged_by UUID,
  status TEXT NOT NULL DEFAULT 'FIRING' CHECK (status IN ('FIRING', 'ACKNOWLEDGED', 'RECOVERED')),
  CONSTRAINT uq_alert_instances_rule_id_fingerprint_occurrence UNIQUE (rule_id,fingerprint,occurrence)
);

COMMENT ON TABLE alert_instances IS '告警发生实例';

CREATE TABLE alert_events (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  instance_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  note TEXT NOT NULL,
  evidence JSONB NOT NULL
);

COMMENT ON TABLE alert_events IS '追加告警处置';

CREATE TABLE alert_silences (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  matchers JSONB NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  external_id TEXT,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING','SYNCED','FAILED','REMOVED')),
  CONSTRAINT ck_alert_silences_1 CHECK (ends_at>starts_at)
);

COMMENT ON TABLE alert_silences IS '有期限运维静默';

CREATE TABLE alert_deliveries (
  id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  instance_id UUID NOT NULL,
  receiver_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  delivery_key TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at TIMESTAMPTZ,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'UNKNOWN', 'FAILED', 'SUPPRESSED')),
  CONSTRAINT uq_alert_deliveries_delivery_key UNIQUE (delivery_key)
);

COMMENT ON TABLE alert_deliveries IS '运维告警投递';

ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE private_payloads ADD CONSTRAINT fk_private_payloads_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE auth_sessions ADD CONSTRAINT fk_auth_sessions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE auth_challenges ADD CONSTRAINT fk_auth_challenges_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE auth_challenges ADD CONSTRAINT fk_auth_challenges_target_payload_id_owner_user_572e9373dfbb FOREIGN KEY (target_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE recovery_intakes ADD CONSTRAINT fk_recovery_intakes_candidate_user_id_users FOREIGN KEY (candidate_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE account_recovery_cases ADD CONSTRAINT fk_account_recovery_cases_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE account_recovery_cases ADD CONSTRAINT fk_account_recovery_cases_intake_id_recovery_intakes FOREIGN KEY (intake_id) REFERENCES recovery_intakes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE account_recovery_cases ADD CONSTRAINT fk_account_recovery_cases_requester_payload_id__c94f86b1c7e3 FOREIGN KEY (requester_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE account_recovery_cases ADD CONSTRAINT fk_account_recovery_cases_resolution_payload_id_5644864f87bb FOREIGN KEY (resolution_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE account_recovery_cases ADD CONSTRAINT fk_account_recovery_cases_resolved_by_users FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE management_role_grants ADD CONSTRAINT fk_management_role_grants_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE management_role_grants ADD CONSTRAINT fk_management_role_grants_granted_by_users FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE data_access_sessions ADD CONSTRAINT fk_data_access_sessions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE data_access_sessions ADD CONSTRAINT fk_data_access_sessions_capability_grant_id_own_17d8cbbe83db FOREIGN KEY (capability_grant_id,owner_user_id) REFERENCES management_role_grants (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE personal_api_tokens ADD CONSTRAINT fk_personal_api_tokens_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE action_previews ADD CONSTRAINT fk_action_previews_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE storage_objects ADD CONSTRAINT fk_storage_objects_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_uploads ADD CONSTRAINT fk_script_uploads_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_uploads ADD CONSTRAINT fk_script_uploads_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE scripts ADD CONSTRAINT fk_scripts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_versions ADD CONSTRAINT fk_script_versions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_versions ADD CONSTRAINT fk_script_versions_script_id_owner_user_id_scripts FOREIGN KEY (script_id,owner_user_id) REFERENCES scripts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_versions ADD CONSTRAINT fk_script_versions_source_object_id_owner_user__c311196cd4c8 FOREIGN KEY (source_object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_versions ADD CONSTRAINT fk_script_versions_build_artifact_id_owner_user_id_artifacts FOREIGN KEY (build_artifact_id,owner_user_id) REFERENCES artifacts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_actions ADD CONSTRAINT fk_script_actions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_actions ADD CONSTRAINT fk_script_actions_script_version_id_owner_user__5fd4597e20a3 FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_imports ADD CONSTRAINT fk_script_imports_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_imports ADD CONSTRAINT fk_script_imports_source_payload_id_owner_user__6a94f7ecc84f FOREIGN KEY (source_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_imports ADD CONSTRAINT fk_script_imports_source_credential_version_id__5860bb596158 FOREIGN KEY (source_credential_version_id,owner_user_id) REFERENCES credential_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_imports ADD CONSTRAINT fk_script_imports_snapshot_object_id_owner_user_24737422c55c FOREIGN KEY (snapshot_object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_imports ADD CONSTRAINT fk_script_imports_materialized_version_id_owner_e244a693e73b FOREIGN KEY (materialized_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE import_attempts ADD CONSTRAINT fk_import_attempts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE import_attempts ADD CONSTRAINT fk_import_attempts_import_id_owner_user_id_script_imports FOREIGN KEY (import_id,owner_user_id) REFERENCES script_imports (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_adapter_specs ADD CONSTRAINT fk_version_adapter_specs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_adapter_specs ADD CONSTRAINT fk_version_adapter_specs_script_version_id_owne_722fef712629 FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_adapter_specs ADD CONSTRAINT fk_version_adapter_specs_payload_id_owner_user__6556513f458c FOREIGN KEY (payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE builds ADD CONSTRAINT fk_builds_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE builds ADD CONSTRAINT fk_builds_script_version_id_owner_user_id_script_versions FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE builds ADD CONSTRAINT fk_builds_base_image_id_runtime_images FOREIGN KEY (base_image_id) REFERENCES runtime_images (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE artifacts ADD CONSTRAINT fk_artifacts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE artifacts ADD CONSTRAINT fk_artifacts_build_id_owner_user_id_builds FOREIGN KEY (build_id,owner_user_id) REFERENCES builds (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE artifacts ADD CONSTRAINT fk_artifacts_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_test_evidence ADD CONSTRAINT fk_version_test_evidence_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_test_evidence ADD CONSTRAINT fk_version_test_evidence_script_version_id_owne_cdc26dc6fa59 FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE version_test_evidence ADD CONSTRAINT fk_version_test_evidence_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deployments ADD CONSTRAINT fk_deployments_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deployments ADD CONSTRAINT fk_deployments_script_version_id_owner_user_id__a7e1b2ea5e83 FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deployments ADD CONSTRAINT fk_deployments_artifact_id_owner_user_id_artifacts FOREIGN KEY (artifact_id,owner_user_id) REFERENCES artifacts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deployments ADD CONSTRAINT fk_deployments_resource_profile_id_resource_profiles FOREIGN KEY (resource_profile_id) REFERENCES resource_profiles (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE node_commands ADD CONSTRAINT fk_node_commands_node_id_nodes FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE node_commands ADD CONSTRAINT fk_node_commands_attempt_id_attempts FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runtime_policies ADD CONSTRAINT fk_runtime_policies_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE network_policies ADD CONSTRAINT fk_network_policies_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE credentials ADD CONSTRAINT fk_credentials_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE credentials ADD CONSTRAINT fk_credentials_current_version_id_owner_user_id_8b2e45dbb5d0 FOREIGN KEY (current_version_id,owner_user_id) REFERENCES credential_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE credential_versions ADD CONSTRAINT fk_credential_versions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE credential_versions ADD CONSTRAINT fk_credential_versions_credential_id_owner_user_0be167fe6e28 FOREIGN KEY (credential_id,owner_user_id) REFERENCES credentials (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE credential_versions ADD CONSTRAINT fk_credential_versions_payload_id_owner_user_id_287281631f59 FOREIGN KEY (payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_authorizations ADD CONSTRAINT fk_execution_authorizations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_authorizations ADD CONSTRAINT fk_execution_authorizations_script_version_id_s_7cc373e6dad7 FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE authorization_credentials ADD CONSTRAINT fk_authorization_credentials_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE authorization_credentials ADD CONSTRAINT fk_authorization_credentials_authorization_id_o_0be593e2feea FOREIGN KEY (authorization_id,owner_user_id) REFERENCES execution_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE authorization_credentials ADD CONSTRAINT fk_authorization_credentials_credential_version_7795a579fbc7 FOREIGN KEY (credential_version_id,owner_user_id) REFERENCES credential_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quota_reservations ADD CONSTRAINT fk_quota_reservations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quota_reservations ADD CONSTRAINT fk_quota_reservations_quota_account_id_quota_accounts FOREIGN KEY (quota_account_id) REFERENCES quota_accounts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quota_reservations ADD CONSTRAINT fk_quota_reservations_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quota_reservations ADD CONSTRAINT fk_quota_reservations_output_upload_id_owner_us_47188d7a50bc FOREIGN KEY (output_upload_id,owner_user_id) REFERENCES output_uploads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resource_usage_segments ADD CONSTRAINT fk_resource_usage_segments_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resource_usage_segments ADD CONSTRAINT fk_resource_usage_segments_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE publisher_profiles ADD CONSTRAINT fk_publisher_profiles_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_profiles ADD CONSTRAINT fk_payout_profiles_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_profiles ADD CONSTRAINT fk_payout_profiles_account_payload_id_owner_use_9bfd71cbfa2f FOREIGN KEY (account_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_categories ADD CONSTRAINT fk_service_categories_parent_id_service_categories FOREIGN KEY (parent_id) REFERENCES service_categories (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE services ADD CONSTRAINT fk_services_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE services ADD CONSTRAINT fk_services_category_id_service_categories FOREIGN KEY (category_id) REFERENCES service_categories (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE services ADD CONSTRAINT fk_services_current_release_id_owner_user_id_se_3326d9b4fcb8 FOREIGN KEY (current_release_id,owner_user_id) REFERENCES service_releases (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_releases ADD CONSTRAINT fk_service_releases_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_releases ADD CONSTRAINT fk_service_releases_service_id_owner_user_id_services FOREIGN KEY (service_id,owner_user_id) REFERENCES services (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_releases ADD CONSTRAINT fk_service_releases_script_version_id_owner_use_353f1c52f174 FOREIGN KEY (script_version_id,owner_user_id) REFERENCES script_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_releases ADD CONSTRAINT fk_service_releases_deployment_id_owner_user_id_deployments FOREIGN KEY (deployment_id,owner_user_id) REFERENCES deployments (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE commerce_policies ADD CONSTRAINT fk_commerce_policies_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE price_plans ADD CONSTRAINT fk_price_plans_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE price_plans ADD CONSTRAINT fk_price_plans_service_release_id_owner_user_id_b9324712cf8e FOREIGN KEY (service_release_id,owner_user_id) REFERENCES service_releases (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE price_plans ADD CONSTRAINT fk_price_plans_commerce_policy_id_commerce_policies FOREIGN KEY (commerce_policy_id) REFERENCES commerce_policies (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_publisher_id_users FOREIGN KEY (publisher_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_service_release_id_service_releases FOREIGN KEY (service_release_id) REFERENCES service_releases (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_price_plan_id_price_plans FOREIGN KEY (price_plan_id) REFERENCES price_plans (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_authorization_id_owner_user_id_execut_663a8d0931b8 FOREIGN KEY (authorization_id,owner_user_id) REFERENCES execution_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_input_payload_id_owner_user_id_private_payloads FOREIGN KEY (input_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_publisher_id_users FOREIGN KEY (publisher_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_quote_id_owner_user_id_quotes FOREIGN KEY (quote_id,owner_user_id) REFERENCES quotes (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_service_release_id_service_releases FOREIGN KEY (service_release_id) REFERENCES service_releases (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_price_plan_id_price_plans FOREIGN KEY (price_plan_id) REFERENCES price_plans (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_funding_payment_id_owner_user_id_payments FOREIGN KEY (funding_payment_id,owner_user_id) REFERENCES payments (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_funding_transaction_id_owner__550effefd4fc FOREIGN KEY (funding_transaction_id,owner_user_id) REFERENCES payment_transactions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_order_id_owner_user_id_service_orders FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_provider_action_payload_id_owner_us_35855d9aed9f FOREIGN KEY (provider_action_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE provider_receipts ADD CONSTRAINT fk_provider_receipts_matched_owner_id_users FOREIGN KEY (matched_owner_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_payment_transactions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_payment_transactions_payment_id_owner_user_id_payments FOREIGN KEY (payment_id,owner_user_id) REFERENCES payments (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_payment_transactions_order_id_owner_user_id__435069d9038f FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_payment_transactions_receipt_id_provider_receipts FOREIGN KEY (receipt_id) REFERENCES provider_receipts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_events ADD CONSTRAINT fk_payment_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_events ADD CONSTRAINT fk_payment_events_payment_id_owner_user_id_payments FOREIGN KEY (payment_id,owner_user_id) REFERENCES payments (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payment_events ADD CONSTRAINT fk_payment_events_receipt_id_provider_receipts FOREIGN KEY (receipt_id) REFERENCES provider_receipts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE entitlements ADD CONSTRAINT fk_entitlements_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE entitlements ADD CONSTRAINT fk_entitlements_order_id_owner_user_id_service_orders FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE entitlements ADD CONSTRAINT fk_entitlements_service_release_id_service_releases FOREIGN KEY (service_release_id) REFERENCES service_releases (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE usage_reservations ADD CONSTRAINT fk_usage_reservations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE usage_reservations ADD CONSTRAINT fk_usage_reservations_entitlement_id_owner_user_6186661533a0 FOREIGN KEY (entitlement_id,owner_user_id) REFERENCES entitlements (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE usage_reservations ADD CONSTRAINT fk_usage_reservations_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE fulfillment_events ADD CONSTRAINT fk_fulfillment_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE fulfillment_events ADD CONSTRAINT fk_fulfillment_events_order_id_owner_user_id_service_orders FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE fulfillment_events ADD CONSTRAINT fk_fulfillment_events_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE fulfillment_events ADD CONSTRAINT fk_fulfillment_events_source_event_id_outbox_events FOREIGN KEY (source_event_id) REFERENCES outbox_events (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE fulfillment_events ADD CONSTRAINT fk_fulfillment_events_evidence_payload_id_owner_e95992cdf55e FOREIGN KEY (evidence_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_disputes ADD CONSTRAINT fk_service_disputes_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_disputes ADD CONSTRAINT fk_service_disputes_order_id_owner_user_id_service_orders FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_disputes ADD CONSTRAINT fk_service_disputes_evidence_payload_id_owner_u_22586a842ec8 FOREIGN KEY (evidence_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_disputes ADD CONSTRAINT fk_service_disputes_resolved_by_users FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_order_id_owner_user_id_service_orders FOREIGN KEY (order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_payment_id_owner_user_id_payments FOREIGN KEY (payment_id,owner_user_id) REFERENCES payments (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_payment_transaction_id_owner_user_id_c6e3b032b945 FOREIGN KEY (payment_transaction_id,owner_user_id) REFERENCES payment_transactions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refund_attempts ADD CONSTRAINT fk_refund_attempts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refund_attempts ADD CONSTRAINT fk_refund_attempts_refund_id_owner_user_id_refunds FOREIGN KEY (refund_id,owner_user_id) REFERENCES refunds (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refund_events ADD CONSTRAINT fk_refund_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refund_events ADD CONSTRAINT fk_refund_events_refund_attempt_id_owner_user_i_0c12c09c4ea4 FOREIGN KEY (refund_attempt_id,owner_user_id) REFERENCES refund_attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE refund_events ADD CONSTRAINT fk_refund_events_receipt_id_provider_receipts FOREIGN KEY (receipt_id) REFERENCES provider_receipts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_accounts ADD CONSTRAINT fk_ledger_accounts_party_user_id_users FOREIGN KEY (party_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_transactions ADD CONSTRAINT fk_ledger_transactions_source_event_id_outbox_events FOREIGN KEY (source_event_id) REFERENCES outbox_events (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_transactions ADD CONSTRAINT fk_ledger_transactions_order_id_service_orders FOREIGN KEY (order_id) REFERENCES service_orders (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_transactions ADD CONSTRAINT fk_ledger_transactions_reversal_of_ledger_transactions FOREIGN KEY (reversal_of) REFERENCES ledger_transactions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_transaction_id_ledger_transactions FOREIGN KEY (transaction_id) REFERENCES ledger_transactions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_account_id_ledger_accounts FOREIGN KEY (account_id) REFERENCES ledger_accounts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_order_id_service_orders FOREIGN KEY (order_id) REFERENCES service_orders (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_publisher_id_users FOREIGN KEY (publisher_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE publisher_balances ADD CONSTRAINT fk_publisher_balances_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE publisher_balances ADD CONSTRAINT fk_publisher_balances_last_ledger_transaction_i_42657d4b8f26 FOREIGN KEY (last_ledger_transaction_id) REFERENCES ledger_transactions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE settlement_batches ADD CONSTRAINT fk_settlement_batches_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE settlement_lines ADD CONSTRAINT fk_settlement_lines_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE settlement_lines ADD CONSTRAINT fk_settlement_lines_batch_id_owner_user_id_sett_062a76e3fb7f FOREIGN KEY (batch_id,owner_user_id) REFERENCES settlement_batches (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE settlement_lines ADD CONSTRAINT fk_settlement_lines_ledger_entry_id_ledger_entries FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payouts ADD CONSTRAINT fk_payouts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payouts ADD CONSTRAINT fk_payouts_batch_id_owner_user_id_settlement_batches FOREIGN KEY (batch_id,owner_user_id) REFERENCES settlement_batches (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payouts ADD CONSTRAINT fk_payouts_payout_profile_id_owner_user_id_payout_profiles FOREIGN KEY (payout_profile_id,owner_user_id) REFERENCES payout_profiles (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_attempts ADD CONSTRAINT fk_payout_attempts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_attempts ADD CONSTRAINT fk_payout_attempts_payout_id_owner_user_id_payouts FOREIGN KEY (payout_id,owner_user_id) REFERENCES payouts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_events ADD CONSTRAINT fk_payout_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_events ADD CONSTRAINT fk_payout_events_payout_attempt_id_owner_user_i_cd9321a52086 FOREIGN KEY (payout_attempt_id,owner_user_id) REFERENCES payout_attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE payout_events ADD CONSTRAINT fk_payout_events_receipt_id_provider_receipts FOREIGN KEY (receipt_id) REFERENCES provider_receipts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE financial_reconciliations ADD CONSTRAINT fk_financial_reconciliations_payment_id_payments FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE financial_reconciliations ADD CONSTRAINT fk_financial_reconciliations_refund_attempt_id__246f257a187f FOREIGN KEY (refund_attempt_id) REFERENCES refund_attempts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE financial_reconciliations ADD CONSTRAINT fk_financial_reconciliations_payout_attempt_id__00933fdc47d3 FOREIGN KEY (payout_attempt_id) REFERENCES payout_attempts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE financial_reconciliations ADD CONSTRAINT fk_financial_reconciliations_receipt_id_provider_receipts FOREIGN KEY (receipt_id) REFERENCES provider_receipts (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_draft_payload_id_owner_user_id_private_payloads FOREIGN KEY (draft_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_input_payload_id_owner__a48038b5e5c8 FOREIGN KEY (input_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_authorization_id_owner__251c073af774 FOREIGN KEY (authorization_id,owner_user_id) REFERENCES execution_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_service_order_id_owner__90077b80dcc7 FOREIGN KEY (service_order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_entitlement_id_owner_us_0f63e49badd6 FOREIGN KEY (entitlement_id,owner_user_id) REFERENCES entitlements (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_service_release_id_service_releases FOREIGN KEY (service_release_id) REFERENCES service_releases (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_display_preferences ADD CONSTRAINT fk_task_display_preferences_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_display_preferences ADD CONSTRAINT fk_task_display_preferences_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_original_input_ref_owner_user_id_private_payloads FOREIGN KEY (original_input_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_entitlement_id_owner_user_id_entitlements FOREIGN KEY (entitlement_id,owner_user_id) REFERENCES entitlements (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_supersedes_run_id_owner_user_id_runs FOREIGN KEY (supersedes_run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE concurrency_locks ADD CONSTRAINT fk_concurrency_locks_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE concurrency_locks ADD CONSTRAINT fk_concurrency_locks_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_holds ADD CONSTRAINT fk_task_holds_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_holds ADD CONSTRAINT fk_task_holds_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_pending_action_id_owner_user_i_ce5303740dbd FOREIGN KEY (pending_action_id,owner_user_id) REFERENCES pending_actions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_input_ref_owner_user_id_private_payloads FOREIGN KEY (input_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_authorization_id_owner_user_id_ba80300e9c13 FOREIGN KEY (authorization_id,owner_user_id) REFERENCES execution_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_checkpoint_id_owner_user_id_checkpoints FOREIGN KEY (checkpoint_id,owner_user_id) REFERENCES checkpoints (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_node_id_nodes FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_runtime_policy_id_runtime_policies FOREIGN KEY (runtime_policy_id) REFERENCES runtime_policies (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_retry_of_owner_user_id_attempts FOREIGN KEY (retry_of,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_leases ADD CONSTRAINT fk_execution_leases_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_leases ADD CONSTRAINT fk_execution_leases_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_leases ADD CONSTRAINT fk_execution_leases_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_input_ref_owner_user_id_private_payloads FOREIGN KEY (input_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_result_id_owner_user_id_exe_0b5d5a9686cc FOREIGN KEY (result_id,owner_user_id) REFERENCES execution_results (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE invocation_permissions ADD CONSTRAINT fk_invocation_permissions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE invocation_permissions ADD CONSTRAINT fk_invocation_permissions_invocation_id_owner_u_5ce450d5b91c FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_results ADD CONSTRAINT fk_execution_results_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_results ADD CONSTRAINT fk_execution_results_invocation_id_owner_user_i_a817ced01d50 FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_results ADD CONSTRAINT fk_execution_results_data_ref_owner_user_id_private_payloads FOREIGN KEY (data_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_results ADD CONSTRAINT fk_execution_results_envelope_ref_owner_user_id_cd6869c3e566 FOREIGN KEY (envelope_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_actions ADD CONSTRAINT fk_pending_actions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_actions ADD CONSTRAINT fk_pending_actions_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_actions ADD CONSTRAINT fk_pending_actions_invocation_id_owner_user_id__f884506a716c FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_actions ADD CONSTRAINT fk_pending_actions_instructions_ref_owner_user__50bb27bb4337 FOREIGN KEY (instructions_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE external_requests ADD CONSTRAINT fk_external_requests_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE external_requests ADD CONSTRAINT fk_external_requests_invocation_id_owner_user_i_6b33813271ca FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_observations ADD CONSTRAINT fk_hook_observations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_observations ADD CONSTRAINT fk_hook_observations_invocation_id_owner_user_i_60fb00a07c58 FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE run_events ADD CONSTRAINT fk_run_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE run_events ADD CONSTRAINT fk_run_events_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE run_events ADD CONSTRAINT fk_run_events_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE run_events ADD CONSTRAINT fk_run_events_source_event_id_outbox_events FOREIGN KEY (source_event_id) REFERENCES outbox_events (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_connector_version_id_c_129ad92edbca FOREIGN KEY (connector_version_id) REFERENCES connector_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_script_action_id_script_actions FOREIGN KEY (script_action_id) REFERENCES script_actions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_authorization_id_owner_7b6e860d4f9f FOREIGN KEY (authorization_id,owner_user_id) REFERENCES execution_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_jobs ADD CONSTRAINT fk_verification_jobs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_jobs ADD CONSTRAINT fk_verification_jobs_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_jobs ADD CONSTRAINT fk_verification_jobs_binding_id_owner_user_id_v_fc1d427e41da FOREIGN KEY (binding_id,owner_user_id) REFERENCES verification_bindings (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_jobs ADD CONSTRAINT fk_verification_jobs_booking_operation_id_owner_00e8c9e87a1b FOREIGN KEY (booking_operation_id,owner_user_id) REFERENCES booking_operations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_jobs ADD CONSTRAINT fk_verification_jobs_evidence_ref_owner_user_id_0ff131e88ff6 FOREIGN KEY (evidence_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resolution_records ADD CONSTRAINT fk_resolution_records_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resolution_records ADD CONSTRAINT fk_resolution_records_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resolution_records ADD CONSTRAINT fk_resolution_records_invocation_id_owner_user__0f331f49a272 FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE resolution_records ADD CONSTRAINT fk_resolution_records_evidence_ref_owner_user_i_e2a6d0f338b7 FOREIGN KEY (evidence_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE late_evidence ADD CONSTRAINT fk_late_evidence_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE late_evidence ADD CONSTRAINT fk_late_evidence_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE late_evidence ADD CONSTRAINT fk_late_evidence_invocation_id_owner_user_id_ho_28f97f1b51ba FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE late_evidence ADD CONSTRAINT fk_late_evidence_evidence_ref_owner_user_id_private_payloads FOREIGN KEY (evidence_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE environment_leases ADD CONSTRAINT fk_environment_leases_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE environment_leases ADD CONSTRAINT fk_environment_leases_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE environment_leases ADD CONSTRAINT fk_environment_leases_node_id_nodes FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_series ADD CONSTRAINT fk_output_series_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_series ADD CONSTRAINT fk_output_series_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_series ADD CONSTRAINT fk_output_series_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_series ADD CONSTRAINT fk_output_series_current_checkpoint_id_owner_us_ab29c551aa1b FOREIGN KEY (current_checkpoint_id,owner_user_id) REFERENCES checkpoints (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_generations ADD CONSTRAINT fk_output_generations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_generations ADD CONSTRAINT fk_output_generations_invocation_id_owner_user__dad9fc6f145b FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_generations ADD CONSTRAINT fk_output_generations_output_series_id_owner_us_1c64421822cc FOREIGN KEY (output_series_id,owner_user_id) REFERENCES output_series (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_generations ADD CONSTRAINT fk_output_generations_snapshot_ref_owner_user_i_7acfc4b04865 FOREIGN KEY (snapshot_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_batches ADD CONSTRAINT fk_output_batches_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_batches ADD CONSTRAINT fk_output_batches_output_series_id_owner_user_i_2233aae46cf8 FOREIGN KEY (output_series_id,owner_user_id) REFERENCES output_series (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_batches ADD CONSTRAINT fk_output_batches_invocation_id_owner_user_id_h_7dcaf2a19e81 FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_batches ADD CONSTRAINT fk_output_batches_emission_id_owner_user_id_out_a31e0d0ccebc FOREIGN KEY (emission_id,owner_user_id) REFERENCES output_generations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_batches ADD CONSTRAINT fk_output_batches_producer_error_ref_owner_user_dfaa1dfa6112 FOREIGN KEY (producer_error_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_uploads ADD CONSTRAINT fk_output_uploads_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_uploads ADD CONSTRAINT fk_output_uploads_output_series_id_owner_user_i_79d786cb834e FOREIGN KEY (output_series_id,owner_user_id) REFERENCES output_series (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_uploads ADD CONSTRAINT fk_output_uploads_batch_id_owner_user_id_output_batches FOREIGN KEY (batch_id,owner_user_id) REFERENCES output_batches (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_uploads ADD CONSTRAINT fk_output_uploads_invocation_id_owner_user_id_h_45cb20ef4dc6 FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_uploads ADD CONSTRAINT fk_output_uploads_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_upload_parts ADD CONSTRAINT fk_output_upload_parts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_upload_parts ADD CONSTRAINT fk_output_upload_parts_upload_id_owner_user_id__fbb7799f0452 FOREIGN KEY (upload_id,owner_user_id) REFERENCES output_uploads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_outputs ADD CONSTRAINT fk_script_outputs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_outputs ADD CONSTRAINT fk_script_outputs_batch_id_owner_user_id_output_batches FOREIGN KEY (batch_id,owner_user_id) REFERENCES output_batches (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_outputs ADD CONSTRAINT fk_script_outputs_payload_id_owner_user_id_private_payloads FOREIGN KEY (payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_outputs ADD CONSTRAINT fk_script_outputs_upload_id_owner_user_id_output_uploads FOREIGN KEY (upload_id,owner_user_id) REFERENCES output_uploads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_outputs ADD CONSTRAINT fk_script_outputs_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_dependencies ADD CONSTRAINT fk_output_dependencies_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_dependencies ADD CONSTRAINT fk_output_dependencies_message_output_id_owner__33f33680fe29 FOREIGN KEY (message_output_id,owner_user_id) REFERENCES script_outputs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_dependencies ADD CONSTRAINT fk_output_dependencies_attachment_output_id_own_4fd619f388e8 FOREIGN KEY (attachment_output_id,owner_user_id) REFERENCES script_outputs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE result_output_refs ADD CONSTRAINT fk_result_output_refs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE result_output_refs ADD CONSTRAINT fk_result_output_refs_result_id_owner_user_id_e_670cf3306de3 FOREIGN KEY (result_id,owner_user_id) REFERENCES execution_results (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE result_output_refs ADD CONSTRAINT fk_result_output_refs_output_id_owner_user_id_script_outputs FOREIGN KEY (output_id,owner_user_id) REFERENCES script_outputs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_output_series_id_owner_user_id_output_series FOREIGN KEY (output_series_id,owner_user_id) REFERENCES output_series (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_payload_id_owner_user_id_private_payloads FOREIGN KEY (payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_batch_id_owner_user_id_output_batches FOREIGN KEY (batch_id,owner_user_id) REFERENCES output_batches (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_events ADD CONSTRAINT fk_script_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_events ADD CONSTRAINT fk_script_events_invocation_id_owner_user_id_ho_a8d3bf356bda FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_events ADD CONSTRAINT fk_script_events_script_version_id_script_versions FOREIGN KEY (script_version_id) REFERENCES script_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE script_events ADD CONSTRAINT fk_script_events_data_ref_owner_user_id_private_payloads FOREIGN KEY (data_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_bindings ADD CONSTRAINT fk_notification_bindings_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_bindings ADD CONSTRAINT fk_notification_bindings_target_payload_id_owne_172f78f5fd80 FOREIGN KEY (target_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_subscriptions ADD CONSTRAINT fk_notification_subscriptions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_subscriptions ADD CONSTRAINT fk_notification_subscriptions_binding_id_owner__8d12bbdf79c1 FOREIGN KEY (binding_id,owner_user_id) REFERENCES notification_bindings (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_cooldowns ADD CONSTRAINT fk_notification_cooldowns_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_cooldowns ADD CONSTRAINT fk_notification_cooldowns_subscription_id_owner_dce6ba367f5e FOREIGN KEY (subscription_id,owner_user_id) REFERENCES notification_subscriptions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_event_id_outbox_events FOREIGN KEY (event_id) REFERENCES outbox_events (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_message_output_id_owner_user_i_b78f4a017b4c FOREIGN KEY (message_output_id,owner_user_id) REFERENCES script_outputs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_content_ref_owner_user_id_private_payloads FOREIGN KEY (content_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notification_deliveries_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notification_deliveries_notification_id_owne_fe4a2f58c028 FOREIGN KEY (notification_id,owner_user_id) REFERENCES notifications (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notification_deliveries_message_output_id_ow_70f1e2c57724 FOREIGN KEY (message_output_id,owner_user_id) REFERENCES script_outputs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notification_deliveries_channel_binding_id_o_539657a910bb FOREIGN KEY (channel_binding_id,owner_user_id) REFERENCES notification_bindings (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE delivery_attempts ADD CONSTRAINT fk_delivery_attempts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE delivery_attempts ADD CONSTRAINT fk_delivery_attempts_delivery_id_owner_user_id__b6628be62fd5 FOREIGN KEY (delivery_id,owner_user_id) REFERENCES notification_deliveries (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attractions ADD CONSTRAINT fk_attractions_city_id_cities FOREIGN KEY (city_id) REFERENCES cities (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channels ADD CONSTRAINT fk_channels_attraction_id_attractions FOREIGN KEY (attraction_id) REFERENCES attractions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channels ADD CONSTRAINT fk_channels_current_rule_version_id_channel_rule_versions FOREIGN KEY (current_rule_version_id) REFERENCES channel_rule_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channel_rule_versions ADD CONSTRAINT fk_channel_rule_versions_channel_id_channels FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attraction_service_links ADD CONSTRAINT fk_attraction_service_links_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attraction_service_links ADD CONSTRAINT fk_attraction_service_links_attraction_id_attractions FOREIGN KEY (attraction_id) REFERENCES attractions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attraction_service_links ADD CONSTRAINT fk_attraction_service_links_service_id_owner_us_47f3c1149910 FOREIGN KEY (service_id,owner_user_id) REFERENCES services (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attraction_service_links ADD CONSTRAINT fk_attraction_service_links_channel_id_channels FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channel_accounts ADD CONSTRAINT fk_channel_accounts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channel_accounts ADD CONSTRAINT fk_channel_accounts_channel_id_channels FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE channel_accounts ADD CONSTRAINT fk_channel_accounts_credential_version_id_owner_da30284a4cb7 FOREIGN KEY (credential_version_id,owner_user_id) REFERENCES credential_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE travelers ADD CONSTRAINT fk_travelers_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE travelers ADD CONSTRAINT fk_travelers_current_version_id_owner_user_id_t_3937e62033b6 FOREIGN KEY (current_version_id,owner_user_id) REFERENCES traveler_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE traveler_versions ADD CONSTRAINT fk_traveler_versions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE traveler_versions ADD CONSTRAINT fk_traveler_versions_traveler_id_owner_user_id_travelers FOREIGN KEY (traveler_id,owner_user_id) REFERENCES travelers (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE traveler_versions ADD CONSTRAINT fk_traveler_versions_payload_id_owner_user_id_p_88e321b13aab FOREIGN KEY (payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorizations ADD CONSTRAINT fk_booking_authorizations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorizations ADD CONSTRAINT fk_booking_authorizations_task_id_owner_user_id_tasks FOREIGN KEY (task_id,owner_user_id) REFERENCES tasks (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorizations ADD CONSTRAINT fk_booking_authorizations_channel_account_id_ow_fa9359910334 FOREIGN KEY (channel_account_id,owner_user_id) REFERENCES channel_accounts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorizations ADD CONSTRAINT fk_booking_authorizations_channel_rule_version__5949b4ae72e4 FOREIGN KEY (channel_rule_version_id) REFERENCES channel_rule_versions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorizations ADD CONSTRAINT fk_booking_authorizations_attraction_id_attractions FOREIGN KEY (attraction_id) REFERENCES attractions (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorization_travelers ADD CONSTRAINT fk_booking_authorization_travelers_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorization_travelers ADD CONSTRAINT fk_booking_authorization_travelers_booking_auth_fee9b97a851a FOREIGN KEY (booking_authorization_id,owner_user_id) REFERENCES booking_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_authorization_travelers ADD CONSTRAINT fk_booking_authorization_travelers_traveler_ver_9ad87fb5577e FOREIGN KEY (traveler_version_id,owner_user_id) REFERENCES traveler_versions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_targets ADD CONSTRAINT fk_booking_targets_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_targets ADD CONSTRAINT fk_booking_targets_channel_account_id_owner_use_7d54111437bc FOREIGN KEY (channel_account_id,owner_user_id) REFERENCES channel_accounts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_targets ADD CONSTRAINT fk_booking_targets_target_snapshot_ref_owner_us_30df5786e7c8 FOREIGN KEY (target_snapshot_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_targets ADD CONSTRAINT fk_booking_targets_active_operation_id_owner_us_d9684c356e5e FOREIGN KEY (active_operation_id,owner_user_id) REFERENCES booking_operations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_operations ADD CONSTRAINT fk_booking_operations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_operations ADD CONSTRAINT fk_booking_operations_target_id_owner_user_id_b_dd20f6498fa6 FOREIGN KEY (target_id,owner_user_id) REFERENCES booking_targets (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_operations ADD CONSTRAINT fk_booking_operations_authorization_id_owner_us_881fb22a71f1 FOREIGN KEY (authorization_id,owner_user_id) REFERENCES booking_authorizations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_operations ADD CONSTRAINT fk_booking_operations_invocation_id_owner_user__b163c987bbec FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_operations ADD CONSTRAINT fk_booking_operations_evidence_ref_owner_user_i_5d1208af1752 FOREIGN KEY (evidence_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_operation_id_owner_user_id_bo_98420c14e391 FOREIGN KEY (operation_id,owner_user_id) REFERENCES booking_operations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_service_order_id_owner_user_i_9fc50259311b FOREIGN KEY (service_order_id,owner_user_id) REFERENCES service_orders (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_channel_id_channels FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_channel_account_id_owner_user_43a136435274 FOREIGN KEY (channel_account_id,owner_user_id) REFERENCES channel_accounts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE booking_orders ADD CONSTRAINT fk_booking_orders_order_payload_id_owner_user_i_dddc6cac7e08 FOREIGN KEY (order_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE inventory_observations ADD CONSTRAINT fk_inventory_observations_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE inventory_observations ADD CONSTRAINT fk_inventory_observations_channel_id_channels FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE inventory_observations ADD CONSTRAINT fk_inventory_observations_invocation_id_owner_u_422e6c3093ce FOREIGN KEY (invocation_id,owner_user_id) REFERENCES hook_invocations (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE outbox_events ADD CONSTRAINT fk_outbox_events_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE consumer_receipts ADD CONSTRAINT fk_consumer_receipts_event_id_outbox_events FOREIGN KEY (event_id) REFERENCES outbox_events (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_actor_user_id_users FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_subject_owner_user_id_users FOREIGN KEY (subject_owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE idempotency_records ADD CONSTRAINT fk_idempotency_records_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE idempotency_records ADD CONSTRAINT fk_idempotency_records_response_payload_id_owne_c634b46d2594 FOREIGN KEY (response_payload_id,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE operation_jobs ADD CONSTRAINT fk_operation_jobs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE operation_jobs ADD CONSTRAINT fk_operation_jobs_input_ref_owner_user_id_private_payloads FOREIGN KEY (input_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE operation_jobs ADD CONSTRAINT fk_operation_jobs_result_ref_owner_user_id_private_payloads FOREIGN KEY (result_ref,owner_user_id) REFERENCES private_payloads (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE platform_features ADD CONSTRAINT fk_platform_features_updated_by_users FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deletion_requests ADD CONSTRAINT fk_deletion_requests_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deletion_steps ADD CONSTRAINT fk_deletion_steps_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE deletion_steps ADD CONSTRAINT fk_deletion_steps_request_id_owner_user_id_deletion_requests FOREIGN KEY (request_id,owner_user_id) REFERENCES deletion_requests (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE retention_holds ADD CONSTRAINT fk_retention_holds_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE retention_holds ADD CONSTRAINT fk_retention_holds_authorized_by_users FOREIGN KEY (authorized_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE recovery_drills ADD CONSTRAINT fk_recovery_drills_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE recovery_drills ADD CONSTRAINT fk_recovery_drills_backup_id_backup_manifests FOREIGN KEY (backup_id) REFERENCES backup_manifests (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE node_bootstrap_tokens ADD CONSTRAINT fk_node_bootstrap_tokens_node_id_nodes FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE node_bootstrap_tokens ADD CONSTRAINT fk_node_bootstrap_tokens_issued_by_users FOREIGN KEY (issued_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE node_certificates ADD CONSTRAINT fk_node_certificates_node_id_nodes FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE agent_sessions ADD CONSTRAINT fk_agent_sessions_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE agent_sessions ADD CONSTRAINT fk_agent_sessions_attempt_id_owner_user_id_attempts FOREIGN KEY (attempt_id,owner_user_id) REFERENCES attempts (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE agent_message_receipts ADD CONSTRAINT fk_agent_message_receipts_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE agent_message_receipts ADD CONSTRAINT fk_agent_message_receipts_agent_session_id_owne_10f7f04d5fd5 FOREIGN KEY (agent_session_id,owner_user_id) REFERENCES agent_sessions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_segments ADD CONSTRAINT fk_log_segments_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_segments ADD CONSTRAINT fk_log_segments_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_segments ADD CONSTRAINT fk_log_segments_build_id_owner_user_id_builds FOREIGN KEY (build_id,owner_user_id) REFERENCES builds (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_segments ADD CONSTRAINT fk_log_segments_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_stream_gaps ADD CONSTRAINT fk_log_stream_gaps_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_stream_gaps ADD CONSTRAINT fk_log_stream_gaps_run_id_owner_user_id_runs FOREIGN KEY (run_id,owner_user_id) REFERENCES runs (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_query_jobs ADD CONSTRAINT fk_log_query_jobs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_query_jobs ADD CONSTRAINT fk_log_query_jobs_access_session_id_owner_user__bdbb5c3aed60 FOREIGN KEY (access_session_id,owner_user_id) REFERENCES data_access_sessions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_query_jobs ADD CONSTRAINT fk_log_query_jobs_result_object_id_owner_user_i_1a5136b682b1 FOREIGN KEY (result_object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_export_jobs ADD CONSTRAINT fk_log_export_jobs_owner_user_id_users FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_export_jobs ADD CONSTRAINT fk_log_export_jobs_access_session_id_owner_user_f5fa14f3cb49 FOREIGN KEY (access_session_id,owner_user_id) REFERENCES data_access_sessions (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE log_export_jobs ADD CONSTRAINT fk_log_export_jobs_object_id_owner_user_id_storage_objects FOREIGN KEY (object_id,owner_user_id) REFERENCES storage_objects (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE observability_policies ADD CONSTRAINT fk_observability_policies_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_instances ADD CONSTRAINT fk_alert_instances_rule_id_alert_rules FOREIGN KEY (rule_id) REFERENCES alert_rules (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_instances ADD CONSTRAINT fk_alert_instances_acknowledged_by_users FOREIGN KEY (acknowledged_by) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_events ADD CONSTRAINT fk_alert_events_instance_id_alert_instances FOREIGN KEY (instance_id) REFERENCES alert_instances (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_events ADD CONSTRAINT fk_alert_events_actor_user_id_users FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_silences ADD CONSTRAINT fk_alert_silences_actor_user_id_users FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE alert_deliveries ADD CONSTRAINT fk_alert_deliveries_instance_id_alert_instances FOREIGN KEY (instance_id) REFERENCES alert_instances (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE task_config_versions ADD CONSTRAINT fk_task_config_versions_script_version_id_actio_00d56fb28a4b FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_script_version_id_action_script_actions FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE continuations ADD CONSTRAINT fk_continuations_script_version_id_action_script_actions FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE hook_invocations ADD CONSTRAINT fk_hook_invocations_script_version_id_action_script_actions FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_releases ADD CONSTRAINT fk_service_releases_script_version_id_action_script_actions FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_authorizations ADD CONSTRAINT fk_execution_authorizations_script_version_id_a_0dc1dab3b456 FOREIGN KEY (script_version_id,action) REFERENCES script_actions (script_version_id,name) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_id_current_config_version_task_config_versions FOREIGN KEY (id,current_config_version) REFERENCES task_config_versions (task_id,version) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runs ADD CONSTRAINT fk_runs_task_id_config_version_script_version_i_50ec029d19ed FOREIGN KEY (task_id,config_version,script_version_id,action,owner_user_id) REFERENCES task_config_versions (task_id,version,script_version_id,action,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_run_id_continuation_number_owner_us_04fd48bf9ec8 FOREIGN KEY (run_id,continuation_number,owner_user_id) REFERENCES continuations (run_id,number,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE execution_leases ADD CONSTRAINT fk_execution_leases_attempt_id_run_id_owner_user_id_attempts FOREIGN KEY (attempt_id,run_id,owner_user_id) REFERENCES attempts (id,run_id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_transaction_id_currency_ledge_8f00230458b8 FOREIGN KEY (transaction_id,currency) REFERENCES ledger_transactions (id,currency) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_account_id_currency_ledger_accounts FOREIGN KEY (account_id,currency) REFERENCES ledger_accounts (id,currency) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_service_release_id_publisher_id_service_releases FOREIGN KEY (service_release_id,publisher_id) REFERENCES service_releases (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_price_plan_id_publisher_id_price_plans FOREIGN KEY (price_plan_id,publisher_id) REFERENCES price_plans (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_service_release_id_publisher__a106f8b0b3de FOREIGN KEY (service_release_id,publisher_id) REFERENCES service_releases (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE service_orders ADD CONSTRAINT fk_service_orders_price_plan_id_publisher_id_price_plans FOREIGN KEY (price_plan_id,publisher_id) REFERENCES price_plans (id,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE output_series ADD CONSTRAINT fk_output_series_task_id_config_version_owner_u_ab9e7fc7af35 FOREIGN KEY (task_id,config_version,owner_user_id) REFERENCES task_config_versions (task_id,version,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE checkpoints ADD CONSTRAINT fk_checkpoints_task_id_config_version_owner_use_9d20e4f0874e FOREIGN KEY (task_id,config_version,owner_user_id) REFERENCES task_config_versions (task_id,version,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE verification_bindings ADD CONSTRAINT fk_verification_bindings_task_id_config_version_41c9f19f67a4 FOREIGN KEY (task_id,config_version,owner_user_id) REFERENCES task_config_versions (task_id,version,owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX ix_users_1 ON users (email_normalized) WHERE status <> 'CLOSED';
CREATE INDEX ix_users_2 ON users (status,created_at,id);
CREATE INDEX ix_user_preferences_1 ON user_preferences (owner_user_id,created_at,id);
CREATE INDEX ix_user_preferences_2 ON user_preferences (owner_user_id);
CREATE INDEX ix_private_payloads_1 ON private_payloads (expires_at,id) WHERE deleted_at IS NULL;
CREATE INDEX ix_private_payloads_2 ON private_payloads (owner_user_id,created_at,id);
CREATE INDEX ix_private_payloads_3 ON private_payloads (owner_user_id);
CREATE INDEX ix_auth_sessions_1 ON auth_sessions (owner_user_id,expires_at) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions_2 ON auth_sessions (owner_user_id,created_at,id);
CREATE INDEX ix_auth_sessions_3 ON auth_sessions (owner_user_id);
CREATE INDEX ix_auth_challenges_1 ON auth_challenges (owner_user_id,purpose,expires_at) WHERE consumed_at IS NULL;
CREATE INDEX ix_auth_challenges_2 ON auth_challenges (owner_user_id,created_at,id);
CREATE INDEX ix_auth_challenges_3 ON auth_challenges (owner_user_id);
CREATE INDEX ix_auth_challenges_4 ON auth_challenges (target_payload_id,owner_user_id);
CREATE INDEX ix_recovery_intakes_1 ON recovery_intakes (expires_at,id);
CREATE INDEX ix_recovery_intakes_2 ON recovery_intakes (candidate_user_id);
CREATE INDEX ix_account_recovery_cases_1 ON account_recovery_cases (owner_user_id,created_at,id);
CREATE INDEX ix_account_recovery_cases_2 ON account_recovery_cases (owner_user_id);
CREATE INDEX ix_account_recovery_cases_3 ON account_recovery_cases (intake_id);
CREATE INDEX ix_account_recovery_cases_4 ON account_recovery_cases (requester_payload_id,owner_user_id);
CREATE INDEX ix_account_recovery_cases_5 ON account_recovery_cases (resolution_payload_id,owner_user_id);
CREATE INDEX ix_account_recovery_cases_6 ON account_recovery_cases (resolved_by);
CREATE INDEX ix_management_role_grants_1 ON management_role_grants (owner_user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_management_role_grants_2 ON management_role_grants (owner_user_id,created_at,id);
CREATE INDEX ix_management_role_grants_3 ON management_role_grants (owner_user_id);
CREATE INDEX ix_management_role_grants_4 ON management_role_grants (granted_by);
CREATE INDEX ix_data_access_sessions_1 ON data_access_sessions (owner_user_id,created_at,id);
CREATE INDEX ix_data_access_sessions_2 ON data_access_sessions (owner_user_id);
CREATE INDEX ix_data_access_sessions_3 ON data_access_sessions (capability_grant_id,owner_user_id);
CREATE INDEX ix_personal_api_tokens_1 ON personal_api_tokens (owner_user_id,created_at,id);
CREATE INDEX ix_personal_api_tokens_2 ON personal_api_tokens (owner_user_id);
CREATE INDEX ix_action_previews_1 ON action_previews (owner_user_id,created_at,id);
CREATE INDEX ix_action_previews_2 ON action_previews (owner_user_id);
CREATE INDEX ix_storage_objects_1 ON storage_objects (expires_at,id) WHERE deleted_at IS NULL;
CREATE INDEX ix_storage_objects_2 ON storage_objects (owner_user_id,created_at,id);
CREATE INDEX ix_storage_objects_3 ON storage_objects (owner_user_id);
CREATE INDEX ix_script_uploads_1 ON script_uploads (owner_user_id,created_at,id);
CREATE INDEX ix_script_uploads_2 ON script_uploads (owner_user_id);
CREATE INDEX ix_script_uploads_3 ON script_uploads (object_id,owner_user_id);
CREATE INDEX ix_scripts_1 ON scripts (owner_user_id,created_at,id);
CREATE INDEX ix_scripts_2 ON scripts (owner_user_id);
CREATE INDEX ix_script_versions_1 ON script_versions (owner_user_id,created_at,id);
CREATE INDEX ix_script_versions_2 ON script_versions (owner_user_id);
CREATE INDEX ix_script_versions_3 ON script_versions (script_id,owner_user_id);
CREATE INDEX ix_script_versions_4 ON script_versions (source_object_id,owner_user_id);
CREATE INDEX ix_script_versions_5 ON script_versions (build_artifact_id,owner_user_id);
CREATE INDEX ix_script_actions_1 ON script_actions (owner_user_id,created_at,id);
CREATE INDEX ix_script_actions_2 ON script_actions (owner_user_id);
CREATE INDEX ix_script_actions_3 ON script_actions (script_version_id,owner_user_id);
CREATE INDEX ix_script_imports_1 ON script_imports (owner_user_id,created_at,id);
CREATE INDEX ix_script_imports_2 ON script_imports (owner_user_id);
CREATE INDEX ix_script_imports_3 ON script_imports (source_payload_id,owner_user_id);
CREATE INDEX ix_script_imports_4 ON script_imports (source_credential_version_id,owner_user_id);
CREATE INDEX ix_script_imports_5 ON script_imports (snapshot_object_id,owner_user_id);
CREATE INDEX ix_script_imports_6 ON script_imports (materialized_version_id,owner_user_id);
CREATE INDEX ix_import_attempts_1 ON import_attempts (owner_user_id,created_at,id);
CREATE INDEX ix_import_attempts_2 ON import_attempts (owner_user_id);
CREATE INDEX ix_import_attempts_3 ON import_attempts (import_id,owner_user_id);
CREATE INDEX ix_version_adapter_specs_1 ON version_adapter_specs (owner_user_id,created_at,id);
CREATE INDEX ix_version_adapter_specs_2 ON version_adapter_specs (owner_user_id);
CREATE INDEX ix_version_adapter_specs_3 ON version_adapter_specs (script_version_id,owner_user_id);
CREATE INDEX ix_version_adapter_specs_4 ON version_adapter_specs (payload_id,owner_user_id);
CREATE INDEX ix_builds_1 ON builds (status,created_at,id);
CREATE INDEX ix_builds_2 ON builds (owner_user_id,created_at,id);
CREATE INDEX ix_builds_3 ON builds (owner_user_id);
CREATE INDEX ix_builds_4 ON builds (script_version_id,owner_user_id);
CREATE INDEX ix_builds_5 ON builds (base_image_id);
CREATE INDEX ix_artifacts_1 ON artifacts (owner_user_id,created_at,id);
CREATE INDEX ix_artifacts_2 ON artifacts (owner_user_id);
CREATE INDEX ix_artifacts_3 ON artifacts (build_id,owner_user_id);
CREATE INDEX ix_artifacts_4 ON artifacts (object_id,owner_user_id);
CREATE INDEX ix_version_test_evidence_1 ON version_test_evidence (owner_user_id,created_at,id);
CREATE INDEX ix_version_test_evidence_2 ON version_test_evidence (owner_user_id);
CREATE INDEX ix_version_test_evidence_3 ON version_test_evidence (script_version_id,owner_user_id);
CREATE INDEX ix_version_test_evidence_4 ON version_test_evidence (run_id,owner_user_id);
CREATE INDEX ix_deployments_1 ON deployments (owner_user_id,created_at,id);
CREATE INDEX ix_deployments_2 ON deployments (owner_user_id);
CREATE INDEX ix_deployments_3 ON deployments (script_version_id,owner_user_id);
CREATE INDEX ix_deployments_4 ON deployments (artifact_id,owner_user_id);
CREATE INDEX ix_deployments_5 ON deployments (resource_profile_id);
CREATE INDEX ix_node_commands_1 ON node_commands (node_id);
CREATE INDEX ix_node_commands_2 ON node_commands (attempt_id);
CREATE INDEX ix_runtime_policies_1 ON runtime_policies (created_by);
CREATE INDEX ix_network_policies_1 ON network_policies (created_by);
CREATE INDEX ix_credentials_1 ON credentials (owner_user_id,created_at,id);
CREATE INDEX ix_credentials_2 ON credentials (owner_user_id);
CREATE INDEX ix_credentials_3 ON credentials (current_version_id,owner_user_id);
CREATE INDEX ix_credential_versions_1 ON credential_versions (owner_user_id,created_at,id);
CREATE INDEX ix_credential_versions_2 ON credential_versions (owner_user_id);
CREATE INDEX ix_credential_versions_3 ON credential_versions (credential_id,owner_user_id);
CREATE INDEX ix_credential_versions_4 ON credential_versions (payload_id,owner_user_id);
CREATE INDEX ix_execution_authorizations_1 ON execution_authorizations (owner_user_id,status,expires_at);
CREATE INDEX ix_execution_authorizations_2 ON execution_authorizations (owner_user_id,created_at,id);
CREATE INDEX ix_execution_authorizations_3 ON execution_authorizations (owner_user_id);
CREATE INDEX ix_execution_authorizations_4 ON execution_authorizations (script_version_id);
CREATE INDEX ix_execution_authorizations_5 ON execution_authorizations (script_version_id,action);
CREATE INDEX ix_authorization_credentials_1 ON authorization_credentials (owner_user_id,created_at,id);
CREATE INDEX ix_authorization_credentials_2 ON authorization_credentials (owner_user_id);
CREATE INDEX ix_authorization_credentials_3 ON authorization_credentials (authorization_id,owner_user_id);
CREATE INDEX ix_authorization_credentials_4 ON authorization_credentials (credential_version_id,owner_user_id);
CREATE INDEX ix_quota_reservations_1 ON quota_reservations (owner_user_id,created_at,id);
CREATE INDEX ix_quota_reservations_2 ON quota_reservations (owner_user_id);
CREATE INDEX ix_quota_reservations_3 ON quota_reservations (quota_account_id);
CREATE INDEX ix_quota_reservations_4 ON quota_reservations (attempt_id,owner_user_id);
CREATE INDEX ix_quota_reservations_5 ON quota_reservations (output_upload_id,owner_user_id);
CREATE INDEX ix_resource_usage_segments_1 ON resource_usage_segments (owner_user_id,created_at,id);
CREATE INDEX ix_resource_usage_segments_2 ON resource_usage_segments (owner_user_id);
CREATE INDEX ix_resource_usage_segments_3 ON resource_usage_segments (attempt_id,owner_user_id);
CREATE INDEX ix_publisher_profiles_1 ON publisher_profiles (owner_user_id,created_at,id);
CREATE INDEX ix_publisher_profiles_2 ON publisher_profiles (owner_user_id);
CREATE UNIQUE INDEX ix_payout_profiles_1 ON payout_profiles (owner_user_id) WHERE is_current;
CREATE INDEX ix_payout_profiles_2 ON payout_profiles (owner_user_id,created_at,id);
CREATE INDEX ix_payout_profiles_3 ON payout_profiles (owner_user_id);
CREATE INDEX ix_payout_profiles_4 ON payout_profiles (account_payload_id,owner_user_id);
CREATE INDEX ix_service_categories_1 ON service_categories (parent_id);
CREATE INDEX ix_services_1 ON services (status,category_id,created_at,id);
CREATE INDEX ix_services_2 ON services (owner_user_id,created_at,id);
CREATE INDEX ix_services_3 ON services (owner_user_id);
CREATE INDEX ix_services_4 ON services (category_id);
CREATE INDEX ix_services_5 ON services (current_release_id,owner_user_id);
CREATE INDEX ix_service_releases_1 ON service_releases (owner_user_id,created_at,id);
CREATE INDEX ix_service_releases_2 ON service_releases (owner_user_id);
CREATE INDEX ix_service_releases_3 ON service_releases (service_id,owner_user_id);
CREATE INDEX ix_service_releases_4 ON service_releases (script_version_id,owner_user_id);
CREATE INDEX ix_service_releases_5 ON service_releases (deployment_id,owner_user_id);
CREATE INDEX ix_service_releases_6 ON service_releases (script_version_id,action);
CREATE INDEX ix_commerce_policies_1 ON commerce_policies (created_by);
CREATE INDEX ix_price_plans_1 ON price_plans (owner_user_id,created_at,id);
CREATE INDEX ix_price_plans_2 ON price_plans (owner_user_id);
CREATE INDEX ix_price_plans_3 ON price_plans (service_release_id,owner_user_id);
CREATE INDEX ix_price_plans_4 ON price_plans (commerce_policy_id);
CREATE INDEX ix_quotes_1 ON quotes (owner_user_id,created_at,id);
CREATE INDEX ix_quotes_2 ON quotes (owner_user_id);
CREATE INDEX ix_quotes_3 ON quotes (publisher_id);
CREATE INDEX ix_quotes_4 ON quotes (service_release_id);
CREATE INDEX ix_quotes_5 ON quotes (price_plan_id);
CREATE INDEX ix_quotes_6 ON quotes (authorization_id,owner_user_id);
CREATE INDEX ix_quotes_7 ON quotes (input_payload_id,owner_user_id);
CREATE INDEX ix_quotes_8 ON quotes (service_release_id,publisher_id);
CREATE INDEX ix_quotes_9 ON quotes (price_plan_id,publisher_id);
CREATE INDEX ix_service_orders_1 ON service_orders (publisher_id,created_at,id);
CREATE INDEX ix_service_orders_2 ON service_orders (status,payment_deadline,id);
CREATE INDEX ix_service_orders_3 ON service_orders (owner_user_id,created_at,id);
CREATE INDEX ix_service_orders_4 ON service_orders (owner_user_id);
CREATE INDEX ix_service_orders_5 ON service_orders (publisher_id);
CREATE INDEX ix_service_orders_6 ON service_orders (quote_id,owner_user_id);
CREATE INDEX ix_service_orders_7 ON service_orders (service_release_id);
CREATE INDEX ix_service_orders_8 ON service_orders (price_plan_id);
CREATE INDEX ix_service_orders_9 ON service_orders (funding_payment_id,owner_user_id);
CREATE INDEX ix_service_orders_10 ON service_orders (funding_transaction_id,owner_user_id);
CREATE INDEX ix_service_orders_11 ON service_orders (service_release_id,publisher_id);
CREATE INDEX ix_service_orders_12 ON service_orders (price_plan_id,publisher_id);
CREATE UNIQUE INDEX ix_payments_1 ON payments (order_id) WHERE status IN ('CREATED','PENDING','UNKNOWN');
CREATE INDEX ix_payments_2 ON payments (status,next_reconcile_at,id);
CREATE INDEX ix_payments_3 ON payments (owner_user_id,created_at,id);
CREATE INDEX ix_payments_4 ON payments (owner_user_id);
CREATE INDEX ix_payments_5 ON payments (order_id,owner_user_id);
CREATE INDEX ix_payments_6 ON payments (provider_action_payload_id,owner_user_id);
CREATE INDEX ix_provider_receipts_1 ON provider_receipts (status,created_at,id);
CREATE INDEX ix_provider_receipts_2 ON provider_receipts (matched_owner_id);
CREATE UNIQUE INDEX ix_payment_transactions_1 ON payment_transactions (order_id) WHERE allocation='FUNDING';
CREATE INDEX ix_payment_transactions_2 ON payment_transactions (owner_user_id,created_at,id);
CREATE INDEX ix_payment_transactions_3 ON payment_transactions (owner_user_id);
CREATE INDEX ix_payment_transactions_4 ON payment_transactions (payment_id,owner_user_id);
CREATE INDEX ix_payment_transactions_5 ON payment_transactions (order_id,owner_user_id);
CREATE INDEX ix_payment_transactions_6 ON payment_transactions (receipt_id);
CREATE INDEX ix_payment_events_1 ON payment_events (owner_user_id,created_at,id);
CREATE INDEX ix_payment_events_2 ON payment_events (owner_user_id);
CREATE INDEX ix_payment_events_3 ON payment_events (payment_id,owner_user_id);
CREATE INDEX ix_payment_events_4 ON payment_events (receipt_id);
CREATE INDEX ix_entitlements_1 ON entitlements (owner_user_id,created_at,id);
CREATE INDEX ix_entitlements_2 ON entitlements (owner_user_id);
CREATE INDEX ix_entitlements_3 ON entitlements (order_id,owner_user_id);
CREATE INDEX ix_entitlements_4 ON entitlements (service_release_id);
CREATE UNIQUE INDEX ix_usage_reservations_1 ON usage_reservations (entitlement_id) WHERE status IN ('RESERVED','COMMITTED');
CREATE INDEX ix_usage_reservations_2 ON usage_reservations (owner_user_id,created_at,id);
CREATE INDEX ix_usage_reservations_3 ON usage_reservations (owner_user_id);
CREATE INDEX ix_usage_reservations_4 ON usage_reservations (entitlement_id,owner_user_id);
CREATE INDEX ix_usage_reservations_5 ON usage_reservations (run_id,owner_user_id);
CREATE INDEX ix_fulfillment_events_1 ON fulfillment_events (owner_user_id,created_at,id);
CREATE INDEX ix_fulfillment_events_2 ON fulfillment_events (owner_user_id);
CREATE INDEX ix_fulfillment_events_3 ON fulfillment_events (order_id,owner_user_id);
CREATE INDEX ix_fulfillment_events_4 ON fulfillment_events (run_id,owner_user_id);
CREATE INDEX ix_fulfillment_events_5 ON fulfillment_events (source_event_id);
CREATE INDEX ix_fulfillment_events_6 ON fulfillment_events (evidence_payload_id,owner_user_id);
CREATE UNIQUE INDEX ix_service_disputes_1 ON service_disputes (order_id) WHERE status IN ('OPEN','RESOLVING');
CREATE INDEX ix_service_disputes_2 ON service_disputes (owner_user_id,created_at,id);
CREATE INDEX ix_service_disputes_3 ON service_disputes (owner_user_id);
CREATE INDEX ix_service_disputes_4 ON service_disputes (order_id,owner_user_id);
CREATE INDEX ix_service_disputes_5 ON service_disputes (evidence_payload_id,owner_user_id);
CREATE INDEX ix_service_disputes_6 ON service_disputes (resolved_by);
CREATE INDEX ix_refunds_1 ON refunds (owner_user_id,created_at,id);
CREATE INDEX ix_refunds_2 ON refunds (owner_user_id);
CREATE INDEX ix_refunds_3 ON refunds (order_id,owner_user_id);
CREATE INDEX ix_refunds_4 ON refunds (payment_id,owner_user_id);
CREATE INDEX ix_refunds_5 ON refunds (payment_transaction_id,owner_user_id);
CREATE UNIQUE INDEX ix_refund_attempts_1 ON refund_attempts (refund_id) WHERE status IN ('CREATED','PROCESSING','UNKNOWN');
CREATE INDEX ix_refund_attempts_2 ON refund_attempts (owner_user_id,created_at,id);
CREATE INDEX ix_refund_attempts_3 ON refund_attempts (owner_user_id);
CREATE INDEX ix_refund_attempts_4 ON refund_attempts (refund_id,owner_user_id);
CREATE INDEX ix_refund_events_1 ON refund_events (owner_user_id,created_at,id);
CREATE INDEX ix_refund_events_2 ON refund_events (owner_user_id);
CREATE INDEX ix_refund_events_3 ON refund_events (refund_attempt_id,owner_user_id);
CREATE INDEX ix_refund_events_4 ON refund_events (receipt_id);
CREATE INDEX ix_ledger_accounts_1 ON ledger_accounts (party_user_id);
CREATE INDEX ix_ledger_transactions_1 ON ledger_transactions (source_event_id);
CREATE INDEX ix_ledger_transactions_2 ON ledger_transactions (order_id);
CREATE INDEX ix_ledger_transactions_3 ON ledger_transactions (reversal_of);
CREATE INDEX ix_ledger_entries_1 ON ledger_entries (publisher_id,currency,matures_at,id);
CREATE INDEX ix_ledger_entries_2 ON ledger_entries (order_id,created_at,id);
CREATE INDEX ix_ledger_entries_3 ON ledger_entries (transaction_id);
CREATE INDEX ix_ledger_entries_4 ON ledger_entries (account_id);
CREATE INDEX ix_ledger_entries_5 ON ledger_entries (order_id);
CREATE INDEX ix_ledger_entries_6 ON ledger_entries (publisher_id);
CREATE INDEX ix_ledger_entries_7 ON ledger_entries (transaction_id,currency);
CREATE INDEX ix_ledger_entries_8 ON ledger_entries (account_id,currency);
CREATE INDEX ix_publisher_balances_1 ON publisher_balances (owner_user_id,created_at,id);
CREATE INDEX ix_publisher_balances_2 ON publisher_balances (owner_user_id);
CREATE INDEX ix_publisher_balances_3 ON publisher_balances (last_ledger_transaction_id);
CREATE INDEX ix_settlement_batches_1 ON settlement_batches (owner_user_id,created_at,id);
CREATE INDEX ix_settlement_batches_2 ON settlement_batches (owner_user_id);
CREATE UNIQUE INDEX ix_settlement_lines_1 ON settlement_lines (ledger_entry_id) WHERE released_at IS NULL;
CREATE INDEX ix_settlement_lines_2 ON settlement_lines (owner_user_id,created_at,id);
CREATE INDEX ix_settlement_lines_3 ON settlement_lines (owner_user_id);
CREATE INDEX ix_settlement_lines_4 ON settlement_lines (batch_id,owner_user_id);
CREATE INDEX ix_settlement_lines_5 ON settlement_lines (ledger_entry_id);
CREATE INDEX ix_payouts_1 ON payouts (owner_user_id,created_at,id);
CREATE INDEX ix_payouts_2 ON payouts (owner_user_id);
CREATE INDEX ix_payouts_3 ON payouts (batch_id,owner_user_id);
CREATE INDEX ix_payouts_4 ON payouts (payout_profile_id,owner_user_id);
CREATE UNIQUE INDEX ix_payout_attempts_1 ON payout_attempts (payout_id) WHERE status IN ('CREATED','PROCESSING','UNKNOWN');
CREATE INDEX ix_payout_attempts_2 ON payout_attempts (owner_user_id,created_at,id);
CREATE INDEX ix_payout_attempts_3 ON payout_attempts (owner_user_id);
CREATE INDEX ix_payout_attempts_4 ON payout_attempts (payout_id,owner_user_id);
CREATE INDEX ix_payout_events_1 ON payout_events (owner_user_id,created_at,id);
CREATE INDEX ix_payout_events_2 ON payout_events (owner_user_id);
CREATE INDEX ix_payout_events_3 ON payout_events (payout_attempt_id,owner_user_id);
CREATE INDEX ix_payout_events_4 ON payout_events (receipt_id);
CREATE INDEX ix_financial_reconciliations_1 ON financial_reconciliations (status,next_attempt_at,id);
CREATE INDEX ix_financial_reconciliations_2 ON financial_reconciliations (payment_id);
CREATE INDEX ix_financial_reconciliations_3 ON financial_reconciliations (refund_attempt_id);
CREATE INDEX ix_financial_reconciliations_4 ON financial_reconciliations (payout_attempt_id);
CREATE INDEX ix_financial_reconciliations_5 ON financial_reconciliations (receipt_id);
CREATE INDEX ix_tasks_1 ON tasks (next_fire_at,id) WHERE status='ACTIVE' AND next_fire_at IS NOT NULL;
CREATE INDEX ix_tasks_2 ON tasks (owner_user_id,created_at,id);
CREATE INDEX ix_tasks_3 ON tasks (owner_user_id);
CREATE INDEX ix_tasks_4 ON tasks (draft_payload_id,owner_user_id);
CREATE INDEX ix_tasks_5 ON tasks (id,current_config_version);
CREATE INDEX ix_task_config_versions_1 ON task_config_versions (owner_user_id,created_at,id);
CREATE INDEX ix_task_config_versions_2 ON task_config_versions (owner_user_id);
CREATE INDEX ix_task_config_versions_3 ON task_config_versions (task_id,owner_user_id);
CREATE INDEX ix_task_config_versions_4 ON task_config_versions (script_version_id);
CREATE INDEX ix_task_config_versions_5 ON task_config_versions (input_payload_id,owner_user_id);
CREATE INDEX ix_task_config_versions_6 ON task_config_versions (authorization_id,owner_user_id);
CREATE INDEX ix_task_config_versions_7 ON task_config_versions (service_order_id,owner_user_id);
CREATE INDEX ix_task_config_versions_8 ON task_config_versions (entitlement_id,owner_user_id);
CREATE INDEX ix_task_config_versions_9 ON task_config_versions (service_release_id);
CREATE INDEX ix_task_config_versions_10 ON task_config_versions (script_version_id,action);
CREATE INDEX ix_task_display_preferences_1 ON task_display_preferences (owner_user_id,created_at,id);
CREATE INDEX ix_task_display_preferences_2 ON task_display_preferences (owner_user_id);
CREATE INDEX ix_task_display_preferences_3 ON task_display_preferences (task_id,owner_user_id);
CREATE UNIQUE INDEX ix_runs_1 ON runs (task_id) WHERE status IN ('QUEUED','PREPARING','READY','RUNNING','STOPPING','WAITING_INPUT','RECONCILING');
CREATE UNIQUE INDEX ix_runs_2 ON runs (task_id,scheduled_at,config_version) WHERE scheduled_at IS NOT NULL;
CREATE INDEX ix_runs_3 ON runs (status,created_at,id);
CREATE INDEX ix_runs_4 ON runs (owner_user_id,created_at,id);
CREATE INDEX ix_runs_5 ON runs (owner_user_id);
CREATE INDEX ix_runs_6 ON runs (task_id,owner_user_id);
CREATE INDEX ix_runs_7 ON runs (script_version_id);
CREATE INDEX ix_runs_8 ON runs (original_input_ref,owner_user_id);
CREATE INDEX ix_runs_9 ON runs (entitlement_id,owner_user_id);
CREATE INDEX ix_runs_10 ON runs (supersedes_run_id,owner_user_id);
CREATE INDEX ix_runs_11 ON runs (script_version_id,action);
CREATE INDEX ix_runs_12 ON runs (task_id,config_version,script_version_id,action,owner_user_id);
CREATE UNIQUE INDEX ix_concurrency_locks_1 ON concurrency_locks (owner_user_id,key) WHERE released_at IS NULL;
CREATE INDEX ix_concurrency_locks_2 ON concurrency_locks (owner_user_id,created_at,id);
CREATE INDEX ix_concurrency_locks_3 ON concurrency_locks (owner_user_id);
CREATE INDEX ix_concurrency_locks_4 ON concurrency_locks (run_id,owner_user_id);
CREATE UNIQUE INDEX ix_task_holds_1 ON task_holds (task_id,reason,source_type,source_id) WHERE resolved_at IS NULL;
CREATE INDEX ix_task_holds_2 ON task_holds (owner_user_id,created_at,id);
CREATE INDEX ix_task_holds_3 ON task_holds (owner_user_id);
CREATE INDEX ix_task_holds_4 ON task_holds (task_id,owner_user_id);
CREATE INDEX ix_continuations_1 ON continuations (owner_user_id,created_at,id);
CREATE INDEX ix_continuations_2 ON continuations (owner_user_id);
CREATE INDEX ix_continuations_3 ON continuations (run_id,owner_user_id);
CREATE INDEX ix_continuations_4 ON continuations (pending_action_id,owner_user_id);
CREATE INDEX ix_continuations_5 ON continuations (script_version_id);
CREATE INDEX ix_continuations_6 ON continuations (input_ref,owner_user_id);
CREATE INDEX ix_continuations_7 ON continuations (authorization_id,owner_user_id);
CREATE INDEX ix_continuations_8 ON continuations (checkpoint_id,owner_user_id);
CREATE INDEX ix_continuations_9 ON continuations (script_version_id,action);
CREATE INDEX ix_attempts_1 ON attempts (owner_user_id,created_at,id);
CREATE INDEX ix_attempts_2 ON attempts (owner_user_id);
CREATE INDEX ix_attempts_3 ON attempts (run_id,owner_user_id);
CREATE INDEX ix_attempts_4 ON attempts (node_id);
CREATE INDEX ix_attempts_5 ON attempts (runtime_policy_id);
CREATE INDEX ix_attempts_6 ON attempts (retry_of,owner_user_id);
CREATE INDEX ix_attempts_7 ON attempts (run_id,continuation_number,owner_user_id);
CREATE INDEX ix_execution_leases_1 ON execution_leases (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX ix_execution_leases_2 ON execution_leases (owner_user_id,created_at,id);
CREATE INDEX ix_execution_leases_3 ON execution_leases (owner_user_id);
CREATE INDEX ix_execution_leases_4 ON execution_leases (run_id,owner_user_id);
CREATE INDEX ix_execution_leases_5 ON execution_leases (attempt_id,owner_user_id);
CREATE INDEX ix_execution_leases_6 ON execution_leases (attempt_id,run_id,owner_user_id);
CREATE INDEX ix_hook_invocations_1 ON hook_invocations (owner_user_id,created_at,id);
CREATE INDEX ix_hook_invocations_2 ON hook_invocations (owner_user_id);
CREATE INDEX ix_hook_invocations_3 ON hook_invocations (attempt_id,owner_user_id);
CREATE INDEX ix_hook_invocations_4 ON hook_invocations (script_version_id);
CREATE INDEX ix_hook_invocations_5 ON hook_invocations (input_ref,owner_user_id);
CREATE INDEX ix_hook_invocations_6 ON hook_invocations (result_id,owner_user_id);
CREATE INDEX ix_hook_invocations_7 ON hook_invocations (script_version_id,action);
CREATE UNIQUE INDEX ix_invocation_permissions_1 ON invocation_permissions (invocation_id) WHERE revoked_at IS NULL AND phase IN ('BUSINESS','OUTPUT');
CREATE INDEX ix_invocation_permissions_2 ON invocation_permissions (owner_user_id,created_at,id);
CREATE INDEX ix_invocation_permissions_3 ON invocation_permissions (owner_user_id);
CREATE INDEX ix_invocation_permissions_4 ON invocation_permissions (invocation_id,owner_user_id);
CREATE INDEX ix_execution_results_1 ON execution_results (owner_user_id,created_at,id);
CREATE INDEX ix_execution_results_2 ON execution_results (owner_user_id);
CREATE INDEX ix_execution_results_3 ON execution_results (invocation_id,owner_user_id);
CREATE INDEX ix_execution_results_4 ON execution_results (data_ref,owner_user_id);
CREATE INDEX ix_execution_results_5 ON execution_results (envelope_ref,owner_user_id);
CREATE UNIQUE INDEX ix_pending_actions_1 ON pending_actions (run_id) WHERE status='OPEN';
CREATE INDEX ix_pending_actions_2 ON pending_actions (owner_user_id,status,expires_at);
CREATE INDEX ix_pending_actions_3 ON pending_actions (owner_user_id,created_at,id);
CREATE INDEX ix_pending_actions_4 ON pending_actions (owner_user_id);
CREATE INDEX ix_pending_actions_5 ON pending_actions (run_id,owner_user_id);
CREATE INDEX ix_pending_actions_6 ON pending_actions (invocation_id,owner_user_id);
CREATE INDEX ix_pending_actions_7 ON pending_actions (instructions_ref,owner_user_id);
CREATE INDEX ix_external_requests_1 ON external_requests (effect_status,updated_at,id);
CREATE INDEX ix_external_requests_2 ON external_requests (owner_user_id,created_at,id);
CREATE INDEX ix_external_requests_3 ON external_requests (owner_user_id);
CREATE INDEX ix_external_requests_4 ON external_requests (invocation_id,owner_user_id);
CREATE INDEX ix_hook_observations_1 ON hook_observations (owner_user_id,created_at,id);
CREATE INDEX ix_hook_observations_2 ON hook_observations (owner_user_id);
CREATE INDEX ix_hook_observations_3 ON hook_observations (invocation_id,owner_user_id);
CREATE INDEX ix_run_events_1 ON run_events (owner_user_id,created_at,id);
CREATE INDEX ix_run_events_2 ON run_events (owner_user_id);
CREATE INDEX ix_run_events_3 ON run_events (run_id,owner_user_id);
CREATE INDEX ix_run_events_4 ON run_events (attempt_id,owner_user_id);
CREATE INDEX ix_run_events_5 ON run_events (source_event_id);
CREATE INDEX ix_verification_bindings_1 ON verification_bindings (owner_user_id,created_at,id);
CREATE INDEX ix_verification_bindings_2 ON verification_bindings (owner_user_id);
CREATE INDEX ix_verification_bindings_3 ON verification_bindings (task_id,owner_user_id);
CREATE INDEX ix_verification_bindings_4 ON verification_bindings (connector_version_id);
CREATE INDEX ix_verification_bindings_5 ON verification_bindings (script_action_id);
CREATE INDEX ix_verification_bindings_6 ON verification_bindings (authorization_id,owner_user_id);
CREATE INDEX ix_verification_bindings_7 ON verification_bindings (task_id,config_version,owner_user_id);
CREATE INDEX ix_verification_jobs_1 ON verification_jobs (status,next_attempt_at,id);
CREATE INDEX ix_verification_jobs_2 ON verification_jobs (owner_user_id,created_at,id);
CREATE INDEX ix_verification_jobs_3 ON verification_jobs (owner_user_id);
CREATE INDEX ix_verification_jobs_4 ON verification_jobs (run_id,owner_user_id);
CREATE INDEX ix_verification_jobs_5 ON verification_jobs (binding_id,owner_user_id);
CREATE INDEX ix_verification_jobs_6 ON verification_jobs (booking_operation_id,owner_user_id);
CREATE INDEX ix_verification_jobs_7 ON verification_jobs (evidence_ref,owner_user_id);
CREATE INDEX ix_resolution_records_1 ON resolution_records (owner_user_id,created_at,id);
CREATE INDEX ix_resolution_records_2 ON resolution_records (owner_user_id);
CREATE INDEX ix_resolution_records_3 ON resolution_records (run_id,owner_user_id);
CREATE INDEX ix_resolution_records_4 ON resolution_records (invocation_id,owner_user_id);
CREATE INDEX ix_resolution_records_5 ON resolution_records (evidence_ref,owner_user_id);
CREATE INDEX ix_late_evidence_1 ON late_evidence (owner_user_id,created_at,id);
CREATE INDEX ix_late_evidence_2 ON late_evidence (owner_user_id);
CREATE INDEX ix_late_evidence_3 ON late_evidence (run_id,owner_user_id);
CREATE INDEX ix_late_evidence_4 ON late_evidence (invocation_id,owner_user_id);
CREATE INDEX ix_late_evidence_5 ON late_evidence (evidence_ref,owner_user_id);
CREATE INDEX ix_environment_leases_1 ON environment_leases (cleanup_status,next_attempt_at,id);
CREATE INDEX ix_environment_leases_2 ON environment_leases (owner_user_id,created_at,id);
CREATE INDEX ix_environment_leases_3 ON environment_leases (owner_user_id);
CREATE INDEX ix_environment_leases_4 ON environment_leases (attempt_id,owner_user_id);
CREATE INDEX ix_environment_leases_5 ON environment_leases (node_id);
CREATE INDEX ix_output_series_1 ON output_series (owner_user_id,created_at,id);
CREATE INDEX ix_output_series_2 ON output_series (owner_user_id);
CREATE INDEX ix_output_series_3 ON output_series (run_id,owner_user_id);
CREATE INDEX ix_output_series_4 ON output_series (task_id,owner_user_id);
CREATE INDEX ix_output_series_5 ON output_series (current_checkpoint_id,owner_user_id);
CREATE INDEX ix_output_series_6 ON output_series (task_id,config_version,owner_user_id);
CREATE INDEX ix_output_generations_1 ON output_generations (owner_user_id,created_at,id);
CREATE INDEX ix_output_generations_2 ON output_generations (owner_user_id);
CREATE INDEX ix_output_generations_3 ON output_generations (invocation_id,owner_user_id);
CREATE INDEX ix_output_generations_4 ON output_generations (output_series_id,owner_user_id);
CREATE INDEX ix_output_generations_5 ON output_generations (snapshot_ref,owner_user_id);
CREATE INDEX ix_output_batches_1 ON output_batches (owner_user_id,created_at,id);
CREATE INDEX ix_output_batches_2 ON output_batches (owner_user_id);
CREATE INDEX ix_output_batches_3 ON output_batches (output_series_id,owner_user_id);
CREATE INDEX ix_output_batches_4 ON output_batches (invocation_id,owner_user_id);
CREATE INDEX ix_output_batches_5 ON output_batches (emission_id,owner_user_id);
CREATE INDEX ix_output_batches_6 ON output_batches (producer_error_ref,owner_user_id);
CREATE INDEX ix_output_uploads_1 ON output_uploads (owner_user_id,created_at,id);
CREATE INDEX ix_output_uploads_2 ON output_uploads (owner_user_id);
CREATE INDEX ix_output_uploads_3 ON output_uploads (output_series_id,owner_user_id);
CREATE INDEX ix_output_uploads_4 ON output_uploads (batch_id,owner_user_id);
CREATE INDEX ix_output_uploads_5 ON output_uploads (invocation_id,owner_user_id);
CREATE INDEX ix_output_uploads_6 ON output_uploads (object_id,owner_user_id);
CREATE INDEX ix_output_upload_parts_1 ON output_upload_parts (owner_user_id,created_at,id);
CREATE INDEX ix_output_upload_parts_2 ON output_upload_parts (owner_user_id);
CREATE INDEX ix_output_upload_parts_3 ON output_upload_parts (upload_id,owner_user_id);
CREATE INDEX ix_script_outputs_1 ON script_outputs (expires_at,id) WHERE deleted_at IS NULL;
CREATE INDEX ix_script_outputs_2 ON script_outputs (owner_user_id,created_at,id);
CREATE INDEX ix_script_outputs_3 ON script_outputs (owner_user_id);
CREATE INDEX ix_script_outputs_4 ON script_outputs (batch_id,owner_user_id);
CREATE INDEX ix_script_outputs_5 ON script_outputs (payload_id,owner_user_id);
CREATE INDEX ix_script_outputs_6 ON script_outputs (upload_id,owner_user_id);
CREATE INDEX ix_script_outputs_7 ON script_outputs (object_id,owner_user_id);
CREATE INDEX ix_output_dependencies_1 ON output_dependencies (owner_user_id,created_at,id);
CREATE INDEX ix_output_dependencies_2 ON output_dependencies (owner_user_id);
CREATE INDEX ix_output_dependencies_3 ON output_dependencies (message_output_id,owner_user_id);
CREATE INDEX ix_output_dependencies_4 ON output_dependencies (attachment_output_id,owner_user_id);
CREATE INDEX ix_result_output_refs_1 ON result_output_refs (owner_user_id,created_at,id);
CREATE INDEX ix_result_output_refs_2 ON result_output_refs (owner_user_id);
CREATE INDEX ix_result_output_refs_3 ON result_output_refs (result_id,owner_user_id);
CREATE INDEX ix_result_output_refs_4 ON result_output_refs (output_id,owner_user_id);
CREATE INDEX ix_checkpoints_1 ON checkpoints (owner_user_id,created_at,id);
CREATE INDEX ix_checkpoints_2 ON checkpoints (owner_user_id);
CREATE INDEX ix_checkpoints_3 ON checkpoints (output_series_id,owner_user_id);
CREATE INDEX ix_checkpoints_4 ON checkpoints (task_id,owner_user_id);
CREATE INDEX ix_checkpoints_5 ON checkpoints (script_version_id);
CREATE INDEX ix_checkpoints_6 ON checkpoints (payload_id,owner_user_id);
CREATE INDEX ix_checkpoints_7 ON checkpoints (batch_id,owner_user_id);
CREATE INDEX ix_checkpoints_8 ON checkpoints (task_id,config_version,owner_user_id);
CREATE INDEX ix_script_events_1 ON script_events (owner_user_id,created_at,id);
CREATE INDEX ix_script_events_2 ON script_events (owner_user_id);
CREATE INDEX ix_script_events_3 ON script_events (invocation_id,owner_user_id);
CREATE INDEX ix_script_events_4 ON script_events (script_version_id);
CREATE INDEX ix_script_events_5 ON script_events (data_ref,owner_user_id);
CREATE INDEX ix_notification_bindings_1 ON notification_bindings (owner_user_id,created_at,id);
CREATE INDEX ix_notification_bindings_2 ON notification_bindings (owner_user_id);
CREATE INDEX ix_notification_bindings_3 ON notification_bindings (target_payload_id,owner_user_id);
CREATE INDEX ix_notification_subscriptions_1 ON notification_subscriptions (owner_user_id,created_at,id);
CREATE INDEX ix_notification_subscriptions_2 ON notification_subscriptions (owner_user_id);
CREATE INDEX ix_notification_subscriptions_3 ON notification_subscriptions (binding_id,owner_user_id);
CREATE INDEX ix_notification_cooldowns_1 ON notification_cooldowns (owner_user_id,created_at,id);
CREATE INDEX ix_notification_cooldowns_2 ON notification_cooldowns (owner_user_id);
CREATE INDEX ix_notification_cooldowns_3 ON notification_cooldowns (subscription_id,owner_user_id);
CREATE INDEX ix_notifications_1 ON notifications (owner_user_id,created_at,id);
CREATE INDEX ix_notifications_2 ON notifications (owner_user_id);
CREATE INDEX ix_notifications_3 ON notifications (event_id);
CREATE INDEX ix_notifications_4 ON notifications (message_output_id,owner_user_id);
CREATE INDEX ix_notifications_5 ON notifications (content_ref,owner_user_id);
CREATE INDEX ix_notification_deliveries_1 ON notification_deliveries (status,next_attempt_at,id);
CREATE INDEX ix_notification_deliveries_2 ON notification_deliveries (owner_user_id,created_at,id);
CREATE INDEX ix_notification_deliveries_3 ON notification_deliveries (owner_user_id);
CREATE INDEX ix_notification_deliveries_4 ON notification_deliveries (notification_id,owner_user_id);
CREATE INDEX ix_notification_deliveries_5 ON notification_deliveries (message_output_id,owner_user_id);
CREATE INDEX ix_notification_deliveries_6 ON notification_deliveries (channel_binding_id,owner_user_id);
CREATE INDEX ix_delivery_attempts_1 ON delivery_attempts (owner_user_id,created_at,id);
CREATE INDEX ix_delivery_attempts_2 ON delivery_attempts (owner_user_id);
CREATE INDEX ix_delivery_attempts_3 ON delivery_attempts (delivery_id,owner_user_id);
CREATE INDEX ix_attractions_1 ON attractions (city_id);
CREATE INDEX ix_channels_1 ON channels (attraction_id);
CREATE INDEX ix_channels_2 ON channels (current_rule_version_id);
CREATE INDEX ix_channel_rule_versions_1 ON channel_rule_versions (channel_id);
CREATE INDEX ix_attraction_service_links_1 ON attraction_service_links (owner_user_id,created_at,id);
CREATE INDEX ix_attraction_service_links_2 ON attraction_service_links (owner_user_id);
CREATE INDEX ix_attraction_service_links_3 ON attraction_service_links (attraction_id);
CREATE INDEX ix_attraction_service_links_4 ON attraction_service_links (service_id,owner_user_id);
CREATE INDEX ix_attraction_service_links_5 ON attraction_service_links (channel_id);
CREATE INDEX ix_channel_accounts_1 ON channel_accounts (owner_user_id,created_at,id);
CREATE INDEX ix_channel_accounts_2 ON channel_accounts (owner_user_id);
CREATE INDEX ix_channel_accounts_3 ON channel_accounts (channel_id);
CREATE INDEX ix_channel_accounts_4 ON channel_accounts (credential_version_id,owner_user_id);
CREATE INDEX ix_travelers_1 ON travelers (owner_user_id,created_at,id);
CREATE INDEX ix_travelers_2 ON travelers (owner_user_id);
CREATE INDEX ix_travelers_3 ON travelers (current_version_id,owner_user_id);
CREATE INDEX ix_traveler_versions_1 ON traveler_versions (owner_user_id,created_at,id);
CREATE INDEX ix_traveler_versions_2 ON traveler_versions (owner_user_id);
CREATE INDEX ix_traveler_versions_3 ON traveler_versions (traveler_id,owner_user_id);
CREATE INDEX ix_traveler_versions_4 ON traveler_versions (payload_id,owner_user_id);
CREATE INDEX ix_booking_authorizations_1 ON booking_authorizations (owner_user_id,created_at,id);
CREATE INDEX ix_booking_authorizations_2 ON booking_authorizations (owner_user_id);
CREATE INDEX ix_booking_authorizations_3 ON booking_authorizations (task_id,owner_user_id);
CREATE INDEX ix_booking_authorizations_4 ON booking_authorizations (channel_account_id,owner_user_id);
CREATE INDEX ix_booking_authorizations_5 ON booking_authorizations (channel_rule_version_id);
CREATE INDEX ix_booking_authorizations_6 ON booking_authorizations (attraction_id);
CREATE INDEX ix_booking_authorization_travelers_1 ON booking_authorization_travelers (owner_user_id,created_at,id);
CREATE INDEX ix_booking_authorization_travelers_2 ON booking_authorization_travelers (owner_user_id);
CREATE INDEX ix_booking_authorization_travelers_3 ON booking_authorization_travelers (booking_authorization_id,owner_user_id);
CREATE INDEX ix_booking_authorization_travelers_4 ON booking_authorization_travelers (traveler_version_id,owner_user_id);
CREATE INDEX ix_booking_targets_1 ON booking_targets (owner_user_id,created_at,id);
CREATE INDEX ix_booking_targets_2 ON booking_targets (owner_user_id);
CREATE INDEX ix_booking_targets_3 ON booking_targets (channel_account_id,owner_user_id);
CREATE INDEX ix_booking_targets_4 ON booking_targets (target_snapshot_ref,owner_user_id);
CREATE INDEX ix_booking_targets_5 ON booking_targets (active_operation_id,owner_user_id);
CREATE UNIQUE INDEX ix_booking_operations_1 ON booking_operations (target_id) WHERE status IN ('READY','SUBMITTING','CONFIRMED','UNKNOWN');
CREATE INDEX ix_booking_operations_2 ON booking_operations (status,next_reconcile_at,id);
CREATE INDEX ix_booking_operations_3 ON booking_operations (owner_user_id,created_at,id);
CREATE INDEX ix_booking_operations_4 ON booking_operations (owner_user_id);
CREATE INDEX ix_booking_operations_5 ON booking_operations (target_id,owner_user_id);
CREATE INDEX ix_booking_operations_6 ON booking_operations (authorization_id,owner_user_id);
CREATE INDEX ix_booking_operations_7 ON booking_operations (invocation_id,owner_user_id);
CREATE INDEX ix_booking_operations_8 ON booking_operations (evidence_ref,owner_user_id);
CREATE INDEX ix_booking_orders_1 ON booking_orders (owner_user_id,created_at,id);
CREATE INDEX ix_booking_orders_2 ON booking_orders (owner_user_id);
CREATE INDEX ix_booking_orders_3 ON booking_orders (operation_id,owner_user_id);
CREATE INDEX ix_booking_orders_4 ON booking_orders (service_order_id,owner_user_id);
CREATE INDEX ix_booking_orders_5 ON booking_orders (channel_id);
CREATE INDEX ix_booking_orders_6 ON booking_orders (channel_account_id,owner_user_id);
CREATE INDEX ix_booking_orders_7 ON booking_orders (order_payload_id,owner_user_id);
CREATE INDEX ix_inventory_observations_1 ON inventory_observations (owner_user_id,channel_id,visit_date,time_slot,ticket_type,observed_at);
CREATE INDEX ix_inventory_observations_2 ON inventory_observations (owner_user_id,created_at,id);
CREATE INDEX ix_inventory_observations_3 ON inventory_observations (owner_user_id);
CREATE INDEX ix_inventory_observations_4 ON inventory_observations (channel_id);
CREATE INDEX ix_inventory_observations_5 ON inventory_observations (invocation_id,owner_user_id);
CREATE INDEX ix_outbox_events_1 ON outbox_events (next_attempt_at,id) WHERE delivered_at IS NULL;
CREATE INDEX ix_outbox_events_2 ON outbox_events (owner_user_id);
CREATE INDEX ix_consumer_receipts_1 ON consumer_receipts (event_id);
CREATE INDEX ix_audit_events_1 ON audit_events (subject_owner_user_id,created_at,id);
CREATE INDEX ix_audit_events_2 ON audit_events (target_type,target_id,created_at);
CREATE INDEX ix_audit_events_3 ON audit_events (actor_user_id);
CREATE INDEX ix_audit_events_4 ON audit_events (subject_owner_user_id);
CREATE INDEX ix_idempotency_records_1 ON idempotency_records (expires_at,id);
CREATE INDEX ix_idempotency_records_2 ON idempotency_records (owner_user_id,created_at,id);
CREATE INDEX ix_idempotency_records_3 ON idempotency_records (owner_user_id);
CREATE INDEX ix_idempotency_records_4 ON idempotency_records (response_payload_id,owner_user_id);
CREATE INDEX ix_operation_jobs_1 ON operation_jobs (status,next_attempt_at,id);
CREATE INDEX ix_operation_jobs_2 ON operation_jobs (owner_user_id,created_at,id);
CREATE INDEX ix_operation_jobs_3 ON operation_jobs (owner_user_id);
CREATE INDEX ix_operation_jobs_4 ON operation_jobs (input_ref,owner_user_id);
CREATE INDEX ix_operation_jobs_5 ON operation_jobs (result_ref,owner_user_id);
CREATE INDEX ix_platform_features_1 ON platform_features (updated_by);
CREATE INDEX ix_deletion_requests_1 ON deletion_requests (owner_user_id,scope_type,scope_id);
CREATE INDEX ix_deletion_requests_2 ON deletion_requests (status,created_at,id);
CREATE INDEX ix_deletion_requests_3 ON deletion_requests (owner_user_id,created_at,id);
CREATE INDEX ix_deletion_requests_4 ON deletion_requests (owner_user_id);
CREATE INDEX ix_deletion_steps_1 ON deletion_steps (status,next_attempt_at,id);
CREATE INDEX ix_deletion_steps_2 ON deletion_steps (owner_user_id,created_at,id);
CREATE INDEX ix_deletion_steps_3 ON deletion_steps (owner_user_id);
CREATE INDEX ix_deletion_steps_4 ON deletion_steps (request_id,owner_user_id);
CREATE INDEX ix_retention_holds_1 ON retention_holds (resource_type,resource_id) WHERE released_at IS NULL;
CREATE INDEX ix_retention_holds_2 ON retention_holds (expires_at) WHERE released_at IS NULL;
CREATE INDEX ix_retention_holds_3 ON retention_holds (owner_user_id,created_at,id);
CREATE INDEX ix_retention_holds_4 ON retention_holds (owner_user_id);
CREATE INDEX ix_retention_holds_5 ON retention_holds (authorized_by);
CREATE INDEX ix_recovery_drills_1 ON recovery_drills (owner_user_id,created_at,id);
CREATE INDEX ix_recovery_drills_2 ON recovery_drills (owner_user_id);
CREATE INDEX ix_recovery_drills_3 ON recovery_drills (backup_id);
CREATE INDEX ix_node_bootstrap_tokens_1 ON node_bootstrap_tokens (node_id);
CREATE INDEX ix_node_bootstrap_tokens_2 ON node_bootstrap_tokens (issued_by);
CREATE INDEX ix_node_certificates_1 ON node_certificates (node_id);
CREATE INDEX ix_agent_sessions_1 ON agent_sessions (owner_user_id,created_at,id);
CREATE INDEX ix_agent_sessions_2 ON agent_sessions (owner_user_id);
CREATE INDEX ix_agent_sessions_3 ON agent_sessions (attempt_id,owner_user_id);
CREATE INDEX ix_agent_message_receipts_1 ON agent_message_receipts (owner_user_id,created_at,id);
CREATE INDEX ix_agent_message_receipts_2 ON agent_message_receipts (owner_user_id);
CREATE INDEX ix_agent_message_receipts_3 ON agent_message_receipts (agent_session_id,owner_user_id);
CREATE INDEX ix_log_segments_1 ON log_segments (owner_user_id,run_id,started_at,id);
CREATE INDEX ix_log_segments_2 ON log_segments (owner_user_id,build_id,started_at,id);
CREATE INDEX ix_log_segments_3 ON log_segments (index_status,created_at,id);
CREATE INDEX ix_log_segments_4 ON log_segments (expires_at,id);
CREATE INDEX ix_log_segments_5 ON log_segments (owner_user_id,created_at,id);
CREATE INDEX ix_log_segments_6 ON log_segments (owner_user_id);
CREATE INDEX ix_log_segments_7 ON log_segments (run_id,owner_user_id);
CREATE INDEX ix_log_segments_8 ON log_segments (build_id,owner_user_id);
CREATE INDEX ix_log_segments_9 ON log_segments (object_id,owner_user_id);
CREATE INDEX ix_platform_log_segments_1 ON platform_log_segments (started_at,id);
CREATE INDEX ix_platform_log_segments_2 ON platform_log_segments (expires_at,id);
CREATE INDEX ix_log_stream_gaps_1 ON log_stream_gaps (owner_user_id,created_at,id);
CREATE INDEX ix_log_stream_gaps_2 ON log_stream_gaps (owner_user_id);
CREATE INDEX ix_log_stream_gaps_3 ON log_stream_gaps (run_id,owner_user_id);
CREATE INDEX ix_log_query_jobs_1 ON log_query_jobs (status,created_at,id);
CREATE INDEX ix_log_query_jobs_2 ON log_query_jobs (owner_user_id,created_at,id);
CREATE INDEX ix_log_query_jobs_3 ON log_query_jobs (owner_user_id);
CREATE INDEX ix_log_query_jobs_4 ON log_query_jobs (access_session_id,owner_user_id);
CREATE INDEX ix_log_query_jobs_5 ON log_query_jobs (result_object_id,owner_user_id);
CREATE INDEX ix_log_export_jobs_1 ON log_export_jobs (status,created_at,id);
CREATE INDEX ix_log_export_jobs_2 ON log_export_jobs (owner_user_id,created_at,id);
CREATE INDEX ix_log_export_jobs_3 ON log_export_jobs (owner_user_id);
CREATE INDEX ix_log_export_jobs_4 ON log_export_jobs (access_session_id,owner_user_id);
CREATE INDEX ix_log_export_jobs_5 ON log_export_jobs (object_id,owner_user_id);
CREATE INDEX ix_observability_policies_1 ON observability_policies (created_by);
CREATE UNIQUE INDEX ix_alert_instances_1 ON alert_instances (rule_id,fingerprint) WHERE status IN ('FIRING','ACKNOWLEDGED');
CREATE INDEX ix_alert_instances_2 ON alert_instances (rule_id);
CREATE INDEX ix_alert_instances_3 ON alert_instances (acknowledged_by);
CREATE INDEX ix_alert_events_1 ON alert_events (instance_id);
CREATE INDEX ix_alert_events_2 ON alert_events (actor_user_id);
CREATE INDEX ix_alert_silences_1 ON alert_silences (actor_user_id);
CREATE INDEX ix_alert_deliveries_1 ON alert_deliveries (status,next_attempt_at,id);
CREATE INDEX ix_alert_deliveries_2 ON alert_deliveries (instance_id);

CREATE FUNCTION touch_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_IDENTITY' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW)->'owner_user_id') IS DISTINCT FROM (to_jsonb(OLD)->'owner_user_id') THEN
    RAISE EXCEPTION 'IMMUTABLE_OWNER' USING ERRCODE='23514';
  END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY:%',TG_TABLE_NAME USING ERRCODE='23514';
END $$;
CREATE FUNCTION freeze_columns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW)->col) IS DISTINCT FROM (to_jsonb(OLD)->col) THEN
      RAISE EXCEPTION 'IMMUTABLE_FIELD:%.%',TG_TABLE_NAME,col USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE FUNCTION guard_script_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content_status <> 'DRAFT' AND
     (NEW.script_id,NEW.version,NEW.source_object_id,NEW.manifest,NEW.content_hash,NEW.schema_digest,NEW.sealed_at)
       IS DISTINCT FROM
     (OLD.script_id,OLD.version,OLD.source_object_id,OLD.manifest,OLD.content_hash,OLD.schema_digest,OLD.sealed_at) THEN
    RAISE EXCEPTION 'SEALED_VERSION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF OLD.build_artifact_id IS NOT NULL AND NEW.build_artifact_id IS DISTINCT FROM OLD.build_artifact_id THEN
    RAISE EXCEPTION 'ARTIFACT_BINDING_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF NEW.content_status<>OLD.content_status AND NOT (
    (OLD.content_status='DRAFT' AND NEW.content_status IN ('SEALED','REVOKED')) OR
    (OLD.content_status='SEALED' AND NEW.content_status IN ('READY','REVOKED')) OR
    (OLD.content_status='READY' AND NEW.content_status IN ('RETIRED','REVOKED')) OR
    (OLD.content_status='RETIRED' AND NEW.content_status='REVOKED')) THEN
    RAISE EXCEPTION 'INVALID_VERSION_TRANSITION' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER z_revision BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON private_payloads FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON auth_challenges FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON recovery_intakes FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON account_recovery_cases FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON management_role_grants FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON management_guard FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON data_access_sessions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON personal_api_tokens FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON action_previews FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON storage_objects FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON storage_objects FOR EACH ROW EXECUTE FUNCTION freeze_columns('bucket_alias','object_key');
CREATE TRIGGER z_revision BEFORE UPDATE ON script_uploads FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON scripts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON script_versions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON script_versions FOR EACH ROW EXECUTE FUNCTION guard_script_version();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON script_actions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON script_imports FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON import_attempts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON version_adapter_specs FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON runtime_images FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON builds FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON artifacts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON version_test_evidence FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON deployments FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON deployments FOR EACH ROW EXECUTE FUNCTION freeze_columns('script_version_id','artifact_id','resource_profile_id','runtime_snapshot');
CREATE TRIGGER z_revision BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON node_commands FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON resource_profiles FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON resource_profiles FOR EACH ROW EXECUTE FUNCTION freeze_columns('name','version','limits');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON runtime_policies FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON network_policies FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON credential_versions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON credential_versions FOR EACH ROW EXECUTE FUNCTION freeze_columns('credential_id','version','payload_id','allowed_targets');
CREATE TRIGGER z_revision BEFORE UPDATE ON execution_authorizations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON authorization_credentials FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON quota_accounts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON quota_reservations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON resource_usage_segments FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON publisher_profiles FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON payout_profiles FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON payout_profiles FOR EACH ROW EXECUTE FUNCTION freeze_columns('version','provider','merchant_account','account_payload_id','masked_account');
CREATE TRIGGER z_revision BEFORE UPDATE ON service_categories FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON service_releases FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON commerce_policies FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON price_plans FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON price_plans FOR EACH ROW EXECUTE FUNCTION freeze_columns('service_release_id','version','commerce_policy_id','billing_mode','unit_amount_minor','currency','use_limit','validity_seconds');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON quotes FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION freeze_columns('publisher_id','quote_id','service_release_id','price_plan_id','quantity','amount_minor','currency','terms_snapshot','terms_digest','payment_deadline');
CREATE TRIGGER z_revision BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION freeze_columns('order_id','attempt_no','provider','merchant_account','provider_request_id','amount_minor','currency');
CREATE TRIGGER z_revision BEFORE UPDATE ON provider_receipts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION freeze_columns('payment_id','order_id','receipt_id','provider','merchant_account','provider_transaction_id','amount_minor','currency','received_at');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION freeze_columns('order_id','service_release_id','use_limit','valid_until');
CREATE TRIGGER z_revision BEFORE UPDATE ON usage_reservations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON usage_reservations FOR EACH ROW EXECUTE FUNCTION freeze_columns('entitlement_id','run_id');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON fulfillment_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON service_disputes FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION freeze_columns('order_id','payment_id','payment_transaction_id','request_key','amount_minor','currency');
CREATE TRIGGER z_revision BEFORE UPDATE ON refund_attempts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON refund_attempts FOR EACH ROW EXECUTE FUNCTION freeze_columns('refund_id','attempt_no','provider_request_id');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON refund_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON publisher_balances FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON settlement_batches FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON settlement_lines FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON settlement_lines FOR EACH ROW EXECUTE FUNCTION freeze_columns('batch_id','ledger_entry_id','amount_minor');
CREATE TRIGGER z_revision BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION freeze_columns('batch_id','payout_profile_id','amount_minor','currency','provider_request_id');
CREATE TRIGGER z_revision BEFORE UPDATE ON payout_attempts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON payout_attempts FOR EACH ROW EXECUTE FUNCTION freeze_columns('payout_id','attempt_no','provider_request_id');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON payout_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON financial_reconciliations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION freeze_columns('execution_context');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON task_config_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON task_display_preferences FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION freeze_columns('task_id','config_version','script_version_id','action','original_input_ref','schema_digest','trigger_kind','trigger_key','scheduled_at','entitlement_id','supersedes_run_id','run_mode');
CREATE TRIGGER z_revision BEFORE UPDATE ON concurrency_locks FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON task_holds FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON continuations FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION freeze_columns('run_id','attempt_no','continuation_number','node_id','lease_generation','requested_execution_mode','runtime_policy_id','retry_of');
CREATE TRIGGER z_revision BEFORE UPDATE ON execution_leases FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON hook_invocations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON hook_invocations FOR EACH ROW EXECUTE FUNCTION freeze_columns('attempt_id','script_version_id','action','purpose','input_ref','schema_digest');
CREATE TRIGGER z_revision BEFORE UPDATE ON invocation_permissions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON execution_results FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON pending_actions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON external_requests FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON hook_observations FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON run_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON verification_bindings FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON verification_jobs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON resolution_records FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON late_evidence FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON environment_leases FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON output_series FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON output_series FOR EACH ROW EXECUTE FUNCTION freeze_columns('run_id','task_id','config_version','scope');
CREATE TRIGGER z_revision BEFORE UPDATE ON output_generations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON output_generations FOR EACH ROW EXECUTE FUNCTION freeze_columns('invocation_id','output_series_id','sequence','producer_kind','reason','snapshot_ref');
CREATE TRIGGER z_revision BEFORE UPDATE ON output_batches FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON output_batches FOR EACH ROW EXECUTE FUNCTION freeze_columns('output_series_id','batch_key','invocation_id','emission_id','phase');
CREATE TRIGGER z_revision BEFORE UPDATE ON output_uploads FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON output_uploads FOR EACH ROW EXECUTE FUNCTION freeze_columns('output_series_id','batch_id','invocation_id','phase','upload_key','expected_size','expected_sha256');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON output_upload_parts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON script_outputs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON output_dependencies FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON result_output_refs FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON checkpoints FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON script_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON notification_bindings FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON notification_bindings FOR EACH ROW EXECUTE FUNCTION freeze_columns('channel','target_payload_id');
CREATE TRIGGER z_revision BEFORE UPDATE ON notification_subscriptions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON notification_cooldowns FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION freeze_columns('notification_id','message_output_id','channel_binding_id','delivery_key');
CREATE TRIGGER z_revision BEFORE UPDATE ON delivery_attempts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON cities FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON attractions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON channel_rule_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON connector_versions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON connector_versions FOR EACH ROW EXECUTE FUNCTION freeze_columns('key','version','code_digest','capabilities');
CREATE TRIGGER z_revision BEFORE UPDATE ON attraction_service_links FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON channel_accounts FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON travelers FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON traveler_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON booking_authorizations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON booking_authorizations FOR EACH ROW EXECUTE FUNCTION freeze_columns('channel_account_id','channel_rule_version_id','attraction_id','visit_date','ticket_type','allowed_slots','allow_alternatives','allow_partial','max_ticket_amount_minor','expires_at');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON booking_authorization_travelers FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON booking_targets FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON booking_operations FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON booking_orders FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON inventory_observations FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION freeze_columns('owner_user_id','aggregate_type','aggregate_id','aggregate_revision','event_type','payload','schema_version','request_id','occurred_at');
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON consumer_receipts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON idempotency_records FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON operation_jobs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON platform_features FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON deletion_requests FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON deletion_steps FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON retention_holds FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON backup_manifests FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON recovery_drills FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON node_bootstrap_tokens FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON node_certificates FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON agent_message_receipts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON log_segments FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON platform_log_segments FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON log_stream_gaps FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON log_query_jobs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON log_export_jobs FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON observability_policies FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER frozen BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION freeze_columns('rule_key','version','expression','severity','for_seconds','receiver_policy');
CREATE TRIGGER z_revision BEFORE UPDATE ON alert_instances FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON alert_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER z_revision BEFORE UPDATE ON alert_silences FOR EACH ROW EXECUTE FUNCTION touch_revision();
CREATE TRIGGER z_revision BEFORE UPDATE ON alert_deliveries FOR EACH ROW EXECUTE FUNCTION touch_revision();

CREATE FUNCTION guard_aggregate_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid; b uuid; c uuid; x text; y text; s text;
BEGIN
  CASE TG_TABLE_NAME
  WHEN 'task_config_versions' THEN
    IF NEW.execution_context<>'PAID_SERVICE' AND NOT EXISTS (SELECT 1 FROM script_versions WHERE id=NEW.script_version_id AND owner_user_id=NEW.owner_user_id) THEN
      RAISE EXCEPTION 'PRIVATE_SCRIPT_OWNER_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tasks t JOIN execution_authorizations au ON au.id=NEW.authorization_id
      WHERE t.id=NEW.task_id AND t.execution_context=NEW.execution_context
      AND au.script_version_id=NEW.script_version_id AND au.action=NEW.action) THEN
      RAISE EXCEPTION 'CONFIG_AUTHORIZATION_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF NEW.execution_context='PAID_SERVICE' AND NOT EXISTS (
      SELECT 1 FROM entitlements e JOIN service_orders o ON o.id=e.order_id
      JOIN service_releases r ON r.id=o.service_release_id
      WHERE e.id=NEW.entitlement_id AND o.id=NEW.service_order_id AND r.id=NEW.service_release_id
      AND r.script_version_id=NEW.script_version_id AND r.action=NEW.action) THEN
      RAISE EXCEPTION 'PAID_CONFIG_MISMATCH' USING ERRCODE='23514';
    END IF;
  WHEN 'output_series' THEN
    IF NOT EXISTS (SELECT 1 FROM runs WHERE id=NEW.run_id AND task_id=NEW.task_id AND config_version=NEW.config_version) THEN
      RAISE EXCEPTION 'SERIES_RUN_MISMATCH' USING ERRCODE='23514';
    END IF;
  WHEN 'output_generations' THEN
    SELECT at.run_id INTO a FROM hook_invocations i JOIN attempts at ON at.id=i.attempt_id WHERE i.id=NEW.invocation_id;
    SELECT run_id INTO b FROM output_series WHERE id=NEW.output_series_id;
    IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'EMISSION_RUN_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'output_batches' THEN
    IF NOT EXISTS (SELECT 1 FROM output_generations WHERE id=NEW.emission_id AND invocation_id=NEW.invocation_id AND output_series_id=NEW.output_series_id) THEN
      RAISE EXCEPTION 'BATCH_EMISSION_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.commit_status='COMMITTED' AND
      (NEW.output_series_id,NEW.batch_key,NEW.invocation_id,NEW.emission_id,NEW.phase,NEW.payload_digest,NEW.producer_outcome,NEW.producer_error_ref,NEW.committed_at,NEW.checkpoint_revision,NEW.commit_status)
      IS DISTINCT FROM
      (OLD.output_series_id,OLD.batch_key,OLD.invocation_id,OLD.emission_id,OLD.phase,OLD.payload_digest,OLD.producer_outcome,OLD.producer_error_ref,OLD.committed_at,OLD.checkpoint_revision,OLD.commit_status) THEN
      RAISE EXCEPTION 'COMMITTED_BATCH_IMMUTABLE' USING ERRCODE='23514';
    END IF;
  WHEN 'output_uploads' THEN
    IF NOT EXISTS (SELECT 1 FROM output_batches WHERE id=NEW.batch_id AND output_series_id=NEW.output_series_id AND invocation_id=NEW.invocation_id
      AND phase=CASE NEW.phase WHEN 'OUTPUT' THEN 'OUTPUT_HOOK' ELSE 'ACTION' END) THEN
      RAISE EXCEPTION 'UPLOAD_SCOPE_MISMATCH' USING ERRCODE='23514';
    END IF;
  WHEN 'script_outputs' THEN
    IF NEW.upload_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM output_uploads WHERE id=NEW.upload_id AND batch_id=NEW.batch_id) THEN
      RAISE EXCEPTION 'OUTPUT_UPLOAD_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM output_batches WHERE id=OLD.batch_id AND commit_status='COMMITTED')
      AND (NEW.batch_id,NEW.output_key,NEW.kind,NEW.payload_id,NEW.upload_id,NEW.content_digest,NEW.file_name,NEW.media_type,NEW.size_bytes)
        IS DISTINCT FROM (OLD.batch_id,OLD.output_key,OLD.kind,OLD.payload_id,OLD.upload_id,OLD.content_digest,OLD.file_name,OLD.media_type,OLD.size_bytes) THEN
      RAISE EXCEPTION 'PUBLISHED_OUTPUT_IMMUTABLE' USING ERRCODE='23514';
    END IF;
  WHEN 'output_dependencies' THEN
    SELECT batch_id,kind INTO a,x FROM script_outputs WHERE id=NEW.message_output_id;
    SELECT batch_id,kind INTO b,y FROM script_outputs WHERE id=NEW.attachment_output_id;
    IF x IS DISTINCT FROM 'message' OR y IS NULL OR y='message' THEN
      RAISE EXCEPTION 'INVALID_ATTACHMENT_KIND' USING ERRCODE='23514';
    END IF;
    IF a<>b AND NOT EXISTS (SELECT 1 FROM output_batches mb JOIN output_batches ab ON ab.output_series_id=mb.output_series_id
      WHERE mb.id=a AND ab.id=b AND ab.commit_status='COMMITTED') THEN
      RAISE EXCEPTION 'ATTACHMENT_SERIES_MISMATCH' USING ERRCODE='23514';
    END IF;
  WHEN 'checkpoints' THEN
    IF NOT EXISTS (SELECT 1 FROM output_series sr JOIN runs r ON r.id=sr.run_id
      WHERE sr.id=NEW.output_series_id AND sr.task_id=NEW.task_id AND sr.config_version=NEW.config_version
      AND r.script_version_id=NEW.script_version_id AND r.action=NEW.action) THEN
      RAISE EXCEPTION 'CHECKPOINT_SCOPE_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM output_batches WHERE id=NEW.batch_id AND output_series_id=NEW.output_series_id) THEN
      RAISE EXCEPTION 'CHECKPOINT_BATCH_MISMATCH' USING ERRCODE='23514';
    END IF;
  WHEN 'quotes' THEN
    IF NOT EXISTS (SELECT 1 FROM price_plans p JOIN service_releases r ON r.id=p.service_release_id
      WHERE p.id=NEW.price_plan_id AND r.id=NEW.service_release_id AND p.currency=NEW.currency AND p.unit_amount_minor=NEW.amount_minor
      AND r.owner_user_id=NEW.publisher_id) THEN RAISE EXCEPTION 'QUOTE_PRICE_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'payments' THEN
    IF NOT EXISTS (SELECT 1 FROM service_orders WHERE id=NEW.order_id AND amount_minor=NEW.amount_minor AND currency=NEW.currency) THEN
      RAISE EXCEPTION 'PAYMENT_ORDER_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'entitlements' THEN
    IF NOT EXISTS (SELECT 1 FROM service_orders WHERE id=NEW.order_id AND service_release_id=NEW.service_release_id) THEN
      RAISE EXCEPTION 'ENTITLEMENT_RELEASE_MISMATCH' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND OLD.used_count=1 AND NEW.used_count<>1 THEN
      RAISE EXCEPTION 'CONSUMED_USAGE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  WHEN 'usage_reservations' THEN
    IF NOT EXISTS (SELECT 1 FROM runs WHERE id=NEW.run_id AND entitlement_id=NEW.entitlement_id) THEN
      RAISE EXCEPTION 'USAGE_RUN_MISMATCH' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND OLD.status='COMMITTED' AND NEW.status<>'COMMITTED' THEN
      RAISE EXCEPTION 'COMMITTED_USAGE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  WHEN 'runs' THEN
    IF NOT EXISTS (SELECT 1 FROM task_config_versions WHERE task_id=NEW.task_id AND version=NEW.config_version
      AND entitlement_id IS NOT DISTINCT FROM NEW.entitlement_id) THEN
      RAISE EXCEPTION 'RUN_ENTITLEMENT_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'service_orders' THEN
    IF NOT EXISTS (SELECT 1 FROM quotes q WHERE q.id=NEW.quote_id AND q.service_release_id=NEW.service_release_id
      AND q.price_plan_id=NEW.price_plan_id AND q.amount_minor=NEW.amount_minor AND q.currency=NEW.currency AND q.snapshot_digest=NEW.terms_digest) THEN
      RAISE EXCEPTION 'ORDER_QUOTE_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF NEW.funding_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_transactions pt
      WHERE pt.id=NEW.funding_transaction_id AND pt.payment_id=NEW.funding_payment_id AND pt.order_id=NEW.id
      AND pt.currency=NEW.currency AND pt.amount_minor=NEW.amount_minor AND pt.allocation='FUNDING') THEN
      RAISE EXCEPTION 'ORDER_FUNDING_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.funding_transaction_id IS NOT NULL AND
      (NEW.funding_transaction_id,NEW.funding_payment_id) IS DISTINCT FROM (OLD.funding_transaction_id,OLD.funding_payment_id) THEN
      RAISE EXCEPTION 'FUNDING_BINDING_IMMUTABLE' USING ERRCODE='23514'; END IF;
  WHEN 'payment_transactions' THEN
    IF NOT EXISTS (SELECT 1 FROM payments p JOIN provider_receipts r ON r.id=NEW.receipt_id
      WHERE p.id=NEW.payment_id AND p.order_id=NEW.order_id AND p.provider=NEW.provider AND p.merchant_account=NEW.merchant_account
      AND r.provider=NEW.provider AND r.merchant_account=NEW.merchant_account AND r.signature_valid) THEN
      RAISE EXCEPTION 'PAYMENT_FACT_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'refunds' THEN
    IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE id=NEW.payment_transaction_id AND payment_id=NEW.payment_id
      AND order_id=NEW.order_id AND currency=NEW.currency AND amount_minor>=NEW.amount_minor) THEN
      RAISE EXCEPTION 'REFUND_SOURCE_MISMATCH' USING ERRCODE='23514'; END IF;
  WHEN 'settlement_lines' THEN
    IF NOT EXISTS (SELECT 1 FROM ledger_entries e JOIN settlement_batches b ON b.id=NEW.batch_id
      WHERE e.id=NEW.ledger_entry_id AND e.publisher_id=NEW.owner_user_id AND e.currency=b.currency) THEN
      RAISE EXCEPTION 'SETTLEMENT_OWNER_MISMATCH' USING ERRCODE='23514'; END IF;
  ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON task_config_versions FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON output_series FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON output_generations FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON output_batches FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON output_uploads FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON script_outputs FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT ON output_dependencies FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT ON checkpoints FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON usage_reservations FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();
CREATE TRIGGER aggregate_links BEFORE INSERT OR UPDATE ON settlement_lines FOR EACH ROW EXECUTE FUNCTION guard_aggregate_links();

CREATE FUNCTION assert_balanced_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tx uuid; total_debit numeric; total_credit numeric; cnt bigint;
BEGIN
  IF TG_TABLE_NAME='ledger_transactions' THEN tx:=NEW.id; ELSE tx:=NEW.transaction_id; END IF;
  SELECT coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0),count(*) INTO total_debit,total_credit,cnt
    FROM ledger_entries WHERE transaction_id=tx;
  IF cnt<2 OR total_debit<=0 OR total_debit<>total_credit THEN
    RAISE EXCEPTION 'UNBALANCED_LEDGER:%',tx USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_header AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_transaction();
CREATE CONSTRAINT TRIGGER balanced_lines AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_transaction();
