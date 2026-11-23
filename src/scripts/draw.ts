// Runs entirely in the browser: nothing is sent to a server.
import { createConfetti, prefersReducedMotion } from './confetti';
import { byId, downloadFile, fieldValue, findById, isChecked, onConfirmedClick, setVisible, showMessage } from './dom';
import {
  canDraw,
  discardState,
  dropReplaced,
  isLastPrize,
  loadState,
  recordWinner,
  saveState,
  winnersOf,
} from './draw-state';
import { giveaway } from './giveaway-kind';
import type { DrawKind, Prepared } from './kind';
import { toggleMode } from './mode';
import { canonicalList, sha256 } from './people';
import { pickWeighted } from './random';
import { printReport, reportHtml } from './report';
import { toCsv, toSheetText } from './results';
import { initSetupForm } from './setup-form';
import { initSharePanel } from './share-panel';
import { playFanfare, playTone } from './sound';
import { runCountdown, runSpin } from './spin';
import * as view from './stage-view';
import { slugify } from './text';
import { readDedupe, tombola } from './tombola';
import type { DrawState, Person } from './types';

const EXTRA_CONFETTI_MS = [600, 1300];

export function initDrawApp() {
  const app = findById('app');
  if (!app) return;
  const isDemo = app.dataset.mode === 'demo';
  const kind = app.dataset.kind === 'giveaway' ? giveaway : tombola;
  const setupForm = initSetupForm(app, kind, isDemo);
  const draw = createDraw(kind, `ls_${isDemo ? 'demo_' : ''}${kind.storagePrefix}state`);

  byId('checkBtn').addEventListener('click', () => showCheck(kind.prepare()));
  byId('startBtn').addEventListener('click', () => startFromForm(kind, setupForm.logo(), draw.start));
  draw.offerResume();
  bindStage(kind, draw);
}

function showDropped(html: string) {
  const box = byId('dups');
  setVisible(box, !!html);
  box.innerHTML = html;
}

function fingerprintHtml(hash: string) {
  return `<div style="margin-top:6px"><b>Amprenta listei (SHA-256):</b> <span class="hash">${hash}</span><br>Poți publica amprenta înainte de extragere, ca oricine să verifice apoi că lista nu a fost modificată. <a href="#" id="dlList">Descarcă lista (.txt)</a> · <a href="/cum-functioneaza/#amprenta">ce înseamnă?</a></div>`;
}

function downloadList(title: string, people: Person[]) {
  downloadFile(`participanti-${slugify(title)}.txt`, canonicalList(people), 'text/plain;charset=utf-8');
}

async function showCheck(prepared: Prepared) {
  showDropped(prepared.droppedHtml);
  showMessage('setupMsg', prepared.error ?? prepared.summary, !!prepared.error);
  const box = byId('check');
  if (!prepared.list.length) {
    setVisible(box, false);
    return;
  }
  const hash = await sha256(canonicalList(prepared.list));
  box.innerHTML = prepared.reportHtml + (hash ? fingerprintHtml(hash) : '');
  setVisible(box, true);
  findById('dlList')?.addEventListener('click', (event) => {
    event.preventDefault();
    downloadList(fieldValue('evTitle'), prepared.list);
  });
}

async function startFromForm(kind: DrawKind, logo: string, start: (state: DrawState) => void) {
  const prepared = kind.prepare();
  showDropped(prepared.droppedHtml);
  if (prepared.error) {
    showMessage('setupMsg', prepared.error, true);
    return;
  }
  // options missing from a form count as unchecked
  const opts = {
    dedupe: kind.id === 'tombola' ? readDedupe() : undefined,
    dedupeColumn: fieldValue('dedupeColumn').trim(),
    multiWin: isChecked('multiWin'),
    grandLast: isChecked('grandLast'),
    sound: isChecked('sound'),
    countdown: isChecked('countdown'),
    showEmail: isChecked('showEmail'),
  };
  const hash = await sha256(canonicalList(prepared.list));
  start({
    v: 1,
    kind: kind.id,
    all: prepared.list,
    pool: [...prepared.list],
    prizes: prepared.prizes,
    idx: 0,
    results: [],
    done: false,
    redraws: [],
    opts,
    gw: prepared.gw,
    meta: {
      title: fieldValue('evTitle').trim(),
      sub: fieldValue('evSub').trim(),
      theme: fieldValue('theme'),
      logo,
      startedAt: Date.now(),
      endedAt: 0,
      hash,
      dupCount: prepared.dupCount,
    },
    ts: Date.now(),
  });
}

