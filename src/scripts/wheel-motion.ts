// How the wheel and its pointer move. Only looks: the winner is already chosen and saved.

const TURNS = 6;
export const SPIN_MS = 5600;
const PUSH_MS = 500;
export const SETTLE_MS = 1100;
/** How far a peg pushes the pointer before it slips past, in degrees of the wheel. */
const GRIP = 6;
/** Degrees of the pointer for each degree of the wheel. */
const LEVER = 4.6;
const STIFFNESS = 900;
const DAMPING = 16;
const MAX_STEP_S = 1 / 120;

/** On small slices a peg lets go earlier, so that the pointer rests between two pegs. */
export const gripOf = (count: number) => Math.min(GRIP, (360 / count) * 0.4);

/** Degrees the wheel has turned past the last peg. */
function pastPeg(angle: number, count: number) {
  const size = 360 / count;
  return ((angle % size) + size) % size;
}

export interface SpinPath {
  from: number;
  /** Where the wheel is at its furthest, then where it stays. */
  peak: number;
  rest: number;
}

/**
 * Ends on the winner. With `catches`, the last peg is too much for the wheel: it bends the pointer,
 * but the pointer pushes the wheel back.
 */
export function spinPath(winner: number, count: number, within: number, catches: boolean, from = 0): SpinPath {
  const size = 360 / count;
  const grip = gripOf(count);
  // the same slice, counted in whole turns after where the wheel is now
  const start = 360 * (Math.ceil(from / 360) + TURNS) - (winner + 1) * size;
  if (catches) {
    const push = grip * (0.45 + 0.4 * within);
    return { from, peak: start + size + push, rest: start + size - Math.min(4, size * 0.3) };
  }
  const nearest = grip + size * 0.06;
  const rest = start + nearest + (size * 0.94 - nearest) * within;
  return { from, peak: rest, rest };
}

export const spinDuration = ({ peak, rest }: SpinPath) => SPIN_MS + (peak === rest ? 0 : SETTLE_MS);

/** Progress (0–1) of a wheel that needs a moment to get going. */
function pushed(ms: number) {
  const done = ms < PUSH_MS ? ms ** 2 / (2 * PUSH_MS) : ms - PUSH_MS / 2;
  return done / (SPIN_MS - PUSH_MS / 2);
}

export function wheelAngle({ from, peak, rest }: SpinPath, ms: number) {
  if (ms < SPIN_MS) return from + (peak - from) * (1 - (1 - pushed(Math.max(0, ms))) ** 3.4);
  const settled = Math.min(1, (ms - SPIN_MS) / SETTLE_MS);
  if (settled === 1 || peak === rest) return rest;
  return rest + (peak - rest) * Math.exp(-5 * settled) * Math.cos(9 * settled) * (1 - settled);
}

/** The pointer: a spring that pegs push aside. Each step returns its angle and whether it just slipped off a peg. */
export function createPointer(count: number) {
  const size = 360 / count;
  const grip = gripOf(count);
  let bend = 0;
  let speed = 0;
  let lastAngle: number | null = null;

  return (angle: number, seconds: number) => {
    const past = pastPeg(angle, count);
    const from = lastAngle ?? angle;
    // a peg lets go when the wheel turns past the grip; several may do so between two frames
    const released = Math.floor((angle - grip) / size) > Math.floor((from - grip) / size);
    lastAngle = angle;
    if (released) {
      bend = Math.max(bend, grip * LEVER);
      speed = 0;
    }
    for (let left = seconds; left > 1e-9; left -= MAX_STEP_S) {
      const step = Math.min(left, MAX_STEP_S);
      speed += (-STIFFNESS * bend - DAMPING * speed) * step;
      bend += speed * step;
    }
    const pushed = past < grip ? past * LEVER : 0;
    if (past < grip && bend < pushed) {
      bend = pushed;
      speed = 0;
    }
    bend = Math.max(-grip * LEVER * 0.4, Math.min(grip * LEVER, bend));
    return { bend, released };
  };
}
