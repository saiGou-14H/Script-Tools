import type { RJSFSchema } from "@rjsf/utils";

export function parameterExamples(
  schema: RJSFSchema | undefined,
  order: string[] = [],
  tableExample = false,
) {
  if (!schema || typeof schema !== "object" || !schema.properties) return [];
  const entries = Object.entries(schema.properties).sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return (
      (leftIndex < 0 ? order.length : leftIndex) -
      (rightIndex < 0 ? order.length : rightIndex)
    );
  });
  return entries.map(([name, definition]) => {
    const property =
      typeof definition === "object" ? (definition as RJSFSchema) : undefined;
    const value =
      (Array.isArray(property?.examples) ? property.examples[0] : undefined) ??
      property?.default ??
      property?.const ??
      property?.enum?.[0];
    const fallback = tableExample && name === "source_file"
      ? "客户数据.csv"
      : "由使用者填写";
    return {
      name,
      title: property?.title || name,
      example:
        value === undefined
          ? fallback
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
      required: schema.required?.includes(name) || false,
      description:
        property?.description ||
        (schema.required?.includes(name) ? "必填参数" : "可选参数"),
    };
  });
}
