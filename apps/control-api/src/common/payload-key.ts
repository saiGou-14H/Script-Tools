import { HttpException } from "@nestjs/common";
import { loadDevelopmentKey } from "./development-key";

export async function loadPayloadKey(root: string) {
  const configured = process.env.PAYLOAD_ENCRYPTION_KEY?.trim();
  if (configured) {
    const bytes = Buffer.from(configured, "base64");
    if (bytes.length !== 32 || bytes.toString("base64") !== configured)
      throw new HttpException(
        { code: "PAYLOAD_KEY_UNAVAILABLE", message: "加密存储密钥配置无效" },
        503,
      );
    return { bytes, version: "environment-v1" };
  }
  if (process.env.DEV_SEED === "true" && process.env.NODE_ENV !== "production")
    return { bytes: await loadDevelopmentKey(root), version: "development-v1" };
  throw new HttpException(
    { code: "PAYLOAD_KEY_UNAVAILABLE", message: "加密存储密钥尚未配置" },
    503,
  );
}
