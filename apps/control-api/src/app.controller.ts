import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseService } from "./database/database.service";
import { DEMO_ACCOUNTS } from "./database/seed.service";
import { AuthService, csrfToken } from "./auth/auth.service";
import { Capability, Public } from "./auth/auth.guard";
import { AppRequest } from "./common/http";
import { AuthChallengeService } from "./auth/auth-challenge.service";

@Controller("api/v1")
export class AppController {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly challenges: AuthChallengeService,
  ) {}

  @Public()
  @Get("health")
  async health() {
    const result = await this.database.query(
      "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema='travel'",
    );
    return {
      status: "ok",
      database: this.database.mode,
      schema_version: 1,
      tables: result.rows[0].tables,
    };
  }

  @Public()
  @Get("bootstrap")
  async bootstrap(@Req() request: AppRequest) {
    const catalog = JSON.parse(
      await readFile(
        path.join(
          this.database.root,
          "packages/contracts/ui-role-catalog.json",
        ),
        "utf8",
      ),
    );
    return {
      user: request.user || null,
      csrf_token: request.user ? csrfToken(request.cookies.session) : null,
      catalog,
      data_mode: process.env.DEV_SEED === "true" ? "prototype" : "live",
      demo_accounts: process.env.DEV_SEED === "true" ? DEMO_ACCOUNTS : [],
    };
  }

  @Public()
  @Post("auth/login")
  @HttpCode(200)
  async login(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, user } = await this.auth.login(body?.email, body?.password);
    response.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 3600 * 1000,
      path: "/",
    });
    return { user, csrf_token: csrfToken(token) };
  }

  @Public()
  @Post("auth/register")
  @HttpCode(202)
  register(@Body() body: Record<string, unknown>, @Req() request: AppRequest) {
    return this.challenges.request(
      "VERIFY_EMAIL",
      body,
      request.requestId,
      request.ip || "local",
    );
  }

  @Public()
  @Post("auth/verify-email")
  @HttpCode(200)
  verifyEmail(
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return this.challenges.consume(
      "VERIFY_EMAIL",
      body,
      request.requestId,
      request.ip || "local",
    );
  }

  @Public()
  @Post("auth/password-reset-requests")
  @HttpCode(202)
  requestPasswordReset(
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return this.challenges.request(
      "RESET_PASSWORD",
      body,
      request.requestId,
      request.ip || "local",
    );
  }

  @Public()
  @Post("auth/password-resets")
  @HttpCode(200)
  resetPassword(
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return this.challenges.consume(
      "RESET_PASSWORD",
      body,
      request.requestId,
      request.ip || "local",
    );
  }

  @Post("auth/logout")
  @HttpCode(200)
  async logout(
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies.session);
    response.clearCookie("session", { path: "/" });
    return { revoked: true };
  }

  @Get("me") me(@Req() request: AppRequest) {
    return request.user;
  }

  @Public()
  @Get("services")
  async services() {
    const allowDevelopmentFixtures =
      process.env.DEV_SEED === "true" && process.env.NODE_ENV !== "production";
    const result = await this.database.query(
      `SELECT s.id,r.title,r.description,s.scene_key,c.name AS category,r.id AS release_id,
      r.script_version_id,sv.version AS script_version,r.created_at AS published_at,s.updated_at,
      r.action,r.delivery_policy,r.refund_policy,r.max_service_seconds::text,r.resolution_seconds::text,
      sa.input_schema,sa.input_schema_digest,sa.output_schema,sa.definition->'ui_schema' AS input_ui_schema,
      p.id AS price_plan_id,p.unit_amount_minor::text AS amount_minor,p.currency,p.validity_seconds::text,d.status AS deployment_status,
      jsonb_build_object('can_purchase',u.status='ACTIVE' AND COALESCE(pp.enabled,false) AND sv.content_status='READY' AND d.status='READY'
        AND (NOT COALESCE(r.delivery_policy->'development_fixture'='true'::jsonb,false) OR $1::boolean),
        'reason',CASE WHEN u.status<>'ACTIVE' OR NOT COALESCE(pp.enabled,false) THEN '发布者当前不可售'
          WHEN sv.content_status<>'READY' THEN '脚本版本当前不可用' WHEN d.status<>'READY' THEN '部署当前不可用'
          WHEN COALESCE(r.delivery_policy->'development_fixture'='true'::jsonb,false) AND NOT $1::boolean THEN '开发样例服务'
          ELSE NULL END) AS availability
      FROM travel.services s JOIN travel.service_categories c ON c.id=s.category_id
      JOIN travel.service_releases r ON r.id=s.current_release_id
      JOIN LATERAL (SELECT * FROM travel.price_plans WHERE service_release_id=r.id AND retired_at IS NULL ORDER BY version DESC,created_at DESC,id DESC LIMIT 1) p ON true
      JOIN travel.deployments d ON d.id=r.deployment_id JOIN travel.script_versions sv ON sv.id=r.script_version_id
      JOIN travel.users u ON u.id=s.owner_user_id LEFT JOIN travel.publisher_profiles pp ON pp.owner_user_id=u.id
      JOIN travel.script_actions sa ON sa.script_version_id=r.script_version_id AND sa.name=r.action
      WHERE s.status='ACTIVE' AND p.retired_at IS NULL ORDER BY p.unit_amount_minor DESC`,
      [allowDevelopmentFixtures],
    );
    return result.rows;
  }

  @Public()
  @Get("services/:id")
  async service(@Param("id") id: string) {
    const services = await this.services();
    const service = services.find((row) => row.id === id);
    if (!service)
      throw new HttpException(
        { code: "NOT_FOUND", message: "服务不存在或已失效" },
        404,
      );
    return service;
  }

  @Get("tasks") async tasks(@Req() request: AppRequest) {
    return (
      await this.database.query(
        "SELECT id,name,status,execution_context,current_config_version,next_fire_at,revision FROM travel.tasks WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [request.user!.id],
      )
    ).rows;
  }

  @Capability("runtime.manage") @Get("admin/nodes") async nodes() {
    return (
      await this.database.query(
        "SELECT id,name,status,capabilities,last_heartbeat_at FROM travel.nodes ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
  }
}
