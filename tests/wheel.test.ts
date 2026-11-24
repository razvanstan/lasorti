import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitLabel, idleAngle, repeatedOptions, sliceAt, sliceColor, slicePath, wheelError } from '../src/scripts/wheel';
import { createPointer, gripOf, spinDuration, spinPath, wheelAngle } from '../src/scripts/wheel-motion';
import { mountWheel, unmountDrawApp, type MountedApp } from './helpers/draw-app';

describe('rules', () => {
  it('stops on the winner, between two pegs, whether or not the pointer catches', () => {
    for (let count = 2; count <= 40; count++)
      for (let winner = 0; winner < count; winner++)
        for (const within of [0, 0.5, 0.999])
          for (const catches of [false, true]) {
            const path = spinPath(winner, count, within, catches);
            const end = wheelAngle(path, spinDuration(path));
            expect(sliceAt(end, count)).toBe(winner);
            expect(end % (360 / count)).toBeGreaterThan(gripOf(count));
          }
  });

  it('goes on from where the wheel is, always forward', () => {
    for (const from of [-30, 0, 100, 1857]) {
      const path = spinPath(2, 6, 0.5, true, from);
      expect(wheelAngle(path, 0)).toBe(from);
      expect(path.rest - from).toBeGreaterThan(360 * 4);
      expect(path.rest - from).toBeLessThan(360 * 7);
      expect(sliceAt(path.rest, 6)).toBe(2);
    }
  });

  it('starts slowly', () => {
    const path = spinPath(0, 6, 0.5, false);
    expect(wheelAngle(path, 16)).toBeLessThan(2);
  });

  it('holds the pointer at a peg that pushes it', () => {
    const pointer = createPointer(6);
    pointer(60.5, 1 / 60);
    const { bend } = pointer(63, 1 / 60);
    expect(bend).toBeGreaterThan(10);
    expect(pointer(63, 1).bend).toBeGreaterThan(10);
    expect(pointer(80, 1 / 60).released).toBe(true);
    expect(Math.abs(pointer(90, 1).bend)).toBeLessThan(1);
  });

  it('never lets the last peg slip past when the pointer catches it', () => {
    for (let count = 2; count <= 40; count++) {
      const { peak, rest } = spinPath(0, count, 0.999, true);
      const size = 360 / count;
      const past = peak - Math.ceil(rest / size) * size;
      expect(past).toBeGreaterThan(0);
      expect(past).toBeLessThan(gripOf(count));
    }
  });

  it('bends the pointer at the pegs, within its limits, and lets it come back', () => {
    for (const count of [2, 8, 40]) {
      const path = spinPath(0, count, 0.5, true);
      const pointer = createPointer(count);
      const bends: number[] = [];
      let releases = 0;
      for (let ms = 0; ms <= spinDuration(path); ms += 1000 / 60) {
        const { bend, released } = pointer(wheelAngle(path, ms), 1 / 60);
        bends.push(bend);
        if (released) releases++;
      }
      expect(Math.max(...bends)).toBeGreaterThan(8);
      expect(Math.max(...bends)).toBeLessThan(30);
      expect(releases).toBeGreaterThan(5);
      expect(Math.abs(bends.at(-1)!)).toBeLessThan(2);
    }
  });

  it('never gives neighbours the same colour', () => {
    for (let count = 2; count <= 40; count++)
      for (let i = 0; i < count; i++) expect(sliceColor(i, count)).not.toBe(sliceColor((i + 1) % count, count));
  });

  it('draws slices clockwise from the top', () => {
    expect(slicePath(0, 4)).toBe('M0 0L0.000 -100.000A100 100 0 0 1 100.000 -0.000Z');
  });

  it('moves without jumps, slows down and stays still at the end', () => {
    const path = spinPath(3, 8, 0.5, true);
    let last = 0;
    for (let ms = 0; ms <= spinDuration(path) + 100; ms += 16) {
      const angle = wheelAngle(path, ms);
      expect(Math.abs(angle - last)).toBeLessThan(25);
      if (ms > 5000) expect(Math.abs(angle - last)).toBeLessThan(2);
      last = angle;
    }
    expect(last).toBe(path.rest);
  });

  it('shortens long labels without breaking emoji', () => {
    expect(fitLabel('Sushi de la colț', 5).lines).toEqual(['Sushi de', 'la colț']);
    expect(fitLabel('Sushi de la colț', 5).size).toBeGreaterThan(9);
    expect(fitLabel('Ana', 40).lines).toEqual(['Ana']);
    expect(fitLabel('🍕'.repeat(80), 40).lines[0]).toMatch(/^(🍕)+…$/u);
    expect(sliceAt(idleAngle(7), 7)).toBe(0);
  });

  it('limits the options and points out the repeated ones', () => {
    expect([wheelError(2), wheelError(40)]).toEqual(['', '']);
    expect(wheelError(1)).not.toBe('');
    expect(wheelError(41)).not.toBe('');
    expect(repeatedOptions(['Pizza', 'pizza', 'C++', 'C#'])).toEqual(['Pizza']);
  });
});

