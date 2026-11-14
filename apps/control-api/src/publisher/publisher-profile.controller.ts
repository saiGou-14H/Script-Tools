import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { PublisherProfileService } from "./publisher-profile.service";

@Controller("api/v1/me/publisher-profile")
export class PublisherProfileController {
  constructor(private readonly profiles: PublisherProfileService) {}
  private validateQuery(query: Record<string, unknown>) {
    if (Object.keys(query).length)
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "该接口仅处理本人发布者资料" },
        422,
      );
  }
  @Get()
  async get(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateQuery(query);
    const result = await this.profiles.get(request.user!.id);
    response.setHeader("Cache-Control", "no-store");
    if (result.profile)
      response.setHeader("ETag", `"${result.profile.revision}"`);
    return result;
  }
  @Post()
  async save(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateQuery(query);
    const result = await this.profiles.save(
      request.user!.id,
      body,
      request.get("Idempotency-Key"),
      request.get("If-Match"),
      request.requestId,
    );
    response.status(result.status);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("ETag", `"${result.data.revision}"`);
    return result.data;
  }
}
