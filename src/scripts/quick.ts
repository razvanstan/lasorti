// The rules of the quick tools (teams and order); pure functions, no page involved.
import { randomInt } from './random';
import { foldDiacritics, normalizeName } from './text';

export const MAX_NAMES = 500;
const MAX_NAME_LENGTH = 80;
const LIST_MARKER = /^(?:\d+[.)](?:\s+|$|(?=\p{L}))|[-*•–—](?:\s+|$))+/u;
/** Invisible marks that come with text copied from chats. */
const INVISIBLE = /[\u200e\u200f\ufeff]/g;

/** One name per line or separated by commas. People with the same name are kept: they are different people. */
export function parseNames(text: string) {
  return text
    .replace(INVISIBLE, '')
    .split(/[\r\n,;]+/)
    .map((name) => name.replace(/\s+/g, ' ').trim().replace(LIST_MARKER, '').slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);
}

const nameKey = (name: string) => normalizeName(name) || foldDiacritics(name);

/** Names that appear more than once, as first written. */
export function repeatedNames(names: string[]) {
  const first = new Map<string, string>();
  const repeated = new Set<string>();
  names.forEach((name) => {
    const key = nameKey(name);
    if (first.has(key)) repeated.add(first.get(key)!);
    else first.set(key, name);
  });
  return [...repeated];
}

/** The same for the same people, in whatever order they are typed. */
export const listKey = (names: string[]) => names.map(nameKey).sort().join('\n');

/** Fisher–Yates, on a copy. */
export function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** As equal as possible, larger teams first. */
export function teamSizes(people: number, teams: number) {
  const base = Math.floor(people / teams);
  return Array.from({ length: teams }, (_, i) => base + (i < people % teams ? 1 : 0));
}

/** Both the people and which teams are larger are drawn. */
export function drawTeams(names: string[], teams: number) {
  const people = shuffle(names);
  return shuffle(teamSizes(names.length, teams)).map((size) => people.splice(0, size));
}

/** "1 echipă", "2 echipe", "20 de echipe". */
export function countText(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  const rest = count % 100;
  return `${count} ${count !== 0 && (rest === 0 || rest >= 20) ? 'de ' : ''}${many}`;
}

export const peopleText = (count: number) => countText(count, 'om', 'oameni');

export function teamsText(people: number, teams: number) {
  const sizes = teamSizes(people, teams);
  const large = sizes.filter((size) => size === sizes[0]).length;
  const some = (count: number, size: number) => `${countText(count, 'echipă', 'echipe')} de ${size}`;
  if (large === teams) return `${peopleText(people)} → ${some(teams, sizes[0])}.`;
  return `${peopleText(people)} → ${some(large, sizes[0])} și ${some(teams - large, sizes[0] - 1)}. Care echipe sunt mai mari se trage tot la sorți.`;
}

export type TeamMode = 'count' | 'size';

export function teamCount(people: number, mode: TeamMode, value: number) {
  if (!Number.isInteger(value) || value < 1) return NaN;
  return mode === 'count' ? value : Math.ceil(people / value);
}

/** Why the draw cannot start; empty when it can. */
export function planError(people: number, teams?: number) {
  if (!people) return 'Scrie cel puțin două nume.';
  if (teams !== undefined && (!Number.isInteger(teams) || teams < 1)) return 'Scrie un număr întreg, cel puțin 1.';
  if (people < 2) return 'Scrie cel puțin două nume.';
  if (people > MAX_NAMES) return `Lista are ${peopleText(people)}; maximul este ${MAX_NAMES}.`;
  if (teams === undefined) return '';
  if (teams === 1) return 'Ar ieși o singură echipă.';
  if (teams > people) return `Nu ajung oamenii: ${peopleText(people)} pentru ${countText(teams, 'echipă', 'echipe')}.`;
  return '';
}
