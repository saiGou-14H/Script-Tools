export function formatCsvRows(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          if (!/[",\r\n]/.test(value)) return value;
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
