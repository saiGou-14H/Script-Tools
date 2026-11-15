import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { PublisherOverviewService } from "./publisher-overview.service";

@Controller("api/v1/publisher/overview")
export class PublisherOverviewController {
  constructor(private readonly overview: PublisherOverviewService) {}

  @Get()
  get(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.overview.get(request.user!.id, query);
  }
}
