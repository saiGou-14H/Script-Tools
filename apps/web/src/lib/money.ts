export function formatMinorUnits(amount: string | bigint) {
  const minor = BigInt(amount);
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function parseYuan(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim())) {
    throw new Error("请输入有效金额，最多保留两位小数");
  }
  const [integer, fraction = ""] = value.trim().split(".");
  const minor = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n || minor > 9223372036854775807n)
    throw new Error("金额须大于0并在系统金额范围内");
  return minor.toString();
}
