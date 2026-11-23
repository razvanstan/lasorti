import { byId, setVisible } from './dom';
import { canDraw, isLastPrize, winnersOf } from './draw-state';
import type { DrawKind } from './kind';
import { hasUnequalChances, totalChances } from './people';
import { RARITY_LABEL } from './prizes';
import { headerCells, resultRows, rowCells } from './results';
import { escapeHtml } from './text';
import { setTheme } from './theme';
import type { DrawState, Person, Prize } from './types';

const HASH_CHARS_SHOWN = 12;
const TICKER_MIN_SECONDS = 40;
const TICKER_SECONDS_PER_NAME = 2.2;
const HIDDEN_AT_FINAL = ['.prizecard', '#slot', '#winEmail', '.controls', '.left', '.progress', '#board'];

export function openStage(kind: DrawKind, state: DrawState) {
  const { meta } = state;
  setVisible(byId('setup'), false);
  setVisible(byId('stage'), true);
  document.body.classList.add('live');
  setTheme(meta.theme);
  byId('stageTitle').textContent = meta.title || kind.defaultTitle;
  byId('stageSub').textContent = meta.sub || kind.defaultSubtitle;
  const logo = byId<HTMLImageElement>('stageLogo');
  logo.hidden = !meta.logo;
  if (meta.logo) logo.src = meta.logo;
  buildTicker(state);
  scrollTo({ top: 0 });
}

export function setButtons(enabled: { draw: boolean; redraw: boolean; next: boolean }) {
  byId<HTMLButtonElement>('drawBtn').disabled = !enabled.draw;
  byId<HTMLButtonElement>('redrawBtn').disabled = !enabled.redraw;
  byId<HTMLButtonElement>('nextBtn').disabled = !enabled.next;
}

export function renderPoolInfo({ pool, meta }: DrawState) {
  const chances = hasUnequalChances(pool) ? ` (${totalChances(pool)} șanse)` : '';
  const hash = meta.hash ? ` · amprenta listei ${meta.hash.slice(0, HASH_CHARS_SHOWN)}…` : '';
  byId('poolInfo').textContent = `${pool.length} participanți în joc${chances}${hash}`;
}

const badgeText = (prize: Prize) => prize.label ?? RARITY_LABEL[prize.rar];

export function renderPrize(kind: DrawKind, state: DrawState) {
  const prize = state.prizes[state.idx];
  const sponsor = prize.sponsor ? `oferit de ${escapeHtml(prize.sponsor)}` : '';
  byId('pNum').textContent = kind.positionText(state);
  byId('pName').textContent = prize.prize;
  byId('pSponsor').innerHTML = `${sponsor}<div><span class="prar r">${escapeHtml(badgeText(prize))}</span></div>`;
  document.querySelector('.prizecard')!.className = `prizecard ${prize.rar}`;
  byId('slotName').textContent = '?';
  byId('nextBtn').textContent = kind.nextLabel;
  clearWinner();
}

export function clearWinner() {
  byId('slot').classList.remove('win');
  byId('winEmail').textContent = '';
}

export function renderWinner(kind: DrawKind, state: DrawState, winner: Person) {
  byId('slotName').textContent = winner.name;
  byId('slot').classList.add('win');
  byId('winEmail').textContent = kind.winnerNote(state, winner);
  setButtons({ draw: false, redraw: canDraw(state), next: true });
  if (isLastPrize(state)) byId('nextBtn').textContent = 'Final 🏁';
}

/** `justWon` is the index of the prize to highlight, or null. */
export function renderBoard(kind: DrawKind, state: DrawState, justWon: number | null) {
  const { prizes, results } = state;
  const drawn = winnersOf(state).length;
  byId('progTxt').textContent = `${drawn} / ${prizes.length}`;
  byId('progBar').style.width = `${prizes.length ? (drawn / prizes.length) * 100 : 0}%`;
  byId('progLeft').textContent = kind.remainingText(prizes.length - drawn);

  byId('board').innerHTML = prizes
    .map((prize, i) => {
      const result = results[i];
      const isCurrent = i === state.idx && !state.done;
      const status = result ? 'won' : isCurrent ? 'current' : 'upcoming';
      return (
        `<div class="tile ${prize.rar} ${status}${i === justWon ? ' justwon' : ''}"><span class="n">#${i + 1}</span>` +
        `<div class="r">${escapeHtml(badgeText(prize))}</div>` +
        `<div class="t" title="${escapeHtml(prize.prize)}">${escapeHtml(prize.prize)}</div>` +
        `<div class="s">${escapeHtml(prize.sponsor)}</div>` +
        (result ? `<div class="w">🏆 ${escapeHtml(result.name)}</div>` : '') +
        '</div>'
      );
    })
    .join('');
}

export function renderResults(kind: DrawKind, state: DrawState) {
  const columns = kind.columns(state);
  setVisible(byId('results'), true);
  byId('resHead').innerHTML = `<tr>${headerCells(columns)}</tr>`;
  byId('resBody').innerHTML = resultRows(state)
    .map((row) => `<tr>${rowCells(columns, row)}</tr>`)
    .join('');
}

export function renderFinal(kind: DrawKind, state: DrawState) {
  const app = byId('app');
  HIDDEN_AT_FINAL.forEach((selector) => setVisible(app.querySelector<HTMLElement>(selector), false));
  const { subtitle, html } = kind.finalView(state);
  byId('fSub').textContent = subtitle;
  byId('fGrid').innerHTML = html;
  setVisible(byId('finalView'), true);
  renderResults(kind, state);
  scrollTo({ top: 0, behavior: 'smooth' });
}

/** Decorative only, so Math.random is good enough. */
function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildTicker(state: DrawState) {
  const winners = winnersOf(state);
  const winnerIds = new Set(winners.map((winner) => winner.id));
  const poolIds = new Set(state.pool.map((person) => person.id));
  const isOutOfPool = ({ id }: Person, i: number) =>
    !poolIds.has(id) && winners.findIndex((winner) => winner.id === id) === i;
  const people = shuffle<Person>([...state.pool, ...winners.filter(isOutOfPool)]);
  const names = people
    .map(
      ({ id, name }) =>
        `<span data-id="${escapeHtml(id)}"${winnerIds.has(id) ? ' class="won"' : ''}>${escapeHtml(name)}</span>`,
    )
    .join('');
  const track = byId('track');
  track.innerHTML = names + names; // doubled, so that the animation loops without a gap
  track.style.setProperty('--dur', `${Math.max(TICKER_MIN_SECONDS, people.length * TICKER_SECONDS_PER_NAME)}s`);
  setVisible(byId('ticker'), true);
  document.body.classList.add('ticking');
}

function tickerEntries(id: string) {
  return [...document.querySelectorAll<HTMLElement>('#track span')].filter((entry) => entry.dataset.id === id);
}

export function markInTicker(id: string) {
  tickerEntries(id).forEach((entry) => entry.classList.add('won'));
}

export function removeFromTicker(id: string) {
  tickerEntries(id).forEach((entry) => entry.remove());
}
