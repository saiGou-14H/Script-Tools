import { HttpException, Injectable } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { CurrentUser } from "../common/http";

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function csrfToken(session: string) {
  return digest(`travel-tools-csrf:${session}`);
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async userForSession(token?: string): Promise<CurrentUser | undefined> {
    if (!token) return;
    const result = await this.database.query(
      `UPDATE travel.auth_sessions s SET last_seen_at=now()
      FROM travel.users u WHERE u.id=s.owner_user_id
      AND s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
      AND COALESCE(s.last_seen_at,s.authenticated_at)>now()-interval '30 minutes'
      AND s.security_revision=u.security_revision AND u.status='ACTIVE' AND u.verified_at IS NOT NULL
      RETURNING u.id,u.display_name,u.status,u.security_revision`,
      [digest(token)],
    );
    if (!result.rows.length) return;
    const user = result.rows[0];
    const publisher = await this.database.query(
      "SELECT id FROM travel.publisher_profiles WHERE owner_user_id=$1 AND enabled=true",
      [user.id],
    );
    const grants = await this.database.query(
      "SELECT capabilities FROM travel.management_role_grants WHERE owner_user_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
      [user.id],
    );
    return {
      id: String(user.id),
      display_name: String(user.display_name),
      status: String(user.status),
      security_revision: Number(user.security_revision),
      roles: [
        "USER",
        ...(publisher.rows.length ? ["PUBLISHER"] : []),
        ...(grants.rows.length ? ["ADMIN"] : []),
      ],
      capabilities: [
        ...new Set(grants.rows.flatMap((row) => row.capabilities as string[])),
      ],
    };
  }

  async login(email: unknown, password: unknown) {
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    )
      throw new HttpException(
        { code: "INVALID_REQUEST", message: "请输入有效的邮箱和密码" },
        422,
      );
    const token = randomBytes(32).toString("hex");
    await this.database.transaction(async (connection) => {
      const result = await connection.query(
        "SELECT id,password_hash,security_revision,status,verified_at FROM travel.users WHERE email_normalized=$1 AND status <> 'CLOSED' FOR UPDATE",
        [email.trim().toLowerCase()],
      );
      const row = result.rows[0];
      const stored = String(row?.password_hash || "").split("$");
      const calculated = scryptSync(
        password,
        stored[1] || "development-padding",
        64,
      );
      const valid =
        stored[0] === "scrypt" &&
        /^[0-9a-f]{128}$/i.test(stored[2] || "") &&
        timingSafeEqual(calculated, Buffer.from(stored[2], "hex"));
      if (!row || !valid || row.status !== "ACTIVE" || !row.verified_at)
        throw new HttpException(
          { code: "UNAUTHENTICATED", message: "邮箱、密码或账号状态不正确" },
          401,
        );
      await connection.query(
        "INSERT INTO travel.auth_sessions(id,owner_user_id,token_hash,security_revision,authenticated_at,last_seen_at,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,now(),now(),now()+interval '12 hours')",
        [row.id, digest(token), row.security_revision],
      );
    });
    return { token, user: await this.userForSession(token) };
  }

  async logout(token: string) {
    await this.database.query(
      "UPDATE travel.auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",
      [digest(token)],
    );
  }
}
