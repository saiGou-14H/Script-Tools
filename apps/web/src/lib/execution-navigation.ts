export function executionReturnPath(
  value: string | null | undefined,
  kind: "tasks" | "runs",
) {
  const path = `/me/${kind}`;
  return value === path || value?.startsWith(path + "?") ? value : undefined;
}
