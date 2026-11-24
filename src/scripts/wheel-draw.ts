// The wheel on the page. Runs entirely in the browser; the options are only saved in localStorage.
import { createStageConfetti, prefersReducedMotion } from './confetti';
import { byId, fieldValue, isChecked, onConfirmedClick, showMessage } from './dom';
import { countText, parseNames } from './quick';
import {
  attemptText,
  countAttempt,
  createQuickStore,
  isSameResult,
  type QuickResult,
  type QuickState,
} from './quick-store';
import { randomInt } from './random';
import { playFanfare, playTone } from './sound';
import { formatDate } from './text';
import { fitLabel, idleAngle, LABEL_END, pegAt, repeatedOptions, sliceColor, slicePath, wheelError } from './wheel';
import { createPointer, spinDuration, spinPath, wheelAngle } from './wheel-motion';

interface WheelResult extends QuickResult {
  options: string[];
  winner: number;
}
type WheelState = QuickState<WheelResult>;

/** Without animation, so that a double click does not spin twice. */
const STILL_SPIN_MS = 800;
const TICK_HZ = 1100;
/** How often the pointer catches the last peg. */
const CATCH_CHANCE = 0.6;
/** A tab left in the background must not throw the pointer around. */
const MAX_FRAME_S = 0.1;
const EMPTY_SLICES = 6;
const SVG = 'http://www.w3.org/2000/svg';

const emptyState = (): WheelState => ({
  v: 1,
  names: '',
  sound: true,
  result: null,
  draws: { day: '', counts: {} },
});

const isResult = ({ options, winner }: WheelResult) =>
  Array.isArray(options) && options.length > 1 && options.every((o) => typeof o === 'string') && winner in options;

