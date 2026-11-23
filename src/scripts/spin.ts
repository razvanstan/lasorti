import { byId } from './dom';
import { randomInt } from './random';
import type { playTone } from './sound';
import type { Person } from './types';

const SPIN_MS = 3500;
const LONG_SPIN_MS = 5500;
const FASTEST_SWAP_MS = 25;
const SLOWDOWN_MS = 380;
const PAUSE_BEFORE_REVEAL_MS = 120;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 600;

export function runCountdown(play: typeof playTone, onDone: () => void) {
  const element = byId('cd');
  let remaining = COUNTDOWN_FROM;
  element.classList.add('go');
  function step() {
    if (remaining === 0) {
      element.classList.remove('go');
      element.innerHTML = '';
      onDone();
      return;
    }
    element.innerHTML = `<span>${remaining}</span>`;
    play(remaining === 1 ? 880 : 520, 0.18, 0.12);
    remaining--;
    setTimeout(step, COUNTDOWN_STEP_MS);
  }
  step();
}

interface SpinOptions {
  pool: Person[];
  winner: Person;
  isLong: boolean;
  play: typeof playTone;
  onDone: () => void;
}

/** Cycles through names, slowing down until it stops on the winner, who was already chosen. */
export function runSpin({ pool, winner, isLong, play, onDone }: SpinOptions) {
  const duration = isLong ? LONG_SPIN_MS : SPIN_MS;
  const slotName = byId('slotName');
  const start = performance.now();
  let lastSwap = 0;
  let hasLanded = false;

  function frame(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const interval = FASTEST_SWAP_MS + Math.pow(progress, 4) * SLOWDOWN_MS;
    if (!hasLanded && now - lastSwap >= interval) {
      lastSwap = now;
      // the last name shown before stopping is the winner's, so it does not look like someone else won
      hasLanded = duration - elapsed <= interval * 1.5;
      slotName.textContent = hasLanded ? winner.name : pool[randomInt(pool.length)].name;
      play(hasLanded ? 1200 : 700 + progress * 500);
    }
    if (progress < 1 && !hasLanded) requestAnimationFrame(frame);
    else setTimeout(onDone, PAUSE_BEFORE_REVEAL_MS);
  }
  requestAnimationFrame(frame);
}
