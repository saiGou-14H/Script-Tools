let csrfToken = "";
export function setCsrfToken(token: string | null) {
  csrfToken = token || "";
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly fieldErrors: {
      path: string;
      rule: string;
      message: string;
    }[] = [],
  ) {
    super(message);
  }
}
interface ApiEnvelope<T> {
  data: T;
  next_cursor?: string | null;
  request_id?: string;
}
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T> | undefined> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (!headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: "same-origin",
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      503,
      "NETWORK_UNAVAILABLE",
      "网络连接暂时不可用，请稍后重试",
      "",
    );
  }
  if (response.status === 204) return undefined;
  let body: {
    data?: T;
    next_cursor?: string | null;
    error?: {
      code?: string;
      message?: string;
      field_errors?: { path: string; rule: string; message: string }[];
    };
    request_id?: string;
  };
  try {
    body = await response.json();
    if (!body || typeof body !== "object") throw new Error("Invalid response");
  } catch {
    throw new ApiError(
      response.ok ? 502 : response.status,
      "INVALID_RESPONSE",
      "服务暂时不可用，请稍后重试",
      "",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error?.code || "REQUEST_FAILED",
      body.error?.message || "请求失败，请稍后重试",
      body.request_id || "",
      body.error?.field_errors || [],
    );
  if (!("data" in body))
    throw new ApiError(
      502,
      "INVALID_RESPONSE",
      "服务响应格式无效，请稍后重试",
      body.request_id || "",
    );
  return body as ApiEnvelope<T>;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return (await request<T>(path, options))?.data as T;
}
export async function apiPage<T>(path: string, options: RequestInit = {}) {
  const response = await request<T[]>(path, options);
  if (
    !response ||
    !Array.isArray(response.data) ||
    (response.next_cursor !== null && typeof response.next_cursor !== "string")
  )
    throw new ApiError(
      502,
      "INVALID_RESPONSE",
      "分页响应格式无效",
      response?.request_id || "",
    );
  return { items: response.data, next_cursor: response.next_cursor };
}
