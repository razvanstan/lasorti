import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countText,
  drawTeams,
  listKey,
  parseNames,
  planError,
  repeatedNames,
  shuffle,
  teamCount,
  teamSizes,
  teamsText,
} from '../src/scripts/quick';
import { mountQuickDraw, unmountDrawApp } from './helpers/draw-app';

describe('rules', () => {
  it('reads names by line or comma, without list markers, keeping people with the same name', () => {
    expect(parseNames('1. Ana\n2) Ion  Pop\r\n- Dan, Ana;\n\n 3 ')).toEqual(['Ana', 'Ion Pop', 'Dan', 'Ana', '3']);
    expect(parseNames('1. Ana\n2.Ion\n3.\n4. \n-\n• Dan')).toEqual(['Ana', 'Ion', 'Dan']);
    expect(parseNames('1. - Ana\n\u200e\n—\n- 2. Ion')).toEqual(['Ana', 'Ion']);
    expect(repeatedNames(['Ștefan', 'stefan', 'Ana', '🙂'])).toEqual(['Ștefan']);
    expect(listKey(['Ion', 'Ana'])).toBe(listKey(['ana', 'ION']));
  });

  it('splits as equally as possible', () => {
    expect(teamSizes(6, 3)).toEqual([2, 2, 2]);
    expect(teamSizes(7, 3)).toEqual([3, 2, 2]);
    expect(teamCount(7, 'size', 2)).toBe(4);
    expect(teamsText(6, 3)).toBe('6 oameni → 3 echipe de 2.');
    expect(teamsText(7, 3)).toContain('1 echipă de 3 și 2 echipe de 2.');
    expect(countText(20, 'om', 'oameni')).toBe('20 de oameni');
    expect(countText(101, 'om', 'oameni')).toBe('101 oameni');
  });

  it('refuses impossible splits', () => {
    expect(planError(1)).not.toBe('');
    expect(planError(500)).toBe('');
    expect(planError(501)).not.toBe('');
    expect(planError(0, teamCount(0, 'size', 2))).toBe('Scrie cel puțin două nume.');
    for (const teams of [0, 1, 1.5, NaN, 7, Infinity, -1]) expect(planError(6, teams)).not.toBe('');
    expect(planError(6, 3)).toBe('');
  });

  it('gives every order the same chance', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 12000; i++) {
      const key = shuffle(['a', 'b', 'c']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) expect(Math.abs(count - 2000)).toBeLessThan(250);
  });

  it('keeps everyone and draws which team is larger', () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const larger = [0, 0];
    for (let i = 0; i < 4000; i++) {
      const teams = drawTeams(names, 2);
      expect(teams.flat().sort()).toEqual(names);
      larger[teams[0].length === 3 ? 0 : 1]++;
    }
    expect(Math.abs(larger[0] - 2000)).toBeLessThan(250);
  });

  it('gives everyone the same chance to be with anyone else', () => {
    const mates = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const team = drawTeams(['a', 'b', 'c', 'd'], 2).find((members) => members.includes('a'))!;
      const mate = team.find((name) => name !== 'a')!;
      mates.set(mate, (mates.get(mate) ?? 0) + 1);
    }
    expect(mates.size).toBe(3);
    for (const count of mates.values()) expect(Math.abs(count - 2000)).toBeLessThan(250);
  });
});

