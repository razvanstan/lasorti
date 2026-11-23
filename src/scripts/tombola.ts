import { fieldValue, isChecked } from './dom';
import { winnersOf } from './draw-state';
import type { Column, DrawKind, Prepared } from './kind';
import { parsePeople, type Duplicate } from './people';
import { parsePrizes, RARITIES, RARITY_LABEL } from './prizes';
import { escapeHtml, formatTime, maskEmail, maskEnd } from './text';
import type { DedupeBy, DrawState, Options, Person, Prize, Redraw, Result } from './types';

const number: Column = ['Nr.', (row) => row.n];
const sponsor: Column = ['Oferit de', (row) => row.sponsor];
const prize: Column = ['Premiu', (row) => row.prize];
const winner: Column = ['Câștigător', (row) => row.name];
const maskedEmail: Column = ['Email', (row) => maskEmail(row.email)];
const fullEmail: Column = ['Email', (row) => row.email];
const rarity: Column = ['Raritate', (row) => RARITY_LABEL[row.rar]];
const time: Column = ['Ora extragerii', (row) => formatTime(row.at)];

const DEDUPE_LABEL: Record<DedupeBy, string> = {
  none: '',
  email: 'email',
  'email-name': 'email și nume',
  name: 'nume',
  phone: 'telefon',
  code: 'cod',
};
const MISSING_LABEL: Record<DedupeBy, string> = { ...DEDUPE_LABEL, 'email-name': 'email' };

export function readDedupe(): DedupeBy {
  const value = fieldValue('dedupe');
  return value in DEDUPE_LABEL ? (value as DedupeBy) : 'email-name';
}

const dedupeOf = ({ dedupe, byName }: Options): DedupeBy => dedupe ?? (byName ? 'email-name' : 'email');

/** "Cod bilet" when the column is given by name; "cod" when only by number. */
function dedupeLabel(dedupe: DedupeBy, column = '') {
  return dedupe === 'code' && column && !/^\d+$/.test(column) ? column : DEDUPE_LABEL[dedupe];
}

const hasKey = ({ opts }: DrawState) => ['phone', 'code'].includes(dedupeOf(opts));

/** The phone number or code gets its own column, next to the email. */
function keyColumns(state: DrawState, isMasked: boolean): Column[] {
  if (!hasKey(state)) return [];
  const header = dedupeOf(state.opts) === 'phone' ? 'Telefon' : 'Cod';
  return [[header, ({ key = '' }) => (isMasked ? maskEnd(key) : key)]];
}

const maskedContact = ({ key, email }: Person | Redraw) => (key ? maskEnd(key) : maskEmail(email));

function setupError(peopleCount: number, prizeCount: number, multiWin: boolean) {
  if (!peopleCount || !prizeCount) return 'Lipsesc participanții sau premiile.';
  if (prizeCount > peopleCount && !multiWin)
    return `Sunt mai multe premii (${prizeCount}) decât participanți (${peopleCount}).`;
  return undefined;
}

function rarityReportHtml(prizes: Prize[]) {
  const counts = RARITIES.map((rar) => `${RARITY_LABEL[rar]} ${prizes.filter((p) => p.rar === rar).length}`);
  return `<div><b>Premii după raritate:</b> ${counts.join(' · ')}</div>`;
}

function rulesText(label: string, multiWin: boolean) {
  return {
    duplicates: label ? `se elimină după ${label}` : 'nu se elimină; fiecare rând este o șansă separată',
    wins: multiWin ? 'o persoană poate câștiga mai multe premii' : 'fiecare participant poate câștiga un singur premiu',
  };
}

function rulesHtml(label: string, multiWin: boolean) {
  const { duplicates, wins } = rulesText(label, multiWin);
  return `<div style="margin-top:6px"><b>Duplicate:</b> ${escapeHtml(duplicates)} · <b>Premii:</b> ${wins}</div>`;
}

function duplicatesHtml(dups: Duplicate[]) {
  if (!dups.length) return '';
  const withEmail = (email: string) => (email ? ` · ${escapeHtml(email)}` : '');
  const rows = dups.map(
    ({ name, email, why, keep }) =>
      `<div>${escapeHtml(name)}${withEmail(email)} — ${why} ca <b>${escapeHtml(keep.name)}</b>${withEmail(keep.email)}</div>`,
  );
  return `<b>Duplicate eliminate (${dups.length}):</b>${rows.join('')}`;
}

