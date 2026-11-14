import { HttpException, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseService, DatabaseRow } from "../database/database.service";
import { loadPayloadKey } from "./payload-key";

export class PageResult<T> {
  constructor(
    readonly items: T[],
    readonly nextCursor: string | null,
  ) {}
}
export function invalidQuery(message: string): never {
  throw new HttpException({ code: "INVALID_REQUEST", message }, 422);
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PaginationService {
  private keyPromise?: ReturnType<typeof loadPayloadKey>;
  constructor(private readonly database: DatabaseService) {}
  private async signature(scope: string, token: string) {
    this.keyPromise ||= loadPayloadKey(this.database.root);
    return createHmac("sha256", (await this.keyPromise).bytes)
      .update(`list-cursor-v1\0${scope}\0${token}`)
      .digest();
  }
  async decode(scope: string, value: unknown) {
    if (value === undefined) return null;
    if (
      typeof value !== "string" ||
      value.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)
    )
      invalidQuery("分页游标无效，请重新查询");
    const [token, signature] = value.split(".");
    const expected = await this.signature(scope, token);
    const received = Buffer.from(signature, "base64url");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      invalidQuery("分页游标与当前账号或筛选不符，请重新查询");
    let cursor: { id?: unknown; created_at?: unknown };
    try {
      cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    } catch {
      invalidQuery("分页游标无效，请重新查询");
    }
    if (
      !cursor ||
      typeof cursor.id !== "string" ||
      !uuidPattern.test(cursor.id) ||
      typeof cursor.created_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(
        cursor.created_at,
      ) ||
      Number.isNaN(Date.parse(cursor.created_at))
    )
      invalidQuery("分页游标无效，请重新查询");
    return { id: cursor.id, created_at: cursor.created_at };
  }
  async page(scope: string, rows: DatabaseRow[], limit: number) {
    const selected = rows.slice(0, limit);
    let next: string | null = null;
    if (rows.length > limit) {
      const last = selected[selected.length - 1];
      const token = Buffer.from(
        JSON.stringify({ id: last.id, created_at: last.cursor_created_at }),
      ).toString("base64url");
      next = `${token}.${(await this.signature(scope, token)).toString("base64url")}`;
    }
    return new PageResult(
      selected.map(({ cursor_created_at, ...item }) => item),
      next,
    );
  }
}