/** The draw itself: what happens on stage, from the first prize to the final screen. */
function createDraw(kind: DrawKind, storageKey: string) {
  let state: DrawState | null = null;
  let hasWinner = false;
  let isBusy = false;
  let isSaved = true;
  const fireConfetti = createStageConfetti();

  const play: typeof playTone = (...tone) => {
    if (state?.opts.sound) playTone(...tone);
  };

  function save() {
    if (!state) return;
    isSaved = saveState(storageKey, state);
    setVisible(byId('saveWarning'), !isSaved);
  }

  addEventListener('beforeunload', (event) => {
    if (!isSaved) event.preventDefault();
  });

  function showPrize() {
    if (!state) return;
    hasWinner = false;
    view.renderPrize(kind, state);
    view.setButtons({ draw: true, redraw: false, next: false });
    view.renderPoolInfo(state);
    view.renderBoard(kind, state, null);
    document.querySelector('.tile.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    save();
  }

  function start(newState: DrawState) {
    state = newState;
    view.openStage(kind, state);
    showPrize();
  }

  function draw() {
    if (!state || state.done || isBusy || !canDraw(state)) return;
    isBusy = true;
    view.setButtons({ draw: false, redraw: false, next: false });
    (document.activeElement as HTMLElement | null)?.blur(); // otherwise Space would press the focused button again
    view.clearWinner();
    dropReplaced(state);
    // saved before the animation, so that reloading the page cannot be used to get another winner
    const poolIndex = pickWeighted(state.pool);
    state.pending = poolIndex;
    save();
    if (state.opts.countdown) runCountdown(play, () => spin(poolIndex));
    else spin(poolIndex);
  }

  function spin(poolIndex: number) {
    if (!state) return;
    const { pool, prizes, idx } = state;
    const winner = pool[poolIndex];
    runSpin({ pool, winner, isLong: prizes[idx].rar === 'legendary', play, onDone: () => reveal(winner, poolIndex) });
  }

  function reveal(winner: Person, poolIndex: number) {
    if (!state) return;
    const replaced = recordWinner(state, winner, poolIndex);
    if (replaced) view.removeFromTicker(replaced.id);
    view.markInTicker(winner.id);
    playFanfare(play);
    fireConfetti();
    view.renderResults(kind, state);
    view.renderBoard(kind, state, state.idx);
    view.renderPoolInfo(state);
    view.renderWinner(kind, state, winner);
    hasWinner = true;
    isBusy = false;
    save();
  }

  function redraw() {
    if (isBusy) return;
    hasWinner = false;
    draw();
  }

  function next() {
    if (!state || isBusy || !hasWinner || state.done) return;
    if (!isLastPrize(state)) {
      state.idx++;
      showPrize();
      return;
    }
    state.done = true;
    state.meta.endedAt = Date.now();
    view.renderFinal(kind, state);
    fireConfetti();
    EXTRA_CONFETTI_MS.forEach((delay) => setTimeout(fireConfetti, delay));
    playFanfare(play);
    save();
  }

  function resume() {
    state = loadState(storageKey);
    if (!state) return;
    view.openStage(kind, state);
    if (state.done) {
      view.renderFinal(kind, state);
      return;
    }
    showPrize();
    const result = state.results[state.idx];
    if (result) {
      hasWinner = true;
      view.renderWinner(kind, state, result);
    }
    view.renderResults(kind, state);
    if (state.pending !== undefined) reveal(state.pool[state.pending], state.pending);
  }

  function offerResume() {
    const saved = loadState(storageKey);
    if (!saved) return;
    byId('resumeInfo').textContent = resumeText(kind, saved);
    setVisible(byId('resumeBox'), true);
    const startButton = byId<HTMLButtonElement>('startBtn');
    startButton.disabled = true;
    byId('resumeBtn').addEventListener('click', resume);
    byId('resetBtn').addEventListener('click', () => {
      discardState(storageKey);
      setVisible(byId('resumeBox'), false);
      startButton.disabled = false;
    });
  }

  return {
    start,
    draw,
    redraw,
    next,
    offerResume,
    state: () => state,
    isBusy: () => isBusy,
    /** Leaves the stage; the draw can be resumed. */
    exit() {
      if (isBusy) return;
      save();
      if (isSaved) location.reload();
    },
    /** Leaves the stage for good. */
    startOver() {
      discardState(storageKey);
      isSaved = true; // nothing left to lose
      location.reload();
    },
  };
}

type Draw = ReturnType<typeof createDraw>;

function resumeText(kind: DrawKind, saved: DrawState) {
  const winners = winnersOf(saved);
  const last = winners.at(-1);
  const title = saved.meta?.title ? `„${saved.meta.title}” – ` : '';
  if (saved.done) return `${title}încheiată, ${winners.length} ${kind.drawnUnit}.`;
  return `${title}${winners.length} / ${saved.prizes.length} ${kind.drawnUnit}${last ? `, ultimul extras: ${last.name}` : ''}.`;
}

function createStageConfetti() {
  const canvas = byId<HTMLCanvasElement>('conf');
  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };
  addEventListener('resize', resize);
  resize();
  const fire = createConfetti(canvas, {
    count: 220,
    colors: ['--acc', '--acc-hi', '--acc-pale', '--leg', '--ink'],
    fallbackColor: '#f2c35b',
    spread: 16,
    lift: 16,
    baseLift: 4,
    sizeRange: 7,
    baseSize: 4,
    gravity: 0.35,
    drag: 0.99,
    maxAge: 400,
    margin: 20,
  });
  return () => {
    if (!prefersReducedMotion()) fire(innerWidth / 2, innerHeight * 0.45);
  };
}

