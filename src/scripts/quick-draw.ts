// The quick tools on the page. Runs entirely in the browser; the names are only saved in localStorage.
import { createStageConfetti, prefersReducedMotion } from './confetti';
import { byId, fieldValue, isChecked, onConfirmedClick, showMessage } from './dom';
import {
  drawTeams,
  listKey,
  parseNames,
  peopleText,
  planError,
  repeatedNames,
  shuffle,
  teamCount,
  teamsText,
  type TeamMode,
} from './quick';
import { playFanfare, playTone } from './sound';
import { formatDate } from './text';

type QuickKind = 'echipe' | 'ordine';

interface QuickResult {
  /** The teams; for an order, a single group. */
  groups: string[][];
  attempt: number;
  at: number;
}

interface QuickState {
  v: 1;
  names: string;
  mode: TeamMode;
  value: string;
  sound: boolean;
  result: QuickResult | null;
  /** How many times each list was drawn today, so that a redraw cannot pass for the first draw. */
  draws: { day: string; counts: Record<string, number> };
}

const STEP_MS = 350;
const MAX_REVEAL_MS = 6000;
/** Without animation, so that a double click does not draw twice. */
const STILL_REVEAL_MS = 800;

function loadState(key: string): QuickState | null {
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const isResult = state?.result === null || Array.isArray(state?.result?.groups?.[0]);
    const isUsable = state?.v === 1 && typeof state.names === 'string' && isResult && state.draws?.counts;
    return isUsable ? state : null;
  } catch {
    return null;
  }
}

function emptyState(): QuickState {
  return { v: 1, names: '', mode: 'count', value: '2', sound: true, result: null, draws: { day: '', counts: {} } };
}

