import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { Capability } from "../auth/auth.guard";
import { AppRequest } from "../common/http";
import { AdminMetadataService } from "./admin-metadata.service";

@ApiTags("Admin metadata")
@Controller("api/v1/admin")
export class AdminMetadataController {
  constructor(private readonly metadata: AdminMetadataService) {}

  @Get("users")
  @Capability("user.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["UNVERIFIED", "ACTIVE", "FROZEN", "CLOSING", "CLOSED"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  users(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.users(request.user!, query);
  }

  @Get("users/:id/quotas")
  @Capability("user.manage")
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  quotas(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.quotas(request.user!, id, query);
  }

  @Get("services")
  @Capability("catalog.manage")
  @ApiQuery({ name: "view", required: false, enum: ["services", "versions"] })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  catalog(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.catalog(request.user!, query);
  }
}
