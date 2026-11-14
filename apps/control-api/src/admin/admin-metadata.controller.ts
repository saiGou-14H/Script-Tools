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
  @ApiQuery({ name: "attraction_id", required: false, type: String })
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

  @Get("cities")
  @Capability("catalog.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "enabled", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  cities(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.cities(request.user!, query);
  }

  @Get("attractions")
  @Capability("catalog.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "city_id", required: false, type: String })
  @ApiQuery({ name: "enabled", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  attractions(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.attractions(request.user!, query);
  }

  @Get("channels")
  @Capability("catalog.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "attraction_id", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: [
      "UNVERIFIED",
      "MONITOR_ONLY",
      "BOOKING_SUPPORTED",
      "DEGRADED",
      "DISABLED",
    ],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  channels(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.channels(request.user!, query);
  }

  @Get("channels/:id/rules")
  @Capability("catalog.manage")
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  channelRules(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.channelRules(request.user!, id, query);
  }
}
