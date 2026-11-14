import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService, csrfToken } from "./auth.service";
import { AppRequest } from "../common/http";

export const Public = () => SetMetadata("public", true);
export const Capability = (capability: string) =>
  SetMetadata("capability", capability);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const safe = ["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (
      !safe &&
      request.headers.origin &&
      ![
        process.env.WEB_ORIGIN || "http://127.0.0.1:5174",
        "http://localhost:5174",
      ].includes(request.headers.origin)
    )
      throw new HttpException(
        { code: "POLICY_DENIED", message: "请求来源无效" },
        403,
      );
    request.user = await this.auth.userForSession(request.cookies?.session);
    const isPublic = this.reflector.getAllAndOverride("public", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!request.user && !isPublic)
      throw new HttpException(
        { code: "UNAUTHENTICATED", message: "请先登录" },
        401,
      );
    if (
      !safe &&
      request.user &&
      request.headers["x-csrf-token"] !== csrfToken(request.cookies.session)
    )
      throw new HttpException(
        { code: "POLICY_DENIED", message: "请求校验已失效，请刷新页面" },
        403,
      );
    const capability = this.reflector.getAllAndOverride<string>("capability", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (capability && !request.user?.capabilities.includes(capability))
      throw new HttpException(
        { code: "ACCESS_SCOPE_DENIED", message: "当前账号无权执行此操作" },
        403,
      );
    return true;
  }
}