export function initQuickDraw() {
  const app = byId('quick');
  const kind: QuickKind = app.dataset.kind === 'ordine' ? 'ordine' : 'echipe';
  const storageKey = `ls_${kind}`;
  const fireConfetti = createStageConfetti(byId<HTMLCanvasElement>('conf'));
  const drawButton = byId<HTMLButtonElement>('quickDraw');
  const resetButton = byId<HTMLButtonElement>('quickReset');
  const teamMode = (): TeamMode => (isChecked('bySize') ? 'size' : 'count');
  let state = loadState(storageKey) ?? emptyState();
  let shown: QuickResult | null = null;
  let isBusy = false;
  let isSaved = true;

  const play: typeof playTone = (...tone) => {
    if (state.sound) playTone(...tone);
  };

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      isSaved = true;
    } catch {
      isSaved = false; // storage full or blocked: the tool works, but a reload loses the result
    }
    byId('quickUnsaved').hidden = isSaved;
  }

  /** Another tab may have drawn meanwhile. What could not be saved is newer than the storage. */
  function syncDraws() {
    const saved = isSaved ? loadState(storageKey) : null;
    if (saved) Object.assign(state, { result: saved.result, draws: saved.draws });
    if (!isBusy && state.result && JSON.stringify(state.result) !== JSON.stringify(shown)) showResult(state.result);
  }

  function showForm() {
    byId<HTMLTextAreaElement>('quickNames').value = state.names;
    byId<HTMLInputElement>('quickSound').checked = state.sound;
    if (kind === 'echipe') {
      byId<HTMLInputElement>(state.mode === 'size' ? 'bySize' : 'byCount').checked = true;
      byId<HTMLInputElement>('teamValue').value = state.value;
      showTeamLabel();
    }
  }

  function showTeamLabel() {
    byId('teamValue').setAttribute('aria-label', teamMode() === 'size' ? 'Oameni pe echipă' : 'Număr de echipe');
  }

  function readForm() {
    state.names = fieldValue('quickNames');
    state.sound = isChecked('quickSound');
    if (kind === 'echipe') {
      state.mode = teamMode();
      state.value = fieldValue('teamValue');
      showTeamLabel();
    }
  }

  function plan() {
    const names = parseNames(state.names);
    const teams = kind === 'echipe' ? teamCount(names.length, state.mode, Number(state.value)) : undefined;
    return { names, teams, error: planError(names.length, teams) };
  }

  function showPlan() {
    const { names, teams, error } = plan();
    const summary = () =>
      teams === undefined ? `${peopleText(names.length)} în listă.` : teamsText(names.length, teams);
    showMessage('quickPlan', names.length ? error || summary() : '', !!error);
    const repeated = repeatedNames(names);
    byId('quickRepeated').textContent = repeated.length
      ? `Apar de mai multe ori: ${repeated.join(', ')}. Rămân persoane diferite; adaugă o inițială ca să le deosebești.`
      : '';
  }

  function countAttempt(names: string[]) {
    const day = new Date().toDateString();
    if (state.draws.day !== day) state.draws = { day, counts: {} };
    const key = listKey(names);
    return (state.draws.counts[key] = (state.draws.counts[key] ?? 0) + 1);
  }

  const groupTitle = (index: number) => (kind === 'echipe' ? `Echipa ${index + 1}` : 'Ordinea');
  const attemptText = ({ attempt }: QuickResult) =>
    attempt === 1 ? 'Prima tragere din zi cu această listă' : `A ${attempt}-a tragere din zi cu această listă`;

  /** Empty groups and a function that puts each name in its place, in the order of the reveal. */
  function renderGroups(result: QuickResult) {
    shown = result;
    byId('quickResult').hidden = false;
    byId('quickAttempt').textContent = `${attemptText(result)} · ${formatDate(result.at)}`;
    byId('quickAttempt').classList.toggle('again', result.attempt > 1);
    const lists = result.groups.map((_members, index) => {
      const card = document.createElement('div');
      card.className = 'quick-group';
      const title = document.createElement('h3');
      title.textContent = groupTitle(index);
      const list = document.createElement(kind === 'ordine' ? 'ol' : 'ul');
      card.append(title, list);
      return { card, list };
    });
    byId('quickGroups').replaceChildren(...lists.map(({ card }) => card));
    const longest = Math.max(...result.groups.map((members) => members.length));
    const steps: (() => void)[] = [];
    for (let i = 0; i < longest; i++) {
      result.groups.forEach((members, group) => {
        if (i >= members.length) return;
        steps.push(() => {
          const item = document.createElement('li');
          item.textContent = members[i];
          lists[group].list.append(item);
        });
      });
    }
    return steps;
  }

  function showResult(result: QuickResult) {
    renderGroups(result).forEach((step) => step());
  }

  function setBusy(busy: boolean) {
    isBusy = busy;
    drawButton.disabled = isBusy;
    resetButton.disabled = isBusy;
    byId<HTMLButtonElement>('quickCopy').disabled = isBusy;
    drawButton.textContent = state.result ? 'Trage din nou' : 'Trage la sorți';
  }

  function finish() {
    setBusy(false);
    syncDraws();
    // a disabled button loses the focus
    if (document.activeElement === document.body) drawButton.focus({ preventScroll: true });
    showMessage('quickStatus', kind === 'echipe' ? 'Echipele sunt gata!' : 'Ordinea e gata!');
    playFanfare(play);
    fireConfetti();
  }

  function reveal(steps: (() => void)[]) {
    if (prefersReducedMotion()) {
      steps.forEach((step) => step());
      setTimeout(finish, STILL_REVEAL_MS);
      return;
    }
    const delay = Math.min(STEP_MS, MAX_REVEAL_MS / steps.length);
    const next = (index: number) => {
      if (index === steps.length) {
        finish();
        return;
      }
      steps[index]();
      play(600);
      setTimeout(() => next(index + 1), delay);
    };
    setTimeout(() => next(0), delay);
  }

  function draw() {
    syncDraws();
    readForm();
    showPlan();
    const { names, teams, error } = plan();
    if (error) {
      showMessage('quickPlan', error, true);
      return;
    }
    const groups = teams === undefined ? [shuffle(names)] : drawTeams(names, teams);
    // saved before the animation, so that reloading the page cannot be used to get another result
    state.result = { groups, attempt: countAttempt(names), at: Date.now() };
    save();
    setBusy(true);
    play(600); // iPhones only allow sound that starts in the click itself
    showMessage('quickStatus', '');
    const steps = renderGroups(state.result);
    byId('quickResult').scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    reveal(steps);
  }

  function resultText(result: QuickResult) {
    const lines =
      kind === 'echipe'
        ? result.groups.map((members, index) => `${groupTitle(index)}: ${members.join(', ')}`)
        : result.groups[0].map((name, index) => `${index + 1}. ${name}`);
    const heading = kind === 'echipe' ? 'Echipe trase la sorți' : 'Ordine trasă la sorți';
    return [`${heading} pe lasorti.ro`, '', ...lines, '', `${attemptText(result)}, ${formatDate(result.at)}`].join(
      '\n',
    );
  }

  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(resultText(shown));
      showMessage('quickStatus', 'Copiat! Lipește în grup.');
    } catch {
      showMessage('quickStatus', 'Copierea a eșuat. Selectează rezultatul și copiază-l manual.', true);
    }
  }

  function show(newState: QuickState) {
    state = newState;
    showForm();
    showPlan();
    byId('quickResult').hidden = !state.result;
    if (state.result) showResult(state.result);
    else shown = null;
    showMessage('quickStatus', '');
    setBusy(false);
  }

  function reset() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // storage is blocked, so nothing was saved
    }
    show(emptyState());
  }

  byId('quickForm').addEventListener('input', () => {
    syncDraws();
    readForm();
    showPlan();
    save();
  });
  byId('quickForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isBusy) draw();
  });
  byId('quickCopy').addEventListener('click', copy);
  onConfirmedClick(resetButton, reset);

  addEventListener('storage', (event) => {
    if (event.key === storageKey && !isBusy) show(loadState(storageKey) ?? emptyState());
  });

  show(state);
}
