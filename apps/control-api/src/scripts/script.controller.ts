import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { ScriptService } from "./script.service";

@Controller("api/v1")
export class ScriptController {
  constructor(private readonly scripts: ScriptService) {}

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