describe('page', () => {
  afterEach(() => unmountDrawApp());
  const submit = async (app: Awaited<ReturnType<typeof mountQuickDraw>>) => {
    app.byId('quickForm').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
    await app.flush();
  };
  const NAMES = 'Ana\nMihai\nIoana\nVlad\nElena\n<b>Dan</b>';

  it('saves the teams before revealing them, and shows the same ones after a reload', async () => {
    const app = await mountQuickDraw('echipe');
    app.fill({ quickNames: NAMES, teamValue: '3' });
    expect(app.text('quickPlan')).toBe('6 oameni → 3 echipe de 2.');
    await submit(app);
    const saved = app.stored('ls_echipe').result;
    expect(saved.groups.map((group: string[]) => group.length)).toEqual([2, 2, 2]);
    expect(app.byId('quickGroups').querySelectorAll('li')).toHaveLength(0);
    expect(app.byId<HTMLButtonElement>('quickDraw').disabled).toBe(true);
    const storage = app.storage();
    unmountDrawApp();

    const again = await mountQuickDraw('echipe', storage);
    const shown = [...again.byId('quickGroups').querySelectorAll('ul')].map((list) =>
      [...list.children].map((item) => item.textContent),
    );
    expect(shown).toEqual(saved.groups);
    expect(again.byId('quickGroups').querySelector('b')).toBeNull();
  });

  it('labels redraws of the same list, even after another list or another order of the names', async () => {
    const app = await mountQuickDraw('ordine');
    const draw = async (quickNames: string) => {
      app.fill({ quickNames });
      await submit(app);
      await app.waitForReveal();
    };
    await draw('Ana\nIon');
    expect(app.text('quickAttempt')).toContain('Prima tragere');
    await draw('Ana\nIon\nDan');
    expect(app.text('quickAttempt')).toContain('Prima tragere');
    await draw('ion\nAna');
    expect(app.text('quickAttempt')).toContain('A 2-a tragere');
    await app.click('quickCopy');
    expect(app.clipboard[0]).toMatch(/^Ordine trasă la sorți pe lasorti\.ro\n\n1\. .+\n2\. .+\n\nA 2-a tragere/);
  });

  it('shuffles the order shown on the page', async () => {
    const app = await mountQuickDraw('ordine');
    const names = Array.from({ length: 30 }, (_, i) => `Om ${i}`);
    app.fill({ quickNames: names.join('\n') });
    await submit(app);
    const [order] = app.stored('ls_ordine').result.groups;
    expect(order).not.toEqual(names);
    expect([...order].sort()).toEqual([...names].sort());
  });

  it('counts draws made in another tab and does not overwrite their result', async () => {
    const app = await mountQuickDraw('ordine');
    app.fill({ quickNames: 'Ana\nIon' });
    await submit(app);
    await app.waitForReveal();
    const other = app.stored('ls_ordine');
    other.result = { groups: [['Ion', 'Ana']], attempt: 2, at: 1 };
    other.draws.counts = { 'ana\nion': 2 };
    app.window.localStorage.setItem('ls_ordine', JSON.stringify(other));
    app.fill({ quickSound: false });
    expect(app.stored('ls_ordine').result).toEqual(other.result);
    await submit(app);
    expect(app.text('quickAttempt')).toContain('A 3-a tragere');
  });

  it('counts a draw made in another tab even when nothing is edited here', async () => {
    const app = await mountQuickDraw('ordine');
    app.fill({ quickNames: 'Ana\nIon' });
    const other = app.stored('ls_ordine');
    other.draws = { day: new Date().toDateString(), counts: { 'ana\nion': 1 } };
    app.window.localStorage.setItem('ls_ordine', JSON.stringify(other));
    await submit(app);
    expect(app.text('quickAttempt')).toContain('A 2-a tragere');
  });

  it('shows and copies the same result after another tab draws during the animation', async () => {
    const app = await mountQuickDraw('ordine');
    app.fill({ quickNames: 'Ana\nIon' });
    await submit(app);
    const other = app.stored('ls_ordine');
    other.result = { groups: [['Xenia', 'Zoe']], attempt: 2, at: 1 };
    app.window.localStorage.setItem('ls_ordine', JSON.stringify(other));
    app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'ls_ordine' }));
    expect(app.text('quickGroups')).not.toContain('Xenia');
    app.fill({ quickSound: false });
    await app.waitForReveal();
    await app.click('quickCopy');
    expect(app.text('quickGroups')).toContain('XeniaZoe');
    expect(app.clipboard[0]).toContain('1. Xenia\n2. Zoe');
  });

  it('draws the teams by size, reveals everyone and copies them with the number of the draw', async () => {
    const app = await mountQuickDraw('echipe');
    const names = Array.from({ length: 30 }, (_, i) => `Om${i}`);
    app.fill({ quickNames: names.join(', '), bySize: true, teamValue: '3' });
    expect(app.text('quickPlan')).toBe('30 de oameni → 10 echipe de 3.');
    await submit(app);
    await app.waitForReveal();
    await submit(app);
    await app.waitForReveal();
    const { groups } = app.stored('ls_echipe').result as { groups: string[][] };
    expect(groups).toHaveLength(10);
    expect(groups.flat()).not.toEqual(names);
    expect(groups.flat().sort()).toEqual([...names].sort());
    const shown = [...app.byId('quickGroups').querySelectorAll('ul')].map((list) =>
      [...list.children].map((item) => item.textContent),
    );
    expect(shown).toEqual(groups);
    await app.click('quickCopy');
    expect(app.clipboard[0]).toContain(`Echipa 1: ${groups[0].join(', ')}`);
    expect(app.clipboard[0]).toContain('A 2-a tragere');
  });

  it('shows what another tab drew or cleared', async () => {
    const app = await mountQuickDraw('ordine');
    const event = () => app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: 'ls_ordine' }));
    app.fill({ quickNames: 'Ana\nIon' });
    const other = { ...app.stored('ls_ordine'), result: { groups: [['Ion', 'Ana']], attempt: 1, at: 1 } };
    app.window.localStorage.setItem('ls_ordine', JSON.stringify(other));
    event();
    expect(app.text('quickGroups')).toContain('IonAna');
    app.window.localStorage.removeItem('ls_ordine');
    event();
    expect(app.byId('quickResult').hidden).toBe(true);
  });

  it('draws once when submitted repeatedly with reduced motion', async () => {
    const app = await mountQuickDraw('ordine');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    app.fill({ quickNames: 'Ana\nIon' });
    await submit(app);
    await submit(app);
    await submit(app);
    expect(app.text('quickAttempt')).toContain('Prima tragere');
    await app.waitForReveal();
    expect(app.byId<HTMLButtonElement>('quickDraw').disabled).toBe(false);
  });

  it('keeps counting when the browser cannot save, and ignores unreadable data', async () => {
    const app = await mountQuickDraw('ordine', { ls_ordine: '{"v":1,"draws":{"counts":{}},"result":{}}' });
    expect(app.byId<HTMLTextAreaElement>('quickNames').value).toBe('');
    app.fill({ quickNames: 'Ana\nIon' });
    vi.spyOn(app.window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await submit(app);
    await app.waitForReveal();
    await submit(app);
    expect(app.text('quickAttempt')).toContain('A 2-a tragere');
    expect(app.byId('quickUnsaved').hidden).toBe(false);
  });

  it('does not draw an impossible split, and clears everything on request', async () => {
    const app = await mountQuickDraw('echipe');
    app.fill({ quickNames: 'Ana\nIon', teamValue: '5' });
    await submit(app);
    expect(app.byId('quickPlan').className).toBe('msg err');
    expect(app.byId('quickResult').hidden).toBe(true);
    await app.click('quickReset');
    await app.click('quickReset');
    expect(app.stored('ls_echipe')).toBeNull();
    expect(app.byId<HTMLTextAreaElement>('quickNames').value).toBe('');
  });
});
