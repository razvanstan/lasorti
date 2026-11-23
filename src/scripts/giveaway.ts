// Pure functions: parsing comments copied from Instagram, lists and tables, and applying the giveaway rules.
import { foldDiacritics } from './text';

/** `user` identifies the person (lowercase, without "@"); `name` is what is shown. */
export type Comment = { user: string; name: string; text: string };
export type GiveawaySource = 'instagram' | 'list';
export type GiveawayFormat = 'comments' | 'list' | 'table';
export type ChanceMode = 'person' | 'comment';
export type Rules = { minTags: number; keyword: string; exclude: string[]; mode: ChanceMode };
export type Rejected = Comment & { why: string };
export type Entrant = { user: string; name: string; valid: number };
/** `unread` = lines that could not be given to anyone. */
export type ParsedComments = { comments: Comment[]; format: GiveawayFormat; unread: string[] };

/** Instagram account: lowercase letters, digits, dots and underscores, without spaces. */
const HANDLE = /^@?([a-z0-9._]{1,30})$/;
/** Interface words that get copied along with the comments (EN + RO). */
const NOISE_WORDS = new Set([
  'reply',
  'replies',
  'răspunde',
  'raspunde',
  'răspunsuri',
  'like',
  'likes',
  'apreciază',
  'aprecieri',
  'apreciere',
  'see',
  'translation',
  'vezi',
  'traducerea',
  'edited',
  'editat',
  'author',
  'autor',
  'verified',
  'verificat',
  'pinned',
  'fixat',
  'view',
  'all',
  'hide',
  'ascunde',
  'load',
  'more',
  'comments',
  'mai',
  'multe',
  'comentarii',
  'toate',
  'și',
  'si',
  'creator',
  'follow',
  'urmărește',
  'urmareste',
  '·',
  '•',
  '—',
  '-',
  '–',
]);
const UNIT = '(s|sec|m|min|h|ore?|d|z|zi|zile|w|săpt|sapt|săptămâni|y|ani|luni|l)';
const TIME_AGO = new RegExp(`^\\d+\\s*${UNIT}\\.?$`, 'i');
const UNIT_ONLY = new RegExp(`^${UNIT}\\.?$`, 'i');
const PROFILE_PIC = /(profile picture|fotografia de profil|poza de profil)/i;
const TABLE_HEADER = /^(user(name)?|nume|name|cont|profil|profile|autor|author|utilizator)$/i;
const BADGE = /^(verified|verificat|author|autor|creator|edited|editat)$/i;
const EMAIL = /(?<![@\w.+-])[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const DIRECTION_MARKS = /[\u200e\u200f]/g;

/** A line with only times, like counts or buttons. */
export function isNoise(line: string) {
  if (!line.trim() || PROFILE_PIC.test(line)) return true;
  const tokens = line.trim().toLowerCase().split(/\s+/);
  const hasNumber = tokens.some((token) => /^\d/.test(token));
  // "1 săpt." is two tokens: a bare unit only means time when there is also a number
  const isNoiseToken = (token: string) =>
    TIME_AGO.test(token) ||
    /^[\d.,]+$/.test(token) ||
    /^\(\d+\)$/.test(token) ||
    NOISE_WORDS.has(token) ||
    (hasNumber && UNIT_ONLY.test(token));
  return tokens.every(isNoiseToken);
}

/** The account on a line of its own; empty when the line is something else. */
function accountOf(line: string) {
  const account =
    line
      .trim()
      .replace(/\s+(verified|verificat)$/i, '')
      .match(HANDLE)?.[1] ?? '';
  return /^[\d.]+$/.test(account) ? '' : account;
}

const withoutAt = (text: string) => text.replace(/^@/, '');

const collapseSpaces = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Someone from a list: "@ana.pop" and "ana.pop" are the same person, shown as first written. */
function listedPerson(written: string) {
  const name = collapseSpaces(written);
  return { user: withoutAt(name).toLowerCase(), name };
}

/** Null for the header. */
function parseTableRow(line: string): Comment | null {
  const [author, ...rest] = line
    .split('\t')
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (!author || TABLE_HEADER.test(author)) return null;
  return { ...listedPerson(author), text: rest.join(' ') };
}

function parseListed(lines: string[]): ParsedComments {
  const tabbed = lines.filter((line) => line.includes('\t')).length;
  if (tabbed >= lines.length / 2) {
    return { comments: lines.map(parseTableRow).filter((comment) => comment !== null), format: 'table', unread: [] };
  }
  const isPerson = (line: string) => !isNoise(line) && withoutAt(line.trim()) !== '';
  const comments = lines
    .filter(isPerson)
    .map((line) => ({ ...listedPerson(line.trim().replace(/^\d+[.)]\s+/, '')), text: '' }));
  return { comments, format: 'list', unread: [...new Set(lines.filter((line) => !isPerson(line)))] };
}