function prepare(): Prepared {
  const dedupe = readDedupe();
  const column = fieldValue('dedupeColumn').trim();
  const multiWin = isChecked('multiWin');
  const { list, dups, missing, error } = parsePeople(fieldValue('people'), dedupe, column);
  const label = dedupeLabel(dedupe, column);
  const prizes = parsePrizes(fieldValue('prizes'), isChecked('grandLast'));
  const missingNote =
    dedupe === 'email-name' ? 'se identifică doar după nume' : 'nu se poate verifica dacă sunt duplicate';
  const missingHtml = `<div style="margin-top:6px">${missing} participanți fără ${MISSING_LABEL[dedupe]}: ${missingNote}.</div>`;
  const dropped = dups.length ? ` (${dups.length} duplicate eliminate)` : '';
  return {
    list,
    prizes,
    dupCount: dups.length,
    error: error ?? setupError(list.length, prizes.length, multiWin),
    summary: `${list.length} ${label ? `participanți unici după ${label}` : 'înscrieri, fără eliminarea duplicatelor'}${dropped} · ${prizes.length} premii`,
    reportHtml: rarityReportHtml(prizes) + rulesHtml(label, multiWin) + (missing ? missingHtml : ''),
    droppedHtml: duplicatesHtml(dups),
  };
}

function groupBySponsor(results: Result[]) {
  const groups = new Map<string, Result[]>();
  for (const result of results) {
    const key = result.sponsor || 'Premii';
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups];
}

function grandPrizeHtml(grand: Result) {
  const from = grand.sponsor ? ` · oferit de ${escapeHtml(grand.sponsor)}` : '';
  return `<div class="fcard grand"><h3>⭐ Marele premiu${from}</h3><div class="fw">🏆 ${escapeHtml(grand.name)}</div><div class="fp">${escapeHtml(grand.prize)}</div></div>`;
}

function sponsorHtml([name, results]: [string, Result[]], index: number) {
  const items = results.map(
    (r) => `<li><div class="fw">🏆 ${escapeHtml(r.name)}</div><div class="fp">${escapeHtml(r.prize)}</div></li>`,
  );
  return `<div class="fcard" style="animation-delay:${index * 0.12}s"><h3>${escapeHtml(name)}</h3><ul>${items.join('')}</ul></div>`;
}

function finalView(state: DrawState) {
  const winners = winnersOf(state);
  const hasGrand = state.opts.grandLast && state.prizes.length > 1;
  const grand = hasGrand ? state.results[state.prizes.length - 1] : null;
  const others = winners.filter((result) => result !== grand);
  return {
    subtitle: `${winners.length} premii acordate · ${state.all.length} participanți · mulțumim sponsorilor!`,
    html: (grand ? grandPrizeHtml(grand) : '') + groupBySponsor(others).map(sponsorHtml).join(''),
  };
}

function factsHtml({ all, prizes, meta, opts, ...state }: DrawState) {
  const label = dedupeLabel(dedupeOf(opts), opts.dedupeColumn);
  const { duplicates, wins } = rulesText(label, !!opts.multiWin);
  const dropped = meta.dupCount ? ` (${meta.dupCount} înscrieri duplicate eliminate)` : '';
  const awarded = state.results.filter(Boolean).length;
  return `
        <tr><td>${label ? 'Participanți unici' : 'Înscrieri'}</td><td>${all.length}${dropped}</td></tr>
        <tr><td>Duplicate</td><td>${escapeHtml(duplicates)}</td></tr>
        <tr><td>Premii de persoană</td><td>${wins}</td></tr>
        <tr><td>Premii</td><td>${prizes.length} (acordate: ${awarded})</td></tr>`;
}

/** Several prizes, drawn from lists pasted from Excel, Sheets or Forms. */
export const tombola: DrawKind = {
  id: 'tombola',
  storagePrefix: '',
  filePrefix: '',
  defaultTitle: 'Extragere premii',
  defaultSubtitle: 'Extragere premii · Live',
  nextLabel: 'Premiul următor →',
  drawnUnit: 'premii acordate',
  prepare,
  positionText({ idx, prizes }) {
    const total = prizes.length;
    return idx === total - 1 && total > 1
      ? `⭐ Ultimul premiu · ${idx + 1} din ${total}`
      : `Premiul ${idx + 1} din ${total}`;
  },
  remainingText: (count) => `${count} premii rămase`,
  winnerNote: (state, person) => (state.opts.showEmail ? maskedContact(person) : ''),
  finalView,
  columns: (state) => [number, sponsor, prize, winner, maskedEmail, ...keyColumns(state, true)],
  // the organiser's own files keep the full contact data, unlike what is shown on stage
  sheetColumns: (state) => [number, sponsor, prize, winner, fullEmail, ...keyColumns(state, false)],
  csvColumns: (state) => [number, sponsor, prize, rarity, winner, fullEmail, ...keyColumns(state, false), time],
  report: {
    title: 'Proces-verbal de extragere a premiilor',
    winnersHeading: 'Câștigători',
    factsHtml,
    redrawColumns: [
      ['Poziția', (redraw) => redraw.idx + 1],
      ['Persoană extrasă inițial (scoasă din joc)', (redraw) => redraw.name],
      ['Contact', (redraw) => maskedContact(redraw)],
    ],
    toolScope: '',
    organizerDuties: '',
  },
};