export function initWheel() {
  const store = createQuickStore<WheelResult, WheelState>('ls_roata', emptyState, isResult);
  const fireConfetti = createStageConfetti(byId<HTMLCanvasElement>('conf'));
  const disc = document.getElementById('wheelDisc')!;
  const namesField = byId<HTMLTextAreaElement>('wheelOptions');
  const spinButton = byId<HTMLButtonElement>('wheelSpin');
  const removeButton = byId<HTMLButtonElement>('wheelRemove');
  let state = store.load();
  let shown: WheelResult | null = null;
  let isBusy = false;
  let isRemoved = false;
  let angle = 0;

  const play: typeof playTone = (...tone) => {
    if (state.sound) playTone(...tone);
  };
  const options = () => parseNames(state.names);
  const bendPointer = (degrees: number) =>
    document.getElementById('wheelPointer')!.setAttribute('transform', `rotate(${-degrees} 0 -115)`);
  const turn = (degrees: number) => {
    angle = degrees;
    disc.setAttribute('transform', `rotate(${degrees})`);
  };

  function save() {
    byId('wheelUnsaved').hidden = store.save(state);
  }

  function svg(name: string, attributes: Record<string, string | number>) {
    const element = document.createElementNS(SVG, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function slice(option: string, index: number, count: number) {
    const group = svg('g', { class: `slice c${sliceColor(index, count)}` });
    const label = fitLabel(option, count);
    const text = svg('text', {
      transform: `rotate(${((index + 0.5) * 360) / count - 90})`,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
      'font-size': label.size,
    });
    label.lines.forEach((line, i) => {
      const y = (i - (label.lines.length - 1) / 2) * label.size * 1.1;
      const span = svg('tspan', { x: LABEL_END, y });
      span.textContent = line;
      text.append(span);
    });
    group.append(svg('path', { d: slicePath(index, count) }), text);
    return group;
  }

  /** The room was estimated from the number of letters; wide ones (or emoji) need a smaller size. */
  function shrinkWideLabels(list: string[]) {
    disc.querySelectorAll('text').forEach((text, i) => {
      const { room, size } = fitLabel(list[i], list.length);
      const lines = [...text.querySelectorAll('tspan')];
      const widest = Math.max(...lines.map((line) => line.getComputedTextLength?.() ?? 0));
      if (widest > room) text.setAttribute('font-size', String((size * room) / widest));
    });
  }

  function renderWheel(list: string[]) {
    const isUsable = !wheelError(list.length);
    const slices = isUsable ? list : Array<string>(EMPTY_SLICES).fill('');
    disc.replaceChildren(
      ...slices.map((option, i) => slice(option, i, slices.length)),
      ...slices.map((_option, i) => svg('circle', { class: 'peg', r: 2, ...pegAt(i, slices.length) })),
    );
    if (isUsable) shrinkWideLabels(list);
    byId('wheel').classList.remove('won');
    byId('wheel').classList.toggle('empty', !isUsable);
    byId('wheelSvg').setAttribute(
      'aria-label',
      isUsable ? `Roata cu ${countText(list.length, 'opțiune', 'opțiuni')}` : 'Roata, încă fără opțiuni',
    );
  }

  /** The current list, stopped on the winner if it is the list that was spun. */
  function renderCurrent() {
    const list = options();
    renderWheel(list);
    if (!shown || list.join('\n') !== shown.options.join('\n')) {
      turn(idleAngle(Math.max(2, list.length)));
      return;
    }
    turn(spinPath(shown.winner, list.length, 0.5, false).rest);
    markWinner(shown);
  }

  function markWinner({ winner }: WheelResult) {
    byId('wheel').classList.add('won');
    disc.children[winner].classList.add('winner');
  }

  function showPlan() {
    const list = options();
    const error = wheelError(list.length);
    const text = error || `${countText(list.length, 'opțiune', 'opțiuni')} pe roată.`;
    showMessage('wheelPlan', list.length ? text : '', !!error);
    const repeated = repeatedOptions(list);
    byId('wheelRepeated').textContent = repeated.length
      ? `Apar de mai multe ori, deci au mai multe șanse: ${repeated.join(', ')}.`
      : '';
  }

  function showResult(result: WheelResult) {
    shown = result;
    byId('wheelResult').hidden = false;
    byId('wheelWinner').textContent = result.options[result.winner];
    byId('wheelAttempt').textContent = `${attemptText(result, 'învârtire')} · ${formatDate(result.at)}`;
    byId('wheelAttempt').classList.toggle('again', result.attempt > 1);
    showRemove();
  }

  function showRemove() {
    removeButton.hidden = isRemoved || !shown || !options().includes(shown.options[shown.winner]);
  }

  function setBusy(busy: boolean) {
    isBusy = busy;
    namesField.readOnly = busy;
    spinButton.disabled = busy;
    removeButton.disabled = busy;
    byId<HTMLButtonElement>('wheelReset').disabled = busy;
    byId('wheel').classList.toggle('spinning', busy);
    spinButton.textContent = state.result ? 'Învârte din nou' : 'Învârte roata';
  }

  /** What another tab did meanwhile. */
  function syncDraws() {
    store.sync(state);
    if (isBusy || !state.result || isSameResult(state.result, shown)) return;
    showResult(state.result);
    renderCurrent();
  }

  function reveal(id: string) {
    byId(id).scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function finish(result: WheelResult) {
    showResult(result);
    markWinner(result);
    setBusy(false);
    syncDraws();
    // a disabled button loses the focus
    if (document.activeElement === document.body) spinButton.focus({ preventScroll: true });
    reveal('wheelResult');
    playFanfare(play);
    fireConfetti();
  }

  function animate(result: WheelResult) {
    const count = result.options.length;
    // only how it gets to the winner
    const path = spinPath(result.winner, count, Math.random(), Math.random() < CATCH_CHANCE, angle);
    if (prefersReducedMotion()) {
      turn(path.rest);
      setTimeout(() => finish(result), STILL_SPIN_MS);
      return;
    }
    const startedAt = performance.now();
    const pointer = createPointer(count);
    let last = startedAt;
    const frame = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const turned = wheelAngle(path, elapsed);
      const { bend, released } = pointer(turned, Math.min(MAX_FRAME_S, Math.max(0, now - last) / 1000));
      last = now;
      turn(turned);
      bendPointer(bend);
      if (released) play(TICK_HZ, 0.02, 0.06);
      if (elapsed < spinDuration(path)) {
        requestAnimationFrame(frame);
        return;
      }
      bendPointer(0);
      finish(result);
    };
    requestAnimationFrame(frame);
  }

  function spin() {
    if (isBusy) return;
    syncDraws();
    readForm();
    showPlan();
    const list = options();
    const error = wheelError(list.length);
    if (error) {
      showMessage('wheelPlan', error, true);
      return;
    }
    // saved before the animation, so that reloading the page cannot be used to get another result
    const result = {
      options: list,
      winner: randomInt(list.length),
      attempt: countAttempt(state, list),
      at: Date.now(),
    };
    state.result = result;
    isRemoved = false;
    save();
    setBusy(true);
    play(TICK_HZ); // iPhones only allow sound that starts in the click itself
    showMessage('wheelStatus', '');
    byId('wheelWinner').textContent = '';
    byId('wheelResult').hidden = true;
    renderWheel(list);
    reveal('wheel');
    animate(result);
  }

  function readForm() {
    state.names = fieldValue('wheelOptions');
    state.sound = isChecked('wheelSound');
  }

  function showForm() {
    namesField.value = state.names;
    byId<HTMLInputElement>('wheelSound').checked = state.sound;
  }

  function removeWinner() {
    if (isBusy || isRemoved || !shown) return;
    syncDraws();
    const list = options();
    const index = list.indexOf(shown.options[shown.winner]);
    if (index < 0) return;
    list.splice(index, 1);
    isRemoved = true;
    state.names = list.join('\n');
    showForm();
    showPlan();
    renderCurrent();
    showRemove();
    showMessage('wheelStatus', `Scos de pe roată. În joc: ${countText(list.length, 'opțiune', 'opțiuni')}.`);
    save();
    spinButton.focus({ preventScroll: true }); // the pressed button is hidden now
  }

  async function copy() {
    if (!shown) return;
    const text = [
      'Roata norocului pe lasorti.ro',
      '',
      `A ieșit: ${shown.options[shown.winner]}`,
      `Dintre: ${shown.options.join(', ')}`,
      '',
      `${attemptText(shown, 'învârtire')}, ${formatDate(shown.at)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showMessage('wheelStatus', 'Copiat! Lipește în grup.');
    } catch {
      showMessage('wheelStatus', 'Copierea a eșuat. Selectează rezultatul și copiază-l manual.', true);
    }
  }

  function show(newState: WheelState) {
    state = newState;
    shown = null;
    isRemoved = false;
    showForm();
    showPlan();
    byId('wheelResult').hidden = !state.result;
    if (state.result) showResult(state.result);
    renderCurrent();
    showMessage('wheelStatus', '');
    setBusy(false);
  }

  byId('wheelForm').addEventListener('input', (event) => {
    syncDraws();
    readForm();
    save();
    if (isBusy || event.target !== namesField) return;
    showPlan();
    renderCurrent();
    showRemove();
  });
  byId('wheelForm').addEventListener('submit', (event) => event.preventDefault());
  spinButton.addEventListener('click', spin);
  byId('wheelSvg').addEventListener('click', spin);
  removeButton.addEventListener('click', removeWinner);
  byId('wheelCopy').addEventListener('click', copy);
  onConfirmedClick(byId('wheelReset'), () => {
    if (!isBusy) show(store.clear());
  });
  store.onOtherTab(() => {
    if (!isBusy) show(store.load());
  });

  show(state);
}
