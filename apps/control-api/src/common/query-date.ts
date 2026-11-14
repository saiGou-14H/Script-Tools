import { HttpException } from "@nestjs/common";

export function parseQueryDate(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    Number.isNaN(Date.parse(value))
  )
    throw new HttpException(
      { code: "INVALID_REQUEST", message: "时间参数须使用含时区的ISO日期时间" },
      422,
    );
  if (
    new Date(value.slice(0, 10)).toISOString().slice(0, 10) !==
    value.slice(0, 10)
  )
    throw new HttpException(
      { code: "INVALID_REQUEST", message: "时间参数包含无效日期" },
      422,
    );
  const date = new Date(value);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new HttpException(
      { code: "INVALID_REQUEST", message: "时间参数超出可查询日期范围" },
      422,
    );
  return date;
}
