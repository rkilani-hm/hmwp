/**
 * Lightweight CSV export.
 *
 * Why not a library? SheetJS would let us emit .xlsx with formatting,
 * but it's a 1+ MB dependency and CSV opens directly in Excel /
 * Numbers / Google Sheets without any conversion. For admin exports
 * of permit lists / activity logs / report tables this is plenty.
 *
 * Quoting rules (RFC 4180):
 *   - Always wrap each field in double quotes (defensive — handles
 *     commas, newlines, leading/trailing spaces without per-field
 *     analysis)
 *   - Escape interior double quotes by doubling them
 *   - Use \r\n line terminator (Excel-compatible)
 *
 * The leading BOM (\ufeff) tells Excel the file is UTF-8 — without
 * it, Arabic characters render as mojibake when the user double-
 * clicks the file on Windows.
 */

export interface CsvColumn<T> {
  /** Header shown in the first row. */
  header: string;
  /** Function returning the cell value for a given row. */
  accessor: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  // Double interior double quotes per RFC 4180
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string from rows + column definitions.
 */
export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.accessor(row))).join(','),
  );
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Build the CSV, wrap in a UTF-8 BOM'd Blob, and trigger a download
 * via a synthetic anchor click. Works in all evergreen browsers
 * without any framework integration; no temporary DOM remnants
 * after the click handler returns.
 */
export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob(['\ufeff' + csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers require the element be in the DOM to honor
  // download attribute; remove it immediately after click.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a filename like 'permits-2026-05-12.csv' from a stub.
 * Keeps exported file names consistent and date-stamped.
 */
export function timestampedFilename(stub: string, ext = 'csv'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${stub}-${y}-${m}-${d}.${ext}`;
}
