/**
 * CSV export utility.
 *
 * - Prepends UTF-8 BOM (\uFEFF) so Excel renders Arabic and other
 *   non-ASCII characters correctly when the file is opened directly.
 * - Escapes values per RFC 4180: wrap in quotes and double any internal
 *   quotes when the value contains comma, quote, newline, or carriage return.
 * - Accepts an array of plain objects + ordered column definitions, so
 *   callers control header labels and field order.
 */

export type CsvColumn<T> = {
  /** Header label shown in the file. */
  header: string;
  /** Either a key on the row object, or a function that returns the cell value. */
  accessor: keyof T | ((row: T) => unknown);
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === 'object') {
    try { s = JSON.stringify(value); } catch { s = String(value); }
  } else {
    s = String(value);
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw =
            typeof c.accessor === 'function'
              ? (c.accessor as (r: T) => unknown)(row)
              : (row as Record<string, unknown>)[c.accessor as string];
          return escapeCell(raw);
        })
        .join(','),
    )
    .join('\r\n');
  return `${header}\r\n${body}`;
}

/**
 * Trigger a browser download of the given CSV text. The `\uFEFF` BOM is
 * essential for Excel to detect UTF-8 — without it Arabic shows as mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** One-shot helper: build CSV from rows + columns and trigger download. */
export function exportRowsToCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, rowsToCsv(rows, columns));
}