function bindStage(kind: DrawKind, draw: Draw) {
  byId('drawBtn').addEventListener('click', draw.draw);
  byId('redrawBtn').addEventListener('click', draw.redraw);
  byId('nextBtn').addEventListener('click', draw.next);
  byId('exitBtn').addEventListener('click', draw.exit);
  onConfirmedClick(byId('newBtn'), draw.startOver);
  bindKeyboard(draw);
  bindExports(kind, draw);
  initSharePanel(draw.state);
}

function bindKeyboard(draw: Draw) {
  document.addEventListener('keydown', (event) => {
    if (byId('stage').style.display !== 'block') return;
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes((event.target as HTMLElement).tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (draw.isBusy()) return;
      if (!byId<HTMLButtonElement>('drawBtn').disabled) draw.draw();
      else if (!byId<HTMLButtonElement>('nextBtn').disabled) draw.next();
    }
    const key = event.key.toLowerCase();
    if (key === 't') toggleMode();
    if (key === 'f') toggleFullscreen();
  });
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } catch {
    // not supported everywhere (e.g. iPhone); it is only a convenience
  }
}

function bindExports(kind: DrawKind, draw: Draw) {
  const onClick = (id: string, action: (state: DrawState) => void) =>
    byId(id).addEventListener('click', () => {
      const state = draw.state();
      if (state) action(state);
    });

  byId('tblBtn').addEventListener('click', () => {
    const table = byId('tableWrap');
    const isOpen = table.style.display === 'block';
    setVisible(table, !isOpen);
    byId('tblBtn').textContent = isOpen ? 'Arată tabelul' : 'Ascunde tabelul';
  });
  onClick('copyBtn', async (state) => {
    try {
      await navigator.clipboard.writeText(toSheetText(kind, state));
      showMessage('copyMsg', 'Copiat! Lipește în Sheet/Excel (celula A2).');
    } catch {
      showMessage('copyMsg', 'Copierea a eșuat. Folosește butonul CSV.', true);
    }
  });
  onClick('csvBtn', (state) =>
    downloadFile(`castigatori-${slugify(state.meta.title)}.csv`, toCsv(kind, state), 'text/csv;charset=utf-8'),
  );
  onClick('listBtn', (state) => downloadList(state.meta.title, state.all));

  const report = byId('pv');
  document.body.appendChild(report); // the print styles need it as a direct child of <body>
  onClick('pvBtn', (state) => printReport(report, reportHtml(kind, state)));
}
