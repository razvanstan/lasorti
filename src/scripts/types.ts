import type { GiveawayFormat, Rules } from './giveaway';

// Person, Prize, Result, Redraw, Options, Meta, GiveawayInfo and DrawState are saved in localStorage as they are.
// Renaming a field breaks draws in progress on users' machines.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** What makes two rows the same participant. */
export type DedupeBy = 'none' | 'email' | 'email-name' | 'name' | 'phone' | 'code';

export interface Person {
  id: string;
  name: string;
  email: string;
  /** The phone number or code, when that is the unique field. */
  key?: string;
  /** Number of chances (tickets); 1 when missing. */
  w?: number;
}

export interface Prize {
  sponsor: string;
  prize: string;
  rar: Rarity;
  /** Shown instead of the rarity (e.g. "Câștigător 1", "Rezerva 2"). */
  label?: string;
  reserve?: boolean;
}

export type Result = Prize & Person & { at: number };

export interface Redraw {
  idx: number;
  name: string;
  email: string;
  key?: string;
  at: number;
}

export interface Options {
  /** Missing in draws saved before it existed; those used byName. */
  dedupe?: DedupeBy;
  dedupeColumn?: string;
  /** A person stays in the draw after winning. */
  multiWin?: boolean;
  byName?: boolean;
  grandLast: boolean;
  sound: boolean;
  countdown: boolean;
  showEmail: boolean;
}

export interface Meta {
  title: string;
  sub: string;
  theme: string;
  logo: string;
  startedAt: number;
  endedAt: number;
  hash: string;
  dupCount: number;
}

export interface GiveawayInfo {
  rules: Rules;
  format: GiveawayFormat;
  comments: number;
  validComments: number;
  rejected: { why: string; n: number }[];
  prize: string;
  winners: number;
  reserves: number;
}

export interface DrawState {
  v: 1;
  kind?: 'tombola' | 'giveaway';
  all: Person[];
  pool: Person[];
  prizes: Prize[];
  idx: number;
  results: (Result | null)[];
  done: boolean;
  redraws: Redraw[];
  /** Pool index of a winner already chosen but not shown yet. */
  pending?: number;
  opts: Options;
  meta: Meta;
  gw?: GiveawayInfo;
  ts: number;
}
