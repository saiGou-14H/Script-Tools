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

  @Get("runs")
  @Capability("runtime.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "node_id", required: false, type: String })
  @ApiQuery({
    name: "run_mode",
    required: false,
    enum: ["finite", "continuous"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  runs(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.runs(request.user!, query);
  }

  @Get("runs/:id")
  @Capability("runtime.manage")
  run(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.run(request.user!, id, query);
  }

  @Get("observability/logs")
  @Capability("runtime.observe")
  @ApiQuery({ name: "view", required: true, enum: ["segments"] })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["COMMITTED", "MISSING", "DELETED"],
  })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  platformLogs(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.platformLogSegments(
      request.user!,
      query,
      request.requestId,
    );
  }

  @Get("observability/alerts")
  @Capability("runtime.observe")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["FIRING", "ACKNOWLEDGED", "RECOVERED"],
  })
  @ApiQuery({
    name: "severity",
    required: false,
    enum: ["INFO", "WARNING", "CRITICAL"],
  })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  alerts(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.alerts(request.user!, query);
  }

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

  @Get("nodes/:id")
  @Capability("runtime.manage")
  node(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.node(request.user!, id, query);
  }

  @Get("images")
  @Capability("runtime.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["DRAFT", "READY", "RETIRED", "REVOKED"],
  })
  @ApiQuery({
    name: "mode",
    required: false,
    enum: ["docker", "qemu_kvm", "qemu_tcg"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  images(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.images(request.user!, query);
  }

  @Get("scheduling")
  @Capability("runtime.manage")
  scheduling(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.scheduling(request.user!, query);
  }

  @Get("scheduling/quotas")
  @Capability("runtime.manage")
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  capacityQuotas(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.metadata.capacityQuotas(request.user!, query);
  }
}
