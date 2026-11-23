import { fieldValue } from './dom';
import { winnersOf } from './draw-state';
import {
  applyRules,
  looksListed,
  parseComments,
  parseExclude,
  type Comment,
  type GiveawayFormat,
  type GiveawaySource,
  type Rejected,
  type Rules,
} from './giveaway';
import type { Column, DrawKind, Prepared } from './kind';
import { chancesOf, hasUnequalChances, totalChances } from './people';
import { clampInt, escapeHtml, formatTime, plural } from './text';
import type { DrawState, GiveawayInfo, Person, Prize } from './types';

const MAX_WINNERS = 100;
const MAX_RESERVES = 20;
const MAX_REQUIRED_TAGS = 20;
const MAX_REJECTED_SHOWN = 300;
const MAX_PARTICIPANTS_SHOWN = 1000;
const MAX_UNREAD_SHOWN = 50;
const MAX_COMMENT_SHOWN = 140;
const TOP_CHANCES_SHOWN = 5;

const FORMAT_NAME: Record<GiveawayFormat, string> = {
  comments: 'comentarii copiate de pe Instagram',
  list: 'listă de participanți',
  table: 'tabel (participant + comentariu)',
};

const number: Column = ['Nr.', (row) => row.n];
const role: Column = ['Rol', (row) => row.label ?? ''];
const prize: Column = ['Premiu', (row) => row.prize];
const winner: Column = ['Câștigător', (row) => row.name];
const chances: Column = ['Șanse', (row) => chancesOf(row)];
const time: Column = ['Ora extragerii', (row) => formatTime(row.at)];

function readSource(): GiveawaySource {
  return fieldValue('gwSource') === 'list' ? 'list' : 'instagram';
}

function readRules(): Rules {
  return {
    minTags: clampInt(fieldValue('gwMinTags'), 0, MAX_REQUIRED_TAGS, 0),
    keyword: fieldValue('gwKeyword').trim(),
    exclude: parseExclude(fieldValue('gwExclude')),
    mode:
      document.querySelector<HTMLInputElement>('#app input[name="gwMode"]:checked')?.value === 'comment'
        ? 'comment'
        : 'person',
  };
}

function createPrizes(name: string, winners: number, reserves: number): Prize[] {
  const isSingle = winners === 1;
  return [
    ...Array.from({ length: winners }, (_, i): Prize => ({
      sponsor: '',
      prize: name,
      rar: isSingle ? 'legendary' : 'epic',
      label: isSingle ? 'Câștigător' : `Câștigător ${i + 1}`,
    })),
    ...Array.from({ length: reserves }, (_, i): Prize => ({
      sponsor: '',
      prize: name,
      rar: 'common',
      label: `Rezerva ${i + 1}`,
      reserve: true,
    })),
  ];
}

function countReasons(rejected: Rejected[]) {
  const counts = new Map<string, number>();
  rejected.forEach(({ why }) => counts.set(why, (counts.get(why) ?? 0) + 1));
  return [...counts].map(([why, n]) => ({ why, n }));
}

function setupError(comments: Comment[], list: Person[], prizes: Prize[]) {
  if (!comments.length) return 'Nu am găsit niciun participant în text. Verifică sursa aleasă.';
  if (!list.length) return 'Niciun comentariu nu respectă regulile.';
  if (prizes.length > list.length) {
    return `Ai cerut ${prizes.length} extrași (câștigători + rezerve), dar sunt doar ${plural(list.length, 'participant valid', 'participanți valizi')}.`;
  }
  return undefined;
}

function summaryText(info: GiveawayInfo, list: Person[]) {
  const analysed =
    info.format === 'list'
      ? plural(info.comments, 'rând', 'rânduri')
      : plural(info.comments, 'comentariu', 'comentarii');
  const chancesText =
    info.rules.mode === 'comment' ? ` · ${plural(totalChances(list), 'șansă', 'șanse')} în total` : '';
  return `${analysed} · ${plural(list.length, 'participant valid', 'participanți valizi')}${chancesText} · ${info.winners} + ${info.reserves} rezerve`;
}

function topChancesHtml(list: Person[]) {
  const top = [...list]
    .sort((a, b) => chancesOf(b) - chancesOf(a))
    .slice(0, TOP_CHANCES_SHOWN)
    .filter((person) => chancesOf(person) > 1);
  if (!top.length) return '';
  return `<div style="margin-top:6px"><b>Cele mai multe șanse:</b> ${top.map((person) => `${escapeHtml(person.name)} × ${person.w}`).join(', ')}</div>`;
}