/** Times and like counts ("2h 3 likes Reply") show that the text was copied from a comment section. */
const hasCommentDetails = (lines: string[]) =>
  lines.some((line) => isNoise(line) && /\d/.test(line) && !PROFILE_PIC.test(line));

/**
 * A line with only an account name starts a new comment; a line starting with "@" is a tag inside one.
 * A one-word comment ("vreau") looks like an account too: right below an account, it is that account's comment.
 */
function parseInstagram(lines: string[]): ParsedComments {
  const comments: Comment[] = [];
  const unread: string[] = [];
  const canRecognizeOneWord = hasCommentDetails(lines);
  let isBelowAccount = false;
  for (const line of lines.map((l) => l.trim()).filter((l) => !BADGE.test(l))) {
    if (isNoise(line)) {
      isBelowAccount = false;
      continue;
    }
    const current = comments.at(-1);
    const isOneWordComment = isBelowAccount && canRecognizeOneWord;
    const user: string = line.startsWith('@') || isOneWordComment ? '' : accountOf(line);
    if (user) comments.push({ user, name: `@${user}`, text: '' });
    else if (current) current.text = current.text ? `${current.text} ${line}` : line;
    else unread.push(line);
    isBelowAccount = user !== '';
  }
  return { comments, format: 'comments', unread };
}

/**
 * The organiser says where the text comes from, because the same line means different things:
 * "Ion Popescu" is a participant in a list, but part of a comment on Instagram.
 */
export function parseComments(text: string, source: GiveawaySource): ParsedComments {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(DIRECTION_MARKS, '').trimEnd())
    .filter((line) => line.trim());
  if (!lines.length) return { comments: [], format: source === 'list' ? 'list' : 'comments', unread: [] };
  return source === 'list' ? parseListed(lines) : parseInstagram(lines);
}

/** Lines that look like a list or a table rather than copied comments: the wrong source was probably chosen. */
export function looksListed(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const isTable = lines.filter((line) => line.includes('\t')).length >= lines.length / 2;
  const isAccounts = lines.every((line) => /^@?\S+$/.test(line.trim())) && !hasCommentDetails(lines);
  return lines.length > 0 && (isTable || isAccounts);
}

/** Distinct accounts tagged in a comment, without its author. */
export function mentions(text: string, author: string) {
  const accounts = [...text.replace(EMAIL, '').matchAll(/@([a-z0-9._]{1,30})/gi)].map((match) =>
    match[1].toLowerCase().replace(/\.+$/, ''),
  );
  return new Set(accounts.filter((account) => account && account !== author));
}

/** Excluded accounts, separated by commas or one per line (names with spaces work too). */
export function parseExclude(text: string) {
  const names = text.split(/\r?\n|[,;]/).map((name) => withoutAt(name.trim()).replace(/\s+/g, ' ').toLowerCase());
  return [...new Set(names.filter(Boolean))];
}

/** Why a comment is not valid; empty when it is. */
function rejectionReason({ user, text }: Comment, rules: Rules, hasText: boolean) {
  const author = user.toLowerCase();
  if (rules.exclude.includes(author)) return 'cont exclus';
  if (!hasText) return '';
  if (rules.minTags > 0 && mentions(text, author).size < rules.minTags) {
    return `mai puțin de ${rules.minTags} ${rules.minTags === 1 ? 'tag' : 'tag-uri'}`;
  }
  const keyword = rules.keyword.trim();
  if (keyword && !foldDiacritics(text).includes(foldDiacritics(keyword))) return `lipsește „${keyword}”`;
  return '';
}

/** Who takes part, with how many valid comments, and which comments were rejected. */
export function applyRules(comments: Comment[], rules: Rules, hasText: boolean) {
  const entrants = new Map<string, Entrant>();
  const rejected: Rejected[] = [];
  for (const comment of comments) {
    const key = comment.user.toLowerCase();
    const entrant = entrants.get(key) ?? { user: comment.user, name: comment.name, valid: 0 };
    entrants.set(key, entrant);
    const why = rejectionReason(comment, rules, hasText);
    if (why) rejected.push({ ...comment, why });
    else entrant.valid++;
  }
  const valid = [...entrants.values()].filter((entrant) => entrant.valid > 0);
  const weight = (entrant: Entrant) => (rules.mode === 'comment' ? entrant.valid : 1);
  return { valid, rejected, weight };
}
