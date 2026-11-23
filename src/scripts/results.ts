import type { Column, DrawKind, Row } from './kind';
import { escapeHtml } from './text';
import type { DrawState } from './types';

/** Makes Excel read the file as UTF-8. */
const BOM = '﻿';

/** Drawn results, numbered by prize; prizes not drawn yet are skipped. */
export function resultRows(state: DrawState): Row[] {
  return state.results.flatMap((result, i) => (result ? [{ n: i + 1, ...result }] : []));
}

export function headerCells(columns: Column[]) {
  return columns.map(([header]) => `<th>${header}</th>`).join('');
}

export function rowCells(columns: Column[], row: Row) {
  return columns.map(([, value]) => `<td>${escapeHtml(value(row))}</td>`).join('');
}

/**
 * Names come from public forms, and spreadsheets run cells that look like formulas.
 * A leading apostrophe makes them plain text. Plain accounts ("@ana.pop") are harmless and stay as they are.
 */
function neutralizeFormula(value: unknown) {
  const text = String(value ?? '');
  const looksLikeFormula = /^\s*[=+\-@]/.test(text) && !/^@[\w.]+$/.test(text);
  return looksLikeFormula ? `'${text}` : text;
}

export function toSheetText(kind: DrawKind, state: DrawState) {
  const columns = kind.sheetColumns(state);
  return resultRows(state)
    .map((row) => columns.map(([, value]) => neutralizeFormula(value(row))).join('\t'))
    .join('\n');
}

function csvCell(value: unknown) {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

export function toCsv(kind: DrawKind, state: DrawState) {
  const columns = kind.csvColumns(state);
  const header = columns.map(([name]) => name);
  const rows = resultRows(state).map((row) => columns.map(([, value]) => value(row)));
  // semicolons, because Excel with Romanian settings does not split on commas
  return BOM + [header, ...rows].map((cells) => cells.map(csvCell).join(';')).join('\r\n');
}