function reportHtml({ format, rules, comments, validComments, rejected }: GiveawayInfo, list: Person[]) {
  const rulesIgnored = format === 'list' && (rules.minTags > 0 || rules.keyword);
  const reasons = rejected.map(({ why, n }) => `${escapeHtml(why)} (${n})`).join(', ');
  return (
    `<div><b>Format recunoscut:</b> ${FORMAT_NAME[format]}.</div>` +
    (rulesIgnored
      ? '<div style="margin-top:6px">Lista nu conține text de comentariu, așa că regulile despre tag-uri și cuvânt nu se pot aplica.</div>'
      : '') +
    `<div style="margin-top:6px"><b>Comentarii valide:</b> ${validComments} din ${comments}${reasons ? ` · <b>eliminate:</b> ${reasons}` : ''}</div>` +
    topChancesHtml(list)
  );
}

const noteHtml = (text: string) => `<div style="margin-top:6px">⚠️ ${text}</div>`;

function warningsHtml(text: string, source: GiveawaySource, list: Person[]) {
  const wrongSource = source === 'instagram' && looksListed(text);
  const hasNames = source === 'list' && list.some(({ name }) => /\s/.test(name));
  return (
    (wrongSource ? noteHtml('Textul pare o listă sau un tabel. Alege sursa „Listă sau tabel”.') : '') +
    (hasNames ? noteHtml('Numele nu sunt unice: persoanele cu același nume se consideră una singură.') : '')
  );
}

function participantsHtml(list: Person[]) {
  const names = list.slice(0, MAX_PARTICIPANTS_SHOWN).map(({ name }) => escapeHtml(name));
  const hidden = list.length - MAX_PARTICIPANTS_SHOWN;
  return `<details style="margin-top:6px"><summary><b>Participanți valizi (${list.length})</b></summary>${names.join(', ')}${hidden > 0 ? ` … și încă ${hidden}` : ''}</details>`;
}

function unreadHtml(unread: string[]) {
  if (!unread.length) return '';
  const rows = unread
    .slice(0, MAX_UNREAD_SHOWN)
    .map((line) => `<div>${escapeHtml(line.slice(0, MAX_COMMENT_SHOWN))}</div>`);
  const hidden = unread.length - MAX_UNREAD_SHOWN;
  return `<b>Rânduri ignorate, pe care nu le-am putut atribui cuiva (${unread.length}):</b>${rows.join('')}${hidden > 0 ? `<div>… și încă ${hidden}</div>` : ''}`;
}

function rejectedHtml(rejected: Rejected[]) {
  if (!rejected.length) return '';
  const rows = rejected.slice(0, MAX_REJECTED_SHOWN).map(({ name, text, why }) => {
    const quote = text ? `: <i>${escapeHtml(text.slice(0, MAX_COMMENT_SHOWN))}</i>` : '';
    return `<div><b>${escapeHtml(name)}</b> — ${escapeHtml(why)}${quote}</div>`;
  });
  const hidden = rejected.length - MAX_REJECTED_SHOWN;
  return `<b>Comentarii eliminate (${rejected.length}):</b>${rows.join('')}${hidden > 0 ? `<div>… și încă ${hidden}</div>` : ''}`;
}

function prepare(): Prepared {
  const source = readSource();
  const text = fieldValue('comments');
  const { comments, format, unread } = parseComments(text, source);
  const rules = readRules();
  const winners = clampInt(fieldValue('gwWinners'), 1, MAX_WINNERS, 1);
  const reserves = clampInt(fieldValue('gwReserves'), 0, MAX_RESERVES, 0);
  const prizeName = fieldValue('gwPrize').trim() || 'Premiul giveaway-ului';

  const { valid, rejected, weight } = applyRules(comments, rules, format !== 'list');
  const list = valid.map((entrant): Person => ({
    id: `u:${entrant.user.toLowerCase()}`,
    name: entrant.name,
    email: '',
    w: weight(entrant),
  }));
  const prizes = createPrizes(prizeName, winners, reserves);
  const info: GiveawayInfo = {
    rules,
    format,
    comments: comments.length,
    validComments: comments.length - rejected.length,
    rejected: countReasons(rejected),
    prize: prizeName,
    winners,
    reserves,
  };
  return {
    list,
    prizes,
    dupCount: 0,
    gw: info,
    error: setupError(comments, list, prizes),
    summary: summaryText(info, list),
    reportHtml: reportHtml(info, list) + participantsHtml(list),
    droppedHtml: warningsHtml(text, source, list) + unreadHtml(unread) + rejectedHtml(rejected),
  };
}

function positionText({ prizes, idx }: DrawState) {
  const current = prizes[idx];
  if (current.reserve) return `${current.label} · pentru cazul în care un câștigător nu răspunde`;
  const winners = prizes.filter((p) => !p.reserve).length;
  return winners > 1 ? `${current.label} din ${winners}` : 'Câștigătorul';
}

