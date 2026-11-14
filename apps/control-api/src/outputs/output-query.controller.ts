import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { AppRequest } from "../common/http";
import { invalidQuery } from "../common/pagination.service";
import { OutputQueryService } from "./output-query.service";

@Controller("api/v1")
export class OutputQueryController {
  constructor(private readonly outputs: OutputQueryService) {}
  @Get("outputs")
  list(
    @Req() request: AppRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.outputs.list(request.user!.id, query);
  }
  @Get("runs/:run/outputs")
  forRun(
    @Req() request: AppRequest,
    @Param("run") run: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.outputs.list(request.user!.id, query, run);
  }
  @Get("outputs/:id")
  async get(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length) invalidQuery("产物详情不接受查询参数");
    response.setHeader("Cache-Control", "no-store");
    const output = await this.outputs.get(request.user!.id, id);
    response.setHeader("ETag", `"${output.revision}"`);
    return output;
  }
}
