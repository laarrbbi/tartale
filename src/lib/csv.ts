/**
 * CSV for a spreadsheet opened in Spain: semicolons between cells (the comma
 * is the decimal mark), a byte-order mark so Excel reads UTF-8, CRLF lines.
 * A cell that starts like a formula (=, +, -, @) is prefixed with a quote,
 * so a customer's name can never run as one when the file is opened; numbers
 * are passed as numbers and stay numbers.
 */
export type CsvCell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value).replace('.', ',');
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `﻿${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Cents as a number of euros, for a cell: 5091 → 50.91. */
export function euros(cents: number): number {
  return cents / 100;
}
