import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { invalidQuery } from "../common/pagination.service";
import { AccountService } from "./account.service";

@Controller("api/v1/me")
export class AccountController {
  constructor(private readonly accounts: AccountService) {}
  private noQuery(query: Record<string, unknown>) {
    if (Object.keys(query).length) invalidQuery("该账号操作不接受查询参数");
  }
  @Get()
  async get(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.noQuery(query);
    const account = await this.accounts.get(
      request.user!,
      request.cookies.session,
    );
    response.setHeader("ETag", `"${account.revision}"`);
    response.setHeader("Cache-Control", "no-store");
    return account;
  }
  @Patch()
  async update(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.noQuery(query);
    const result = await this.accounts.update(
      request.user!.id,
      request.cookies.session,
      body,
      request.get("Idempotency-Key"),
      request.get("If-Match"),
      request.requestId,
    );
    response.setHeader("ETag", `"${result.data.revision}"`);
    response.setHeader("Cache-Control", "no-store");
    return result.data;
  }
  @Get("sessions")
  sessions(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.accounts.sessions(
      request.user!.id,
      request.cookies.session,
      query,
    );
  }
  @Delete("sessions/:id")
  async revoke(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.noQuery(query);
    const result = await this.accounts.revoke(
      request.user!.id,
      request.cookies.session,
      id.toLowerCase(),
      body,
      request.get("Idempotency-Key"),
      request.get("If-Match"),
      request.requestId,
      request.sessionBeforeTouch,
    );
    response.setHeader("ETag", `"${result.data.revision}"`);
    response.setHeader("Cache-Control", "no-store");
    if (
      request.sessionBeforeTouch &&
      result.data.id === request.sessionBeforeTouch.id
    )
      response.clearCookie("session", { path: "/" });
    return result.data;
  }
}
