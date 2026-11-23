import type { DrawState, Person, Result } from './types';

/** Null when nothing usable is saved. */
export function loadState(key: string): DrawState | null {
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const isUsable = state?.v === 1 && Array.isArray(state.prizes) && state.prizes.length && Array.isArray(state.pool);
    return isUsable ? state : null;
  } catch {
    return null;
  }
}

const backupKey = (key: string) => `${key}_backup`;

function tryToStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function tryToRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage is blocked, so there is nothing to remove
  }
}

/** False when the browser cannot save (storage full or blocked), so the draw would be lost on a reload. */
export function saveState(key: string, state: DrawState) {
  state.ts = Date.now();
  const value = JSON.stringify(state);
  if (tryToStore(key, value)) return true;
  // the draw in progress matters more than the backup of an old one
  tryToRemove(backupKey(key));
  return tryToStore(key, value);
}

/** Discards the saved draw, keeping one backup (if there is room for it) in case it was a mistake. */
export function discardState(key: string) {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(key);
  } catch {
    // storage is blocked, so nothing was saved
  }
  // removed first: there may not be room for both
  tryToRemove(key);
  if (saved) tryToStore(backupKey(key), saved);
}

export function winnersOf(state: DrawState) {
  return state.results.filter((result) => result !== null && result !== undefined);
}

export const isLastPrize = (state: DrawState) => state.idx === state.prizes.length - 1;

/** Whoever is being replaced leaves the draw, even when people may win several prizes. */
export function dropReplaced(state: DrawState) {
  const replaced = state.results[state.idx];
  if (replaced) state.pool = state.pool.filter(({ id }) => id !== replaced.id);
}

/** Someone other than the current winner must be left. */
export const canDraw = (state: DrawState) => state.pool.some(({ id }) => id !== state.results[state.idx]?.id);

/** Takes the person out of the pool (unless they may win again) and gives them the current prize. Returns whoever they replaced, if anyone. */
export function recordWinner(state: DrawState, winner: Person, poolIndex: number): Result | null {
  delete state.pending;
  if (!state.opts.multiWin) state.pool.splice(poolIndex, 1);
  const replaced = state.results[state.idx] ?? null;
  if (replaced)
    state.redraws.push({
      idx: state.idx,
      name: replaced.name,
      email: replaced.email,
      key: replaced.key,
      at: Date.now(),
    });
  state.results[state.idx] = { ...state.prizes[state.idx], ...winner, at: Date.now() };
  return replaced;
}
