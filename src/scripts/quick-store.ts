// What the quick tools save in the browser, shared between the tabs of the same tool.
import { listKey } from './quick';

export interface QuickResult {
  attempt: number;
  at: number;
}

export interface QuickState<R extends QuickResult> {
  v: 1;
  names: string;
  sound: boolean;
  result: R | null;
  /** How many times each list was drawn today, so that a redraw cannot pass for the first draw. */
  draws: { day: string; counts: Record<string, number> };
}

export function createQuickStore<R extends QuickResult, S extends QuickState<R>>(
  key: string,
  emptyState: () => S,
  isResult: (result: R) => boolean,
) {
  let isSaved = true;

  function read(): S | null {
    try {
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      const isUsable =
        state?.v === 1 &&
        typeof state.names === 'string' &&
        (state.result === null || isResult(state.result)) &&
        state.draws?.counts;
      return isUsable ? state : null;
    } catch {
      return null;
    }
  }

  return {
    load: () => read() ?? emptyState(),

    /** False when the browser cannot save (storage full or blocked): a reload loses the result. */
    save(state: S) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
        isSaved = true;
      } catch {
        isSaved = false;
      }
      return isSaved;
    },

    /** Another tab may have drawn meanwhile. What could not be saved is newer than the storage. */
    sync(state: S) {
      const saved = isSaved ? read() : null;
      if (saved) Object.assign(state, { result: saved.result, draws: saved.draws });
    },

    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // storage is blocked, so nothing was saved
      }
      return emptyState();
    },

    onOtherTab(action: () => void) {
      addEventListener('storage', (event) => {
        if (event.key === key) action();
      });
    },
  };
}

/** The number of this draw among those made today with the same list. */
export function countAttempt(state: QuickState<QuickResult>, names: string[]) {
  const day = new Date().toDateString();
  if (state.draws.day !== day) state.draws = { day, counts: {} };
  const key = listKey(names);
  return (state.draws.counts[key] = (state.draws.counts[key] ?? 0) + 1);
}

export const attemptText = ({ attempt }: QuickResult, action = 'tragere') =>
  attempt === 1 ? `Prima ${action} din zi cu această listă` : `A ${attempt}-a ${action} din zi cu această listă`;

export const isSameResult = (a: QuickResult | null, b: QuickResult | null) => JSON.stringify(a) === JSON.stringify(b);
