import type { Service } from "../types";

export function serviceAvailable(service: Service) {
  return (
    service.availability?.can_purchase ?? service.deployment_status === "READY"
  );
}
export function serviceVersion(service: Service) {
  if (!service.script_version) return "—";
  return service.script_version.startsWith("v")
    ? service.script_version
    : `v${service.script_version}`;
}
export function serviceDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    date,
  );
}
export function serviceDuration(value?: number | string) {
  if (value === undefined) return "以服务约定为准";
  const seconds = BigInt(value);
  if (seconds % 86400n === 0n) return `${seconds / 86400n}天`;
  if (seconds % 3600n === 0n) return `${seconds / 3600n}小时`;
  if (seconds % 60n === 0n) return `${seconds / 60n}分钟`;
  return `${seconds}秒`;
}
export function servicePath(service: Service) {
  return service.scene_key === "travel"
    ? `/travel/attractions/${service.id}`
    : `/services/${service.id}`;
}
export function checkoutPath(
  service: Service,
  context = new URLSearchParams(),
) {
  const params = new URLSearchParams({ service: service.id });
  if (service.scene_key === "travel") {
    for (const key of ["attraction", "date", "slot", "party_size"]) {
      const value = context.get(key);
      if (value) params.set(key, value);
    }
  }
  return `/checkout?${params.toString()}`;
}
