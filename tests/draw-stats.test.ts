import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { countDraw } from '../src/scripts/stats';
import { mountDrawApp, unmountDrawApp } from './helpers/draw-app';

vi.mock('../src/scripts/stats', () => ({ countDraw: vi.fn() }));

beforeEach(() => vi.mocked(countDraw).mockClear());
afterEach(() => unmountDrawApp());

async function drawTwoPrizes(demo: boolean) {
  const app = await mountDrawApp({ demo });
  app.fill({ people: 'Ana\nIon\nMaria\nDan', prizes: 'Cafenea | Voucher\nStudio | Tricou' });
  await app.click('startBtn');
  await app.click('drawBtn');
  await app.waitForReveal();
  await app.click('nextBtn');
  await app.click('drawBtn');
  await app.waitForReveal();
  await app.click('redrawBtn');
  await app.waitForReveal();
  await app.click('nextBtn');
}

it('counts a draw once when it starts and once when the last prize is drawn, whatever is redrawn', async () => {
  await drawTwoPrizes(false);
  expect(vi.mocked(countDraw).mock.calls).toEqual([
    ['tombola', 'start'],
    ['tombola', 'end'],
  ]);
});

it('does not count the demo', async () => {
  await drawTwoPrizes(true);
  expect(countDraw).not.toHaveBeenCalled();
});
