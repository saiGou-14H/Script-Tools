import { Controller, Get, Query, Req } from "@nestjs/common";
import { AppRequest } from "../common/http";
import { MonitoringService } from "./monitoring.service";

@Controller("api/v1/monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("overview")
  overview(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.monitoring.overview(request.user!.id, query);
  }
}
