import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { ScriptService } from "./script.service";
import { ScriptVersionQueryService } from "./script-version-query.service";
import { invalidQuery } from "../common/pagination.service";

@Controller("api/v1")
export class ScriptController {
  constructor(
    private readonly scripts: ScriptService,
    private readonly versions: ScriptVersionQueryService,
  ) {}

  @Get("scripts/:id/versions")
  versionsForScript(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.versions.list(request.user!.id, id, query);
  }

  @Get("script-versions/:id")
  async version(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length) invalidQuery("版本详情不接受查询参数");
    response.setHeader("Cache-Control", "no-store");
    const version = await this.versions.get(request.user!.id, id);
    response.setHeader("ETag", `"${version.revision}"`);
    return version;
  }

  @Get("script-versions/:id/actions")
  async actions(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length) invalidQuery("动作定义不接受查询参数");
    response.setHeader("Cache-Control", "no-store");
    return (await this.versions.get(request.user!.id, id)).actions;
  }

  @Get("me/scripts")
  async list(
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.scripts.list(request.user!.id);
  }

  @Get("script-versions/:id/source")
  async source(
    @Param("id") id: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const source = await this.scripts.source(request.user!.id, id);
    response.setHeader("ETag", `"${source.revision}"`);
    return source;
  }

  @Post("scripts")
  async create(
    @Body() body: unknown,
    @Req() request: AppRequest,
    @Headers("Idempotency-Key") key: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.scripts.save(
      request.user!.id,
      body,
      key,
      request.requestId,
    );
    response.status(result.status).setHeader("Cache-Control", "no-store");
    return result.data;
  }

  @Patch("script-versions/:id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AppRequest,
    @Headers("Idempotency-Key") key: string,
    @Headers("If-Match") revision: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.scripts.save(
      request.user!.id,
      body,
      key,
      request.requestId,
      id,
      revision,
    );
    response.status(result.status).setHeader("Cache-Control", "no-store");
    return result.data;
  }
}
