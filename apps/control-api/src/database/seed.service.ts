import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { DatabaseService, SqlConnection } from "./database.service";

export const DEMO_ACCOUNTS = [
  { email: "consumer@example.invalid", name: "示例消费者", role: "USER" },
  { email: "publisher@example.invalid", name: "数据工坊", role: "PUBLISHER" },
  { email: "admin@example.invalid", name: "平台管理员", role: "ADMIN" },
];
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

async function insert(
  connection: SqlConnection,
  table: string,
  values: Record<string, unknown>,
) {
  const record = { id: randomUUID(), ...values };
  const columns = Object.keys(record);
  await connection.query(
    `INSERT INTO travel.${table} (${columns.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    Object.values(record),
  );
  return record.id;
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(private readonly database: DatabaseService) {}

  async onApplicationBootstrap() {
    if (process.env.DEV_SEED !== "true") return;
    const existing = await this.database.query(
      "SELECT id FROM travel.users WHERE email_normalized=$1",
      [DEMO_ACCOUNTS[0].email],
    );
    if (existing.rows.length) {
      await this.database.query(
        `UPDATE travel.management_role_grants g SET capabilities=array_append(g.capabilities,'runtime.observe'), revision=g.revision+1, updated_at=now()
         FROM travel.users u WHERE g.owner_user_id=u.id AND u.email_normalized=$1 AND g.reason='Local development seed'
         AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()) AND NOT ('runtime.observe'=ANY(g.capabilities))`,
        [DEMO_ACCOUNTS[2].email],
      );
      return;
    }
    await this.database.transaction(async (connection) => {
      const accounts: string[] = [];
      for (const account of DEMO_ACCOUNTS) {
        const id = await insert(connection, "users", {
          email_normalized: account.email,
          password_hash: hashPassword("TravelTools2026!"),
          display_name: account.name,
          status: "ACTIVE",
          verified_at: new Date(),
        });
        accounts.push(id);
        await insert(connection, "user_preferences", { owner_user_id: id });
      }
      const publisher = accounts[1];
      await insert(connection, "publisher_profiles", {
        owner_user_id: publisher,
        public_name: "数据工坊",
        terms_version: "V3.0",
      });
      await insert(connection, "management_guard", {
        bootstrap_consumed_at: new Date(),
      });
      await insert(connection, "management_role_grants", {
        owner_user_id: accounts[2],
        capabilities: [
          "access.manage",
          "data.diagnose",
          "runtime.manage",
          "runtime.observe",
          "commerce.manage",
          "catalog.manage",
          "user.manage",
          "observability.manage",
        ],
        reason: "Local development seed",
      });
      const image = await insert(connection, "runtime_images", {
        name: "本地原型镜像",
        digest: "sha256:development-fixture",
        language: "node",
        version: "24",
        modes: ["docker"],
        evidence: JSON.stringify({ development_fixture: true }),
      });
      const resource = await insert(connection, "resource_profiles", {
        name: "标准执行资源",
        version: 1,
        limits: JSON.stringify({ cpu: 1, memory_mib: 512 }),
      });
      const policy = await insert(connection, "commerce_policies", {
        version: 1,
        currency: "CNY",
        platform_fee_bps: 0,
        platform_fixed_fee_minor: 0,
        channel_cost_bearer: "PLATFORM",
        rounding_rule: "FLOOR_PLATFORM_REMAINDER_PUBLISHER",
        settlement_delay_seconds: 86400,
        refund_rules: JSON.stringify({ development_fixture: true }),
        effective_at: new Date(),
        created_by: accounts[2],
      });
      const definitions = [
        {
          name: "表格清洗",
          category: "数据处理",
          amount: 600,
          author: "数据工坊",
          description:
            "清洗与规范化表格数据，处理缺失、重复与格式不一致等常见问题。",
          delivery: "返回清洗后的完整表格文件",
          icon: "table",
        },
        {
          name: "文件批量处理",
          category: "文件工具",
          amount: 300,
          author: "工具集",
          description: "批量处理多种文件，支持格式转换、合并与基础整理。",
          delivery: "返回处理完成的文件包",
          icon: "file",
        },
        {
          name: "公开数据整理",
          category: "信息整理",
          amount: 500,
          author: "开放数据屋",
          description:
            "对公开来源的数据进行清洗、结构化与字段整理，输出可直接使用的表格。",
          delivery: "返回整理后的结构化数据文件",
          icon: "database",
        },
        {
          name: "免费景点预约",
          category: "旅行预约",
          amount: 800,
          author: "旅行工具集",
          description:
            "按照指定景点与日期完成预约申请，包含后续流程直至获得预约结果。",
          delivery: "返回预约结果与必要凭证信息",
          icon: "calendar",
        },
      ];
      for (const definition of definitions) {
        const category = await insert(connection, "service_categories", {
          key: definition.icon,
          name: definition.category,
        });
        const object = await insert(connection, "storage_objects", {
          owner_user_id: publisher,
          purpose: "SOURCE",
          bucket_alias: "development-fixtures",
          object_key: `${definition.icon}/source`,
          sha256: "development-fixture",
          size_bytes: 0,
          key_version: "development-fixture",
          status: "READY",
        });
        const script = await insert(connection, "scripts", {
          owner_user_id: publisher,
          name: definition.name,
        });
        const schema =
          definition.icon === "table"
            ? {
                type: "object",
                required: ["source_file", "deduplicate_by", "output_format"],
                properties: {
                  source_file: { type: "string", title: "上传文件" },
                  deduplicate_by: {
                    type: "string",
                    title: "去重字段",
                    enum: ["邮箱", "手机号", "全部字段"],
                  },
                  output_format: {
                    type: "string",
                    title: "输出格式",
                    enum: ["CSV", "JSON", "XLSX"],
                  },
                },
                additionalProperties: false,
              }
            : {
                type: "object",
                required: ["source"],
                properties: {
                  source: { type: "string", title: "数据来源" },
                  limit: {
                    type: "integer",
                    title: "最大处理条数",
                    minimum: 1,
                    maximum: 10000,
                  },
                },
                additionalProperties: false,
              };
        const version = await insert(connection, "script_versions", {
          owner_user_id: publisher,
          script_id: script,
          version: "1.2",
          source_object_id: object,
          manifest: JSON.stringify({ development_fixture: true }),
          content_hash: `development-${definition.icon}`,
          schema_digest: `schema-${definition.icon}`,
          sealed_at: new Date(),
          content_status: "SEALED",
        });
        await insert(connection, "script_actions", {
          owner_user_id: publisher,
          script_version_id: version,
          name: "process",
          input_schema: JSON.stringify(schema),
          input_schema_digest: `schema-${definition.icon}`,
          output_schema: "{}",
          definition: JSON.stringify({
            ui_schema:
              definition.icon === "table"
                ? {
                    "ui:order": [
                      "source_file",
                      "deduplicate_by",
                      "output_format",
                    ],
                    source_file: { "ui:widget": "SourceUpload" },
                  }
                : {},
          }),
        });
        const build = await insert(connection, "builds", {
          owner_user_id: publisher,
          script_version_id: version,
          base_image_id: image,
          source_digest: `development-${definition.icon}`,
          status: "SUCCEEDED",
        });
        const artifact = await insert(connection, "artifacts", {
          owner_user_id: publisher,
          build_id: build,
          object_id: object,
          digest: `artifact-${definition.icon}`,
          dependency_manifest: "{}",
        });
        await connection.query(
          "UPDATE travel.script_versions SET build_artifact_id=$1,content_status='READY' WHERE id=$2",
          [artifact, version],
        );
        const deployment = await insert(connection, "deployments", {
          owner_user_id: publisher,
          script_version_id: version,
          artifact_id: artifact,
          resource_profile_id: resource,
          runtime_snapshot: JSON.stringify({ development_fixture: true }),
          status: "READY",
        });
        const service = await insert(connection, "services", {
          owner_user_id: publisher,
          title: definition.name,
          description: definition.description,
          category_id: category,
          scene_key: definition.icon === "calendar" ? "travel" : null,
        });
        const release = await insert(connection, "service_releases", {
          owner_user_id: publisher,
          service_id: service,
          version: 1,
          script_version_id: version,
          deployment_id: deployment,
          action: "process",
          input_schema_digest: `schema-${definition.icon}`,
          title: definition.name,
          description: definition.description,
          delivery_policy: JSON.stringify({
            summary: definition.delivery,
            publisher_name: definition.author,
            icon: definition.icon,
            development_fixture: true,
          }),
          goal_definition: "{}",
          verification_method: "{}",
          refund_policy: JSON.stringify({ summary: "无结果全额退款" }),
          max_service_seconds: 300,
          resolution_seconds: 3600,
          contract_digest: `contract-${definition.icon}`,
        });
        await insert(connection, "price_plans", {
          owner_user_id: publisher,
          service_release_id: release,
          version: 1,
          commerce_policy_id: policy,
          unit_amount_minor: definition.amount,
          currency: "CNY",
          validity_seconds: 604800,
        });
        await connection.query(
          "UPDATE travel.services SET current_release_id=$1,status='ACTIVE' WHERE id=$2",
          [release, service],
        );
      }
    });
  }
}
