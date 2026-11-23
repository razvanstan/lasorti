import type { Person } from './types';
import { chancesOf, hasUnequalChances, totalChances } from './people';

const UINT32_RANGE = 0x100000000;

/** Uniform integer in [0, n), from the browser's cryptographic generator. */
export function randomInt(n: number) {
  const buffer = new Uint32Array(1);
  // rejecting the incomplete last interval avoids modulo bias
  const limit = Math.floor(UINT32_RANGE / n) * n;
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % n;
}

/** Index of a random person, proportional to their number of chances. */
export function pickWeighted(pool: Person[]) {
  if (!hasUnequalChances(pool)) return randomInt(pool.length);
  let ticket = randomInt(totalChances(pool));
  return pool.findIndex((person) => (ticket -= chancesOf(person)) < 0);
}
