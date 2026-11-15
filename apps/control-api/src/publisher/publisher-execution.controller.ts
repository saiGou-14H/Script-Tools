import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { invalidQuery } from "../common/pagination.service";
import {
  PublisherExecutionService,
  PublisherRecordKind,
} from "./publisher-execution.service";

@Controller("api/v1")
export class PublisherExecutionController {
  constructor(private readonly records: PublisherExecutionService) {}

  private detail(
    request: AppRequest,
    response: Response,
    kind: PublisherRecordKind,
    id: string,
    query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length) invalidQuery("记录详情不接受查询参数");
    response.setHeader("Cache-Control", "no-store");
    return this.records.get(request.user!.id, kind, id);
  }

  @Get("builds")
  builds(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.records.list(request.user!.id, "builds", query);
  }

  @Get("builds/:id")
  build(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.detail(request, response, "builds", id, query);
  }

  @Get("script-versions/:id/builds")
  versionBuilds(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.records.list(request.user!.id, "builds", query, id);
  }

  @Get("test-runs")
  tests(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.records.list(request.user!.id, "test-runs", query);
  }

  @Get("test-runs/:id")
  test(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.detail(request, response, "test-runs", id, query);
  }

  @Get("script-versions/:id/test-runs")
  versionTests(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.records.list(request.user!.id, "test-runs", query, id);
  }

  @Get("deployments")
  deployments(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.records.list(request.user!.id, "deployments", query);
  }

  @Get("deployments/:id")
  deployment(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.detail(request, response, "deployments", id, query);
  }
}