describe('page', () => {
  afterEach(() => unmountDrawApp());
  const OPTIONS = 'Pizza\nPaste\n<b>Supă</b>\nSalată';
  const angle = (app: MountedApp) =>
    Number(
      app
        .byId('wheelDisc')
        .getAttribute('transform')!
        .match(/-?[\d.]+/)![0],
    );
  const spinFully = async (app: MountedApp) => {
    await app.click('wheelSpin');
    await app.wait(8000);
  };

  it('saves the winner before spinning, stops on it and keeps it after a reload', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: OPTIONS });
    await app.click('wheelSpin');
    const { options, winner } = app.stored('ls_roata').result;
    expect(options).toEqual(OPTIONS.split('\n'));
    expect(app.byId('wheelResult').hidden).toBe(true);
    await app.wait(8000);
    expect(app.text('wheelWinner')).toBe(options[winner]);
    expect(sliceAt(angle(app), 4)).toBe(winner);
    const storage = app.storage();
    unmountDrawApp();

    const again = await mountWheel(storage);
    expect(again.text('wheelWinner')).toBe(options[winner]);
    expect(sliceAt(angle(again), 4)).toBe(winner);
    expect(again.byId('wheelDisc').querySelector('b')).toBeNull();
  });

  it('can stop on every option', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: OPTIONS });
    const winners = new Set<number>();
    let next = 0;
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint32Array) => array.fill(next++) });
    for (let i = 0; i < 4; i++) {
      await spinFully(app);
      winners.add(app.stored('ls_roata').result.winner);
    }
    expect([...winners].sort()).toEqual([0, 1, 2, 3]);
  });

  it('ignores clicks and edits while spinning', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: OPTIONS });
    await app.click('wheelSpin');
    await app.click('wheelSvg');
    await app.click('wheelSpin');
    expect(app.byId<HTMLTextAreaElement>('wheelOptions').readOnly).toBe(true);
    await app.wait(8000);
    expect(app.text('wheelAttempt')).toContain('Prima învârtire');
    await app.click('wheelSvg');
    await app.wait(8000);
    expect(app.text('wheelAttempt')).toContain('A 2-a învârtire');
    await app.click('wheelCopy');
    expect(app.clipboard[0]).toContain(`A ieșit: ${app.text('wheelWinner')}`);
    expect(app.clipboard[0]).toContain('A 2-a învârtire');
  });

  it('moves the pointer with the pegs and goes on from where it stopped', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: OPTIONS });
    const bend = () => Number(/rotate\(([-\d.e]+)/.exec(app.byId('wheelPointer').getAttribute('transform')!)![1]);
    await app.click('wheelSpin');
    let furthest = 0;
    for (let i = 0; i < 200; i++) {
      await app.wait(16);
      furthest = Math.min(furthest, bend());
    }
    expect(furthest).toBeLessThan(-15);
    await app.wait(8000);
    expect(Math.abs(bend())).toBe(0);
    expect(app.byId('wheelDisc').querySelector('.winner')!.textContent).toBe(app.text('wheelWinner'));
    const stopped = angle(app);
    await app.click('wheelSpin');
    expect(angle(app)).toBe(stopped);
    await app.wait(8000);
    expect(angle(app)).toBeGreaterThan(stopped + 1000);
  });

  it('keeps spinning when another tab changes something', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: OPTIONS });
    await app.click('wheelSpin');
    app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'ls_roata' }));
    expect(app.byId('wheelResult').hidden).toBe(true);
    expect(app.byId<HTMLButtonElement>('wheelSpin').disabled).toBe(true);
    await app.wait(8000);
    app.window.localStorage.removeItem('ls_roata');
    app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'ls_roata' }));
    expect(app.byId('wheelResult').hidden).toBe(true);
  });

  it('removes the winner, not another option, and copies the list that was spun', async () => {
    const app = await mountWheel();
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint32Array) => array.fill(2) });
    app.fill({ wheelOptions: 'Pizza\nPaste\nSalată\nSupă' });
    await spinFully(app);
    await app.click('wheelRemove');
    expect(app.byId<HTMLTextAreaElement>('wheelOptions').value).toBe('Pizza\nPaste\nSupă');
    expect(app.byId('wheel').classList.contains('won')).toBe(false);
    await app.click('wheelCopy');
    expect(app.clipboard[0]).toContain('Dintre: Pizza, Paste, Salată, Supă');
  });

  it('stays on a winner other than the first after a reload', async () => {
    const result = { options: ['a', 'b', 'c', 'd', 'e'], winner: 3, attempt: 1, at: 1 };
    const names = result.options.join('\n');
    const app = await mountWheel({
      ls_roata: JSON.stringify({ v: 1, names, sound: true, result, draws: { day: '', counts: {} } }),
    });
    expect(sliceAt(angle(app), 5)).toBe(3);
  });

  it('spins once on repeated clicks with reduced motion', async () => {
    const app = await mountWheel();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    app.fill({ wheelOptions: OPTIONS });
    await app.click('wheelSpin');
    await app.click('wheelSpin');
    await app.wait(1000);
    expect(app.text('wheelAttempt')).toContain('Prima învârtire');
  });

  it('removes the winner only once and keeps showing it', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: 'Pizza\nPizza\nPizza' });
    await spinFully(app);
    await app.click('wheelRemove');
    await app.click('wheelRemove');
    expect(app.byId<HTMLTextAreaElement>('wheelOptions').value).toBe('Pizza\nPizza');
    expect(app.text('wheelWinner')).toBe('Pizza');
    expect(app.stored('ls_roata').names).toBe('Pizza\nPizza');
    app.fill({ wheelOptions: 'Paste\nSupă' });
    expect(app.byId('wheelRemove').hidden).toBe(true);
  });

  it('counts a spin made in another tab and shows its result', async () => {
    const app = await mountWheel();
    app.fill({ wheelOptions: 'Ana\nIon' });
    await app.click('wheelSpin');
    const other = app.stored('ls_roata');
    other.result = { options: ['Xenia', 'Zoe'], winner: 1, attempt: 2, at: 1 };
    other.draws.counts = { 'ana\nion': 2 };
    app.window.localStorage.setItem('ls_roata', JSON.stringify(other));
    await app.wait(8000);
    expect(app.text('wheelWinner')).toBe('Zoe');
    await spinFully(app);
    expect(app.text('wheelAttempt')).toContain('A 3-a învârtire');
  });

  it('does not spin an unusable list, ignores unreadable data and clears everything', async () => {
    const app = await mountWheel({
      ls_roata: '{"v":1,"names":"x","draws":{"counts":{}},"result":{"options":["a","b"],"winner":7}}',
    });
    expect(app.byId('wheelResult').hidden).toBe(true);
    app.fill({ wheelOptions: 'Singur' });
    await app.click('wheelSpin');
    expect(app.byId('wheelPlan').className).toBe('msg err');
    app.fill({ wheelOptions: 'Ana\nIon' });
    await spinFully(app);
    await app.click('wheelReset');
    await app.click('wheelReset');
    expect(app.stored('ls_roata')).toBeNull();
    expect(app.byId('wheelResult').hidden).toBe(true);
  });
});
