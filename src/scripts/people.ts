import type { DedupeBy, Person } from './types';
import { foldDiacritics, maskEnd, normalizeName } from './text';

export interface Duplicate {
  name: string;
  email: string;
  why: string;
  keep: Person;
}

const EMAIL = /[^\s,;|<>"]+@[^\s,;|<>"]+\.[^\s,;|<>"]+/;
const EMAIL_WITH_BRACKETS = /[<("]*[^\s,;|<>"()]+@[^\s,;|<>"()]+\.[^\s,;|<>"()]+[>)"]*/g;
const EMAIL_LABEL = /^(e-?mail|mailto)?:?$/i;
const LETTERS_ONLY = /^[\p{L}\p{M}\s.'’-]+$/u;
const TIMESTAMP = /^\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/;
const ROW_NUMBER = /^\d+\.?$/;
const PHONE = /^(tel(efon)?[.:]*\s*)?(\+|00|0[237]|7)[\d\s()./-]{7,18}$/i;
const DATE_START = /^((19|20)\d{2}[./-]\d|\d{1,2}[./-]\d{1,2}[./-])/;
const HEADER =
  /^(nr\.?|cod|tel(efon)?\.?|(num[aă]r|nr\.?)( de)? telefon|nume( ?(și|si) ?prenume)?|nume complet|prenume|name|full name|participan[tț]i?|email|e-mail|adres[aă] de (e-?mail)|timestamp|marcaj de timp)$/i;
const MAX_NAME_LENGTH = 80;

export const chancesOf = (person: Person) => person.w ?? 1;
export const totalChances = (people: Person[]) => people.reduce((sum, person) => sum + chancesOf(person), 0);
export const hasUnequalChances = (people: Person[]) => people.some((person) => chancesOf(person) !== 1);

/** Fixes only names typed entirely in lower or upper case; the rest stay as people wrote them. */
function fixLetterCase(text: string) {
  const name = text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  const lower = name.toLocaleLowerCase('ro-RO');
  if (name !== lower && name !== name.toLocaleUpperCase('ro-RO')) return name;
  return lower.replace(/(^|[\s-])(\p{L})/gu, (_match, before, letter) => before + letter.toLocaleUpperCase('ro-RO'));
}

function splitCells(line: string) {
  return line
    .split(/[\t;,|]/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

/** A single word is not a full name, so the next column is the rest of it ("Popescu | Ion", "Popescu, Ion"). */
function nameFrom([first = '', second = '']: string[]) {
  const name = first.replace(/^\d+[.)]\s+/, '').replace(/\s+/g, ' ');
  const isPartial = LETTERS_ONLY.test(name) && !name.includes(' ') && LETTERS_ONLY.test(second);
  return isPartial ? `${name} ${second.replace(/\s+/g, ' ')}` : name;
}

/** The national form, so that "+40 722 000 111", "0722000111" and "722000111" (Excel drops the zero) are equal. */
function normalizePhone(cell: string) {
  if (!PHONE.test(cell) || DATE_START.test(cell)) return '';
  const digits = cell.replace(/\D/g, '').replace(/^(00)?40(?=\d{9}$)/, '0');
  if (digits.length < 9 || digits.length > 14) return '';
  return digits.length === 9 && digits.startsWith('7') ? `0${digits}` : digits;
}

/** Keeps empty cells, so that column positions stay correct. */
function splitColumns(line: string) {
  return line.split(line.includes('\t') ? '\t' : /[;,|]/).map((cell) => cell.trim());
}

interface Row {
  email: string;
  typedName: string;
  name: string;
  phone: string;
  code: string;
}

/** Null for blank and header rows. */
function parseRow(line: string, dedupe: DedupeBy, codeColumn: number): Row | null {
  if (!line.trim()) return null;
  const columns = splitColumns(line);
  const code = dedupe === 'code' ? (columns[codeColumn] ?? '') : '';
  if (code && HEADER.test(columns[0])) return null;
  const rest = code ? columns.filter((_cell, i) => i !== codeColumn).join('\t') : line;
  const email =
    line
      .match(EMAIL)?.[0]
      .toLowerCase()
      .replace(/[.,;]+$/, '') ?? '';
  const allCells = splitCells(rest);
  const phone = allCells.map(normalizePhone).find(Boolean) ?? '';
  const cells = allCells
    .map((cell) => cell.replace(EMAIL_WITH_BRACKETS, '').trim())
    .filter((cell) => !EMAIL_LABEL.test(cell) && !TIMESTAMP.test(cell) && !ROW_NUMBER.test(cell));
  const names = cells.filter((cell) => !normalizePhone(cell));
  const hasOwnKey = dedupe === 'phone' ? !!phone : !!code;
  if (!email && !hasOwnKey && (!cells.length || HEADER.test(cells[0]))) return null;
  // a list of phone numbers must not be projected on stage in full
  const nameless = dedupe === 'phone' && phone ? [] : cells;
  const typedName = nameFrom(names.length ? names : nameless);
  const fallback = email.split('@')[0] || code || maskEnd(phone);
  return { email, typedName, name: typedName || email ? fixLetterCase(typedName || fallback) : fallback, phone, code };
}

type Field = 'email' | 'name' | 'phone' | 'code';
const FIELDS: Record<DedupeBy, Field[]> = {
  none: [],
  email: ['email'],
  'email-name': ['email', 'name'],
  name: ['name'],
  phone: ['phone'],
  code: ['code'],
};
const SAME_FIELD: Record<Field, string> = {
  email: 'același email',
  name: 'același nume',
  phone: 'același telefon',
  code: 'același cod',
};

function keyOf(row: Row, field: Field) {
  if (field === 'name') return row.typedName ? normalizeName(row.typedName) : '';
  return field === 'code' ? foldDiacritics(row.code) : row[field];
}

/** Position of a column given by its number or by its name in the header; -1 when there is no such column. */
function findColumn(lines: string[], column: string) {
  if (/^\d+$/.test(column)) return Number(column) - 1;
  const header = splitColumns(lines.find((line) => line.trim()) ?? '');
  return header.findIndex((cell) => cell !== '' && foldDiacritics(cell) === foldDiacritics(column));
}

function personId(row: Row, dedupe: DedupeBy, index: number) {
  const usesEmail = dedupe === 'email' || dedupe === 'email-name';
  if (usesEmail && row.email) return row.email;
  const nameKey = dedupe === 'email-name' ? keyOf(row, 'name') : '';
  return nameKey ? `n:${nameKey}` : `l:${index}`;
}

/** Parses pasted rows and drops those with the same unique field. `missing` counts the people who do not have it. */
export function parsePeople(text: string, dedupe: DedupeBy, column = '') {
  const lines = text.split(/\r?\n/);
  const list: Person[] = [];
  const dups: Duplicate[] = [];
  const seen = new Map<string, Person>();
  let missing = 0;

  const name = column.trim();
  const codeColumn = dedupe === 'code' ? findColumn(lines, name) : -1;
  if (dedupe === 'code' && codeColumn < 0) {
    const error = name
      ? `Nu găsesc coloana „${name}” în antet.`
      : 'Scrie coloana unică: numele din antet sau numărul ei.';
    return { list, dups, missing, error };
  }
  const isNamedColumn = dedupe === 'code' && !/^\d+$/.test(name);
  const headerIndex = isNamedColumn ? lines.findIndex((line) => line.trim()) : -1;

  lines.forEach((line, index) => {
    const row = index === headerIndex ? null : parseRow(line, dedupe, codeColumn);
    if (!row) return;
    const keys = FIELDS[dedupe].map((field) => ({ field, key: keyOf(row, field) }));
    const match = keys.findIndex(({ field, key }) => key && seen.has(`${field}:${key}`));
    const remember = (person: Person, entries: typeof keys) =>
      entries.filter(({ key }) => key).forEach(({ field, key }) => seen.set(`${field}:${key}`, person));

    if (match >= 0) {
      const { field, key } = keys[match];
      const keep = seen.get(`${field}:${key}`)!;
      dups.push({ name: row.name, email: row.email, why: SAME_FIELD[field], keep });
      remember(keep, keys.slice(0, match));
      return;
    }
    const person: Person = { id: personId(row, dedupe, index), name: row.name, email: row.email };
    const ownKey = dedupe === 'phone' ? row.phone : row.code;
    if (ownKey) person.key = ownKey;
    if (keys.length && !keys[0].key) missing++;
    remember(person, keys);
    list.push(person);
  });
  return { list, dups, missing, error: undefined };
}

/**
 * The exact content of the "Lista participanților" file, whose SHA-256 fingerprint is published.
 * Any change here makes already published fingerprints impossible to verify.
 */
export function canonicalList(people: Person[]) {
  const weighted = hasUnequalChances(people);
  const toLine = (person: Person) => {
    if (weighted) return `${person.name}\t${chancesOf(person)}`;
    return [person.name, person.email, person.key].filter(Boolean).join('\t');
  };
  return people.map(toLine).join('\n') + '\n';
}

/** Empty when Web Crypto is unavailable (e.g. the page is not served over HTTPS). */
export async function sha256(text: string) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}
