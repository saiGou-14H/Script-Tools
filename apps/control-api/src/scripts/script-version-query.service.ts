import { HttpException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService, DatabaseRow } from "../database/database.service";
import {
  invalidQuery,
  PaginationService,
  uuidPattern,
} from "../common/pagination.service";
import { artifactRegistrationAvailable } from "../publisher/artifact-metadata";
import { ScriptService } from "./script.service";

const contentStates = ["DRAFT", "SEALED", "READY", "RETIRED", "REVOKED"];
const versionFrom = `FROM travel.script_versions v
  JOIN travel.scripts s ON s.id=v.script_id AND s.owner_user_id=v.owner_user_id
  LEFT JOIN travel.artifacts a ON a.id=v.build_artifact_id AND a.owner_user_id=v.owner_user_id
  LEFT JOIN travel.builds b ON b.id=a.build_id AND b.owner_user_id=v.owner_user_id
  LEFT JOIN travel.storage_objects o ON o.id=a.object_id AND o.owner_user_id=v.owner_user_id
  LEFT JOIN LATERAL (SELECT id,status FROM travel.builds build
    WHERE build.script_version_id=v.id AND build.owner_user_id=v.owner_user_id
    ORDER BY build.created_at DESC,build.id DESC LIMIT 1) latest_build ON true`;
const versionFields = `v.id,v.script_id,s.name AS script_name,s.description,v.version,v.revision::text,
  v.content_status,v.content_hash AS source_digest,v.schema_digest,v.sealed_at,v.created_at,v.updated_at,
  v.build_artifact_id,a.digest AS artifact_digest,b.id AS artifact_build_id,b.status AS artifact_build_status,
  ${artifactRegistrationAvailable("v.id")} AS artifact_available,
  latest_build.id AS latest_build_id,latest_build.status AS latest_build_status,
  COALESCE((SELECT jsonb_agg(to_jsonb(states) ORDER BY states.status) FROM (
    SELECT d.status,count(*)::text AS count FROM travel.deployments d
    WHERE d.script_version_id=v.id AND d.owner_user_id=v.owner_user_id GROUP BY d.status
  ) states),'[]'::jsonb) AS deployment_states,
  COALESCE((SELECT jsonb_agg(to_jsonb(states) ORDER BY states.status) FROM (
    SELECT service.status,count(*)::text AS count FROM travel.services service
    JOIN travel.service_releases release ON release.id=service.current_release_id AND release.owner_user_id=service.owner_user_id
    JOIN travel.deployments deployment ON deployment.id=release.deployment_id AND deployment.owner_user_id=release.owner_user_id
      AND deployment.script_version_id=release.script_version_id
    WHERE release.script_version_id=v.id AND release.owner_user_id=v.owner_user_id GROUP BY service.status
  ) states),'[]'::jsonb) AS current_service_states`;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function schema(value: unknown) {
  return typeof value === "boolean" || record(value) ? value : null;
}
function inputDigest(value: unknown) {
  if (value === null) return null;
  const canonical = JSON.stringify(value, (_, item) =>
    record(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

@Injectable()
export class ScriptVersionQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pagination: PaginationService,
    private readonly scripts: ScriptService,
  ) {}

  private notFound(): never {
    throw new HttpException(
      { code: "NOT_FOUND", message: "脚本或版本不存在或已失效" },
      404,
    );
  }

  async list(owner: string, script: string, query: Record<string, unknown>) {
    await this.scripts.requirePublisher(this.database, owner);
    if (!uuidPattern.test(script)) this.notFound();
    if (
      Object.keys(query).some(
        (key) => !["limit", "cursor", "content_status"].includes(key),
      )
    )
      invalidQuery("包含不支持的版本筛选参数");
    const state = query.content_status;
    if (
      state !== undefined &&
      (typeof state !== "string" || !contentStates.includes(state))
    )
      invalidQuery("内容状态无效");
    const size = query.limit === undefined ? "20" : query.limit;
    if (typeof size !== "string" || !/^(?:[1-9]\d?|100)$/.test(size))
      invalidQuery("limit应为1至100的整数");
    const limit = Number(size);
    const scriptId = script.toLowerCase();
    const scope = JSON.stringify([
      owner,
      "script-versions",
      scriptId,
      state || null,
      limit,
    ]);
    const cursor = await this.pagination.decode(scope, query.cursor);
    const result = await this.database.query(
      `WITH own_script AS MATERIALIZED (
      SELECT id FROM travel.scripts WHERE id=$1 AND owner_user_id=$2
    ), page_rows AS (
      SELECT ${versionFields},
        to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      ${versionFrom} WHERE v.script_id=(SELECT id FROM own_script) AND v.owner_user_id=$2
        AND ($3::text IS NULL OR v.content_status=$3)
        AND ($4::timestamptz IS NULL OR (v.created_at,v.id)<($4,$5::uuid))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $6
    ) SELECT EXISTS(SELECT 1 FROM own_script) AS script_exists,
      COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb) AS versions`,
      [
        scriptId,
        owner,
        state || null,
        cursor?.created_at || null,
        cursor?.id || null,
        limit + 1,
      ],
    );
    if (!result.rows[0].script_exists) this.notFound();
    return this.pagination.page(
      scope,
      result.rows[0].versions as DatabaseRow[],
      limit,
    );
  }

  async get(owner: string, id: string) {
    await this.scripts.requirePublisher(this.database, owner);
    if (!uuidPattern.test(id)) this.notFound();
    const result = await this.database.query(
      `SELECT ${versionFields},v.manifest
      ${versionFrom} WHERE v.id=$1 AND v.owner_user_id=$2`,
      [id, owner],
    );
    const row = result.rows[0];
    if (!row) this.notFound();
    const { manifest: rawManifest, ...metadata } = row;
    const manifest = record(rawManifest) ? rawManifest : {};
    const definitions = record(manifest.actions) ? manifest.actions : null;
    const useManifest = row.content_status === "DRAFT" && !!definitions;
    const stored = useManifest
      ? []
      : (
          await this.database.query(
            `SELECT name,input_schema,input_schema_digest,output_schema,definition FROM travel.script_actions
       WHERE script_version_id=$1 AND owner_user_id=$2 ORDER BY name`,
            [id, owner],
          )
        ).rows;
    const actions = useManifest
      ? Object.entries(definitions!)
          .map(([name, action]) => {
            const definition = record(action) ? action : {};
            const effective = Object.hasOwn(definition, "input_schema")
              ? definition.input_schema
              : manifest.input_schema;
            const input = schema(effective);
            return {
              name,
              title:
                typeof definition.title === "string" ? definition.title : name,
              input_schema: input,
              input_schema_digest: inputDigest(input),
              output_schema: schema(definition.output_schema),
              input_schema_available: input !== null,
            };
          })
          .sort((left, right) => left.name.localeCompare(right.name))
      : stored.map((action) => {
          const definition = record(action.definition) ? action.definition : {};
          const input = schema(action.input_schema);
          return {
            name: action.name,
            title:
              typeof definition.title === "string"
                ? definition.title
                : action.name,
            input_schema: input,
            input_schema_digest: action.input_schema_digest,
            output_schema: schema(action.output_schema),
            input_schema_available: input !== null,
          };
        });
    return {
      ...metadata,
      revision: String(row.revision),
      default_action:
        typeof manifest.default_action === "string"
          ? manifest.default_action
          : null,
      action_source: useManifest ? "DRAFT_MANIFEST" : "STORED_PROJECTION",
      actions,
    };
  }
}