function finalView(state: DrawState) {
  const drawn = winnersOf(state);
  const winners = drawn.filter((r) => !r.reserve);
  const reserves = drawn.filter((r) => r.reserve);
  const reservesText = reserves.length ? ` · ${plural(reserves.length, 'rezervă', 'rezerve')}` : '';
  const winnersHtml = winners.map(
    (r) =>
      `<div class="fcard grand"><h3>🏆 ${escapeHtml(r.label ?? 'Câștigător')} · ${escapeHtml(r.prize)}</h3><div class="fw">${escapeHtml(r.name)}</div></div>`,
  );
  const reserveItems = reserves.map(
    (r) => `<li><div class="fw">${escapeHtml(r.name)}</div><div class="fp">${escapeHtml(r.label)}</div></li>`,
  );
  return {
    subtitle: `${plural(winners.length, 'câștigător', 'câștigători')}${reservesText} · ${state.all.length} participanți valizi · mulțumim tuturor!`,
    html:
      winnersHtml.join('') +
      (reserves.length ? `<div class="fcard"><h3>Rezerve, în ordine</h3><ul>${reserveItems.join('')}</ul></div>` : ''),
  };
}

function rulesText({ format, rules }: GiveawayInfo) {
  const hasText = format !== 'list';
  return [
    hasText && rules.minTags > 0 && `minim ${plural(rules.minTags, 'tag', 'tag-uri')} (@cont) în comentariu`,
    hasText && rules.keyword && `comentariul conține „${escapeHtml(rules.keyword)}”`,
    rules.exclude.length > 0 && `conturi excluse: ${rules.exclude.map(escapeHtml).join(', ')}`,
    rules.mode === 'comment'
      ? 'fiecare comentariu valid = o șansă'
      : 'o șansă de persoană, indiferent de numărul de comentarii',
  ]
    .filter(Boolean)
    .join('; ');
}

function factsHtml({ gw: info, all }: DrawState) {
  if (!info) return '';
  const rejected = info.rejected.map(({ why, n }) => `${escapeHtml(why)}: ${n}`).join('; ');
  const total = totalChances(all);
  const chancesText = total !== all.length ? ` (${total} șanse în total)` : '';
  return `
        <tr><td>Sursa participanților</td><td>${FORMAT_NAME[info.format]}</td></tr>
        <tr><td>${info.format === 'list' ? 'Rânduri în listă' : 'Comentarii analizate'}</td><td>${info.comments} (valide: ${info.validComments})</td></tr>
        <tr><td>Reguli</td><td>${rulesText(info)}</td></tr>
        <tr><td>Comentarii eliminate</td><td>${rejected || 'niciunul'}</td></tr>
        <tr><td>Participanți valizi</td><td>${all.length}${chancesText}</td></tr>
        <tr><td>Extrași</td><td>${plural(info.winners, 'câștigător', 'câștigători')} și ${plural(info.reserves, 'rezervă', 'rezerve')}; premiu: ${escapeHtml(info.prize)}</td></tr>`;
}

const columns = ({ all }: DrawState) => [number, role, prize, winner, ...(hasUnequalChances(all) ? [chances] : [])];

/** Winners and reserves, drawn from Instagram comments or from a list of participants. */
export const giveaway: DrawKind = {
  id: 'giveaway',
  storagePrefix: 'gw_',
  filePrefix: 'giveaway-',
  defaultTitle: 'Giveaway',
  defaultSubtitle: 'Giveaway · Extragere live',
  nextLabel: 'Următorul →',
  drawnUnit: 'extrași',
  prepare,
  positionText,
  remainingText: (count) => `${count} rămași`,
  winnerNote({ all }, person) {
    return hasUnequalChances(all) ? `${plural(chancesOf(person), 'șansă', 'șanse')} din ${totalChances(all)}` : '';
  },
  finalView,
  columns,
  sheetColumns: columns,
  csvColumns: (state) => [...columns(state), time],
  report: {
    title: 'Proces-verbal de extragere – giveaway',
    winnersHeading: 'Câștigători și rezerve',
    factsHtml,
    redrawColumns: [
      ['Poziția', (redraw, { prizes }) => `${redraw.idx + 1} – ${prizes[redraw.idx]?.label ?? ''}`],
      ['Persoană extrasă inițial (scoasă din joc)', (redraw) => redraw.name],
    ],
    toolScope: ' și aplică regulile introduse de organizator asupra textului lipit de acesta',
    organizerDuties: ' și a regulilor platformei',
  },
};
