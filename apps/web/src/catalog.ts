import catalog from "./generated/catalog.json";
import type { Role } from "./types";

export const pages = catalog.pages;
export type PageId = keyof typeof pages;
export const roles = catalog.roles;
export function pagePath(id: PageId, resourceId = "demo") {
  return pages[id].route.replace(/:\w+/g, resourceId);
}
export function roleForPath(path: string): Role {
  if (path.startsWith("/admin")) return "ADMIN";
  if (path.startsWith("/publisher")) return "PUBLISHER";
  if (path.startsWith("/me") || path.startsWith("/checkout")) return "USER";
  return "GUEST";
}
export function menuForRole(role: Role) {
  const definition = roles.find((item) => item.id === role)!;
  return definition.pages
    .map((id) => ({ ...pages[id as PageId], id: id as PageId }))
    .filter((page) => page.kind === "menu");
}
