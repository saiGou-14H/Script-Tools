import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PageResult } from "./pagination.service";
import { Request, Response } from "express";
import { map } from "rxjs";

export type CurrentUser = {
  id: string;
  display_name: string;
  status: string;
  roles: string[];
  capabilities: string[];
  security_revision: string;
};
export interface AppRequest extends Request {
  user?: CurrentUser;
  sessionBeforeTouch?: { id: string; revision: string };
  requestId: string;
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AppRequest>();
    request.requestId ||= randomUUID();
    return next.handle().pipe(
      map((data) =>
        data instanceof PageResult
          ? {
              data: data.items,
              next_cursor: data.nextCursor,
              request_id: request.requestId,
            }
          : { data, request_id: request.requestId },
      ),
    );
  }
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<AppRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const parserType = (exception as { type?: string } | null)?.type;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === "entity.too.large"
          ? 413
          : parserType === "entity.parse.failed"
            ? 400
            : 500;
    const detail =
      exception instanceof HttpException ? exception.getResponse() : {};
    const body =
      typeof detail === "object" && detail !== null
        ? (detail as Record<string, unknown>)
        : {};
    if (
      typeof body.retry_after_seconds === "number" &&
      body.retry_after_seconds > 0
    )
      response.setHeader("Retry-After", String(body.retry_after_seconds));
    if (status === 500) console.error(exception);
    response.status(status).json({
      error: {
        code:
          body.code ||
          (status === 413
            ? "REQUEST_TOO_LARGE"
            : status === 400
              ? "INVALID_REQUEST"
              : status === 404
                ? "NOT_FOUND"
                : "INTERNAL_ERROR"),
        message:
          body.message ||
          (status === 413
            ? "请求正文超过允许大小"
            : status === 400
              ? "请求JSON格式无效"
              : status === 500
                ? "服务暂时不可用"
                : String(detail)),
        field_errors: body.field_errors || [],
        retry_after_seconds: body.retry_after_seconds,
      },
      request_id: request.requestId || randomUUID(),
    });
  }
}
