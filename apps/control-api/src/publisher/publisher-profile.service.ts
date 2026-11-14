import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService, SqlConnection } from "../database/database.service";
import { CommandReceiptService } from "../common/command-receipt.service";

const terms = {
  version: "V3.0",
  paragraphs: [
    "公开昵称与服务简介用于展示发布者身份、服务范围和公开联系说明。",
    "脚本与服务按发布版本和声明范围运行，输入要求、交付标准与退款规则在购买前展示并写入成交合同。",
    "每单提供一次完整服务，同次必要接续按成交合同执行；再次使用创建新的服务订单。",
    "凭据、输入、日志与产物按各自归属授权；发布者工作区管理本人的代码、部署、商品与经营资料。",
  ],
};
const projection =
  "id,public_name,description,terms_version,enabled,revision::text,created_at,updated_at";
function invalid(
  path: string,
  rule: string,
  message: string,
  status = 422,
  code = "INVALID_REQUEST",
): never {
  throw new HttpException(
    { code, message, field_errors: [{ path, rule, message }] },
    status,
  );
}

@Injectable()
export class PublisherProfileService {
  constructor(
    private readonly database: DatabaseService,
    private readonly receipts: CommandReceiptService,
  ) {}

  private async profile(
    connection: SqlConnection,
    owner: string,
    lock = false,
  ) {
    return (
      await connection.query(
        `SELECT ${projection} FROM travel.publisher_profiles WHERE owner_user_id=$1${lock ? " FOR UPDATE" : ""}`,
        [owner],
      )
    ).rows[0];
  }
  async get(owner: string) {
    return {
      profile: (await this.profile(this.database, owner)) || null,
      terms,
    };
  }

  async save(
    owner: string,
    body: unknown,
    key: string | undefined,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    if (!key?.trim())
      invalid("/headers/Idempotency-Key", "required", "请提供幂等请求标识");
    return this.database.transaction(async (connection) => {
      const user = (
        await connection.query(
          "SELECT status,verified_at FROM travel.users WHERE id=$1 FOR UPDATE",
          [owner],
        )
      ).rows[0];
      if (!user || user.status !== "ACTIVE" || !user.verified_at)
        throw new HttpException(
          { code: "UNAUTHENTICATED", message: "请使用已验证的有效账号登录" },
          401,
        );
      const previous = await this.profile(connection, owner, true);
      if (previous && !previous.enabled)
        throw new HttpException(
          { code: "PUBLISHER_UNAVAILABLE", message: "发布者工作区当前已停用" },
          403,
        );
      const scope = {
        owner,
        method: "POST",
        route: "/api/v1/me/publisher-profile",
        key,
      };
      const stored = await this.receipts.read(connection, scope, body);
      if (stored.receipt) return stored.receipt;
      if (!body || typeof body !== "object" || Array.isArray(body))
        invalid("", "type", "请输入有效的发布者资料");
      const values = body as Record<string, unknown>;
      const unknown = Object.keys(values).find(
        (name) =>
          !["public_name", "description", "accepted_terms_version"].includes(
            name,
          ),
      );
      if (unknown)
        invalid(
          `/${unknown.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          "additionalProperties",
          "包含未支持的资料字段",
        );
      if (
        typeof values.public_name !== "string" ||
        !values.public_name.trim() ||
        values.public_name.length > 120
      )
        invalid("/public_name", "length", "公开昵称应为1至120位有效文字");
      if (
        typeof values.description !== "string" ||
        !values.description.trim() ||
        values.description.length > 10000
      )
        invalid(
          "/description",
          "length",
          "请填写服务简介与联系说明，最多10000位",
        );
      if (values.accepted_terms_version !== terms.version)
        invalid(
          "/accepted_terms_version",
          "const",
          "请阅读并同意当前发布者服务约定",
          422,
          "TERMS_REQUIRED",
        );
      if (previous) {
        if (!ifMatch)
          invalid(
            "/headers/If-Match",
            "required",
            "请先加载最新发布者资料",
            428,
            "PRECONDITION_REQUIRED",
          );
        const expected = ifMatch.replace(/^"([1-9]\d*)"$/, "$1");
        if (!/^[1-9]\d*$/.test(expected))
          invalid("/headers/If-Match", "format", "资料修订号无效");
        if (expected !== String(previous.revision))
          invalid(
            "/headers/If-Match",
            "revision",
            "资料已被更新，请加载最新资料后重新保存",
            412,
            "REVISION_CONFLICT",
          );
      } else if (ifMatch)
        invalid(
          "/headers/If-Match",
          "revision",
          "发布者资料尚未创建，请重新加载",
          412,
          "REVISION_CONFLICT",
        );
      const saved = previous
        ? (
            await connection.query(
              `UPDATE travel.publisher_profiles SET public_name=$2,description=$3,terms_version=$4
            WHERE owner_user_id=$1 AND revision=$5 RETURNING ${projection}`,
              [
                owner,
                values.public_name.trim(),
                values.description.trim(),
                terms.version,
                previous.revision,
              ],
            )
          ).rows[0]
        : (
            await connection.query(
              `INSERT INTO travel.publisher_profiles(id,owner_user_id,public_name,description,terms_version)
            VALUES(gen_random_uuid(),$1,$2,$3,$4) RETURNING ${projection}`,
              [
                owner,
                values.public_name.trim(),
                values.description.trim(),
                terms.version,
              ],
            )
          ).rows[0];
      const action = previous
        ? "PUBLISHER_PROFILE_UPDATED"
        : "PUBLISHER_PROFILE_CREATED";
      await connection.query(
        `INSERT INTO travel.audit_events(id,actor_user_id,subject_owner_user_id,action,target_type,target_id,before_revision,after_revision,request_id,outcome,summary)
        VALUES(gen_random_uuid(),$1,$1,$2,'PUBLISHER_PROFILE',$3,$4,$5,$6,'SUCCESS',$7)`,
        [
          owner,
          action,
          saved.id,
          previous?.revision || null,
          saved.revision,
          requestId,
          JSON.stringify({
            changed_fields: ["public_name", "description", "terms_version"],
            terms_version: terms.version,
          }),
        ],
      );
      await connection.query(
        `INSERT INTO travel.outbox_events(id,owner_user_id,aggregate_type,aggregate_id,aggregate_revision,event_type,payload,request_id,occurred_at)
        VALUES(gen_random_uuid(),$1,'PUBLISHER_PROFILE',$2,$3,$4,$5,$6,now())`,
        [
          owner,
          saved.id,
          saved.revision,
          action,
          JSON.stringify({
            profile_id: saved.id,
            enabled: saved.enabled,
            terms_version: terms.version,
          }),
          requestId,
        ],
      );
      const response = { status: previous ? 200 : 201, data: saved };
      await this.receipts.write(
        connection,
        scope,
        stored.digest,
        String(saved.id),
        response,
      );
      return response;
    });
  }
}
