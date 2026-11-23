import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDrawApp, unmountDrawApp, type MountedApp } from './helpers/draw-app';

const PEOPLE = [
  'Nume\tEmail',
  'Ana Pop\tana.pop@example.com',
  'ion ionescu\tion@example.com',
  'Pop Ana\tana2@example.com',
  'Maria <b>X</b>\tmaria@example.com',
  'Dan & Co',
  'Ștefan Ilie\tstefan@example.com',
  'ION@example.com',
].join('\n');
const PRIZES = 'Cafenea | Voucher de 100 lei\nStudio "Foto" | Ședință (250 euro)\nOrganizator | Marele premiu: tabletă';
const COMMENTS = [
  'ana.pop',
  'Vreau! @maria #Cafea',
  '2h  3 likes  Reply',
  'ion.v',
  'cafea @dan @ana.pop',
  '1h',
  'brand',
  'Succes @ion.v cafea',
  '1h',
  'ana.pop',
  'încă una @dan cafea',
  '1h',
  'vlad',
  'Fără tag, dar cafea <i>bună</i>',
  '3h',
  'ema',
  'doar tag @ion.v',
  '3h',
  'geo',
  '@ana.pop CAFEA',
  '3h',
].join('\n');

const tombola = (app: MountedApp) =>
  app.fill({ evTitle: 'Gală & Co', evSub: 'Live', theme: 'verde', people: PEOPLE, prizes: PRIZES });
const giveaway = (app: MountedApp, more: Record<string, string | boolean> = {}) =>
  app.fill({
    evTitle: 'Giveaway',
    comments: COMMENTS,
    gwPrize: 'Voucher',
    gwWinners: '2',
    gwReserves: '1',
    gwMinTags: '1',
    gwKeyword: 'cafea',
    gwExclude: '@brand',
    ...more,
  });

function stage(app: MountedApp) {
  return Object.fromEntries(
    [
      'pNum',
      'pName',
      'pSponsor',
      'slotName',
      'winEmail',
      'poolInfo',
      'progTxt',
      'progLeft',
      'board',
      'track',
      'nextBtn',
      'resHead',
      'resBody',
    ]
      .map((id) => [id, app.html(id)])
      .concat([
        [
          'disabled',
          ['drawBtn', 'redrawBtn', 'nextBtn'].filter((id) => app.byId<HTMLButtonElement>(id).disabled).join(),
        ],
      ]),
  );
}
async function drawAll(app: MountedApp) {
  for (let i = 0; i < 20 && app.byId('finalView').style.display !== 'block'; i++) {
    await app.click('drawBtn');
    await app.waitForReveal();
    await app.click('nextBtn');
  }
  await app.wait(5000);
}
async function exportEverything(app: MountedApp) {
  for (const id of ['copyBtn', 'csvBtn', 'listBtn', 'pvBtn']) await app.click(id);
  return {
    clipboard: app.clipboard,
    downloads: await app.downloads(),
    report: app.html('pv'),
    printed: app.print.mock.calls.length,
  };
}

afterEach(unmountDrawApp);

describe('tombola', () => {
  it('reports the parsed lists and the fingerprint', async () => {
    const app = await mountDrawApp();
    tombola(app);
    await app.click('checkBtn');
    expect([app.text('setupMsg'), app.html('dups'), app.html('check')]).toMatchSnapshot();
    await app.click('dlList');
    expect(await app.downloads()).toMatchSnapshot();
  });

  it.each([
    ['nothing filled in', { people: '', prizes: '' }],
    ['more prizes than people', { people: 'Ana', prizes: 'A\nB' }],
  ])('refuses to start with %s', async (_name, values) => {
    const app = await mountDrawApp();
    app.fill(values);
    await app.click('startBtn');
    expect([app.text('setupMsg'), app.byId('setupMsg').className, app.byId('stage').style.display]).toMatchSnapshot();
  });

  it('runs from start to exports, with a redraw', async () => {
    const app = await mountDrawApp();
    tombola(app);
    await app.click('startBtn');
    expect(stage(app)).toMatchSnapshot('ready');
    await app.click('drawBtn');
    await app.wait(700);
    expect(app.html('cd')).toMatchSnapshot('countdown');
    await app.waitForReveal();
    expect(stage(app)).toMatchSnapshot('first winner');
    await app.click('redrawBtn');
    await app.waitForReveal();
    expect(stage(app)).toMatchSnapshot('after redraw');
    await app.click('nextBtn');
    await drawAll(app);
    expect([app.text('fSub'), app.html('fGrid')]).toMatchSnapshot('final');
    expect(app.stored('ls_state')).toMatchSnapshot('state');
    expect(await exportEverything(app)).toMatchSnapshot('exports');
  });

  it('groups all prizes by sponsor when there is no grand prize', async () => {
    const app = await mountDrawApp();
    tombola(app);
    app.fill({
      grandLast: false,
      showEmail: false,
      countdown: false,
      sound: false,
      prizes: 'A | Unu\nDoi\nA | Trei',
      dedupe: 'email',
    });
    await app.click('startBtn');
    await drawAll(app);
    expect([app.text('winEmail'), app.html('fGrid'), await exportEverything(app)]).toMatchSnapshot();
  });

  it('does not export names as spreadsheet formulas', async () => {
    const app = await mountDrawApp();
    tombola(app);
    app.fill({ people: '=HYPERLINK("http://x")\n+40 ana\n-1 ion\n@SUM(1) x', prizes: 'A\nB\nC\nD' });
    await app.click('startBtn');
    await drawAll(app);
    const { clipboard, downloads } = await exportEverything(app);
    const csv = downloads.find(({ name }) => name.endsWith('.csv'))!.content;
    expect(csv).not.toMatch(/"[=+\-@]/);
    expect(clipboard[0]).not.toMatch(/(^|\t)[=+\-@]/m);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it('lets a person win several prizes, but not after being replaced', async () => {
    const app = await mountDrawApp();
    tombola(app);
    app.fill({ people: 'Ana\nIon', multiWin: true, prizes: 'A\nB\nC\nD' });
    await app.click('startBtn');
    await app.click('drawBtn');
    await app.waitForReveal();
    const replaced = app.stored('ls_state').results[0].name;
    expect(app.stored('ls_state').pool).toHaveLength(2);
    await app.click('redrawBtn');
    await app.waitForReveal();
    expect(app.byId<HTMLButtonElement>('redrawBtn').disabled).toBe(true);
    await app.click('nextBtn');
    await drawAll(app);
    const { results, redraws } = app.stored('ls_state');
    expect(results).toHaveLength(4);
    expect(results.map((r: { name: string }) => r.name)).not.toContain(replaced);
    expect(redraws).toHaveLength(1);
    const { report } = await exportEverything(app);
    expect(report).toContain('cu reintroducere');
    expect(report).toContain('o persoană poate câștiga mai multe premii');
  });

  it('shows and exports the unique code', async () => {
    const app = await mountDrawApp();
    tombola(app);
    app.fill({ people: 'Cod;Nume\nTK-1001;Ana\nTK-1001;Ion', dedupe: 'code', dedupeColumn: 'Cod', prizes: 'A' });
    await app.click('checkBtn');
    expect(app.text('setupMsg')).toBe('1 participanți unici după Cod (1 duplicate eliminate) · 1 premii');
    await app.click('startBtn');
    await app.click('drawBtn');
    await app.waitForReveal();
    expect(app.text('winEmail')).toBe('•••001');
    const { clipboard, downloads, report } = await exportEverything(app);
    expect(clipboard[0]).toContain('TK-1001');
    expect(downloads[0].content).toContain('"Cod"');
    expect(report).toContain('se elimină după Cod');
    expect(report).not.toContain('TK-1001');
  });

  it('keeps the choice of forms saved before the unique field existed', async () => {
    const app = await mountDrawApp({ storage: { ls_setup: '{"byName":false}' } });
    expect(app.byId<HTMLSelectElement>('dedupe').value).toBe('email');
  });

  it('is driven by the keyboard on stage only', async () => {
    const app = await mountDrawApp();
    tombola(app);
    await app.press('KeyT', 't');
    expect(app.window.document.documentElement.dataset.mode).toBeUndefined();
    await app.click('startBtn');
    await app.press('KeyT', 't');
    expect(app.window.document.documentElement.dataset.mode).toBe('light');
    await app.press('Space', ' ');
    await app.waitForReveal();
    expect(app.text('progTxt')).toBe('1 / 3');
    await app.press('Space', ' ');
    expect(app.text('pNum')).toBe('Premiul 2 din 3');
  });

  it('resumes an unfinished draw with the current winner on screen', async () => {
    const first = await mountDrawApp();
    tombola(first);
    await first.click('startBtn');
    await first.click('drawBtn');
    await first.waitForReveal();
    const storage = first.storage();
    unmountDrawApp();

    const app = await mountDrawApp({ storage });
    expect([app.text('resumeInfo'), app.byId<HTMLButtonElement>('startBtn').disabled]).toMatchSnapshot('offer');
    await app.click('resumeBtn');
    expect(stage(app)).toMatchSnapshot('resumed');
    await app.click('exitBtn');
    expect(app.reload).toHaveBeenCalledOnce();
  });

  it.each([500, 3000])('keeps the chosen winner when the page is reloaded after %i ms', async (delay) => {
    const first = await mountDrawApp();
    tombola(first);
    await first.click('startBtn');
    await first.click('drawBtn');
    await first.wait(delay);
    const storage = first.storage();
    const chosen = JSON.parse(storage.ls_state).pool[JSON.parse(storage.ls_state).pending];
    unmountDrawApp();

    const app = await mountDrawApp({ storage });
    await app.click('resumeBtn');
    const { results, pending } = app.stored('ls_state');
    expect([results[0].id, pending]).toEqual([chosen.id, undefined]);
    expect(app.text('slotName')).toBe(chosen.name);
  });

  it('warns when the draw cannot be saved and refuses to leave the stage', async () => {
    const app = await mountDrawApp();
    tombola(app);
    await app.click('startBtn');
    expect(app.byId('saveWarning').style.display).toBe('none');
    const setItem = vi.spyOn(app.window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await app.click('drawBtn');
    expect(app.byId('saveWarning').style.display).toBe('block');
    const leave = new app.window.Event('beforeunload', { cancelable: true });
    app.window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    await app.waitForReveal();
    await app.click('exitBtn');
    expect(app.reload).not.toHaveBeenCalled();
    setItem.mockRestore();
    await app.click('exitBtn');
    expect(app.byId('saveWarning').style.display).toBe('none');
    expect(app.reload).toHaveBeenCalledOnce();
  });

  it('gives up the old backup when there is no room for the draw', async () => {
    const app = await mountDrawApp({ storage: { ls_state_backup: 'x'.repeat(100) } });
    const original = app.window.Storage.prototype.setItem;
    vi.spyOn(app.window.Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this.getItem('ls_state_backup')) throw new Error('quota');
      original.call(this, key, value);
    });
    tombola(app);
    await app.click('startBtn');
    expect(app.stored('ls_state').idx).toBe(0);
    expect(app.byId('saveWarning').style.display).toBe('none');
  });

  it('keeps a backup when the saved draw is discarded', async () => {
    const first = await mountDrawApp();
    tombola(first);
    await first.click('startBtn');
    const storage = first.storage();
    unmountDrawApp();

    const app = await mountDrawApp({ storage });
    await app.click('resetBtn');
    expect(Object.keys(app.storage()).sort()).toMatchSnapshot();
    expect(app.byId<HTMLButtonElement>('startBtn').disabled).toBe(false);
  });

  it('asks for a second click before starting over', async () => {
    const app = await mountDrawApp();
    tombola(app);
    await app.click('startBtn');
    await app.click('newBtn');
    expect(app.text('newBtn')).toBe('Sigur? Apasă din nou');
    await app.wait(3100);
    expect(app.text('newBtn')).toBe('↺ Extragere nouă');
    await app.click('newBtn');
    await app.click('newBtn');
    expect(app.reload).toHaveBeenCalledOnce();
    expect(app.stored('ls_state')).toBeNull();
  });

  it('never draws over a finished draw after resuming it', async () => {
    const first = await mountDrawApp();
    tombola(first);
    await first.click('startBtn');
    await drawAll(first);
    const storage = first.storage();
    unmountDrawApp();

    const app = await mountDrawApp({ storage });
    expect(app.text('resumeInfo')).toMatchSnapshot();
    await app.click('resumeBtn');
    const before = app.stored('ls_state').results;
    await app.press('Space', ' ');
    await app.waitForReveal();
    expect(app.stored('ls_state').results).toEqual(before);
    expect(app.stored('ls_state').redraws).toEqual([]);
  });
});

describe('giveaway', () => {
  it.each(['person', 'comment'])('reports valid and rejected comments (one chance per %s)', async (mode) => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    giveaway(app);
    app.window.document.querySelector<HTMLInputElement>(`[name=gwMode][value=${mode}]`)!.checked = true;
    await app.click('checkBtn');
    expect([app.text('setupMsg'), app.html('dups'), app.html('check')]).toMatchSnapshot();
  });

  it.each([
    ['no comments', { comments: '' }],
    ['no valid comment', { gwKeyword: 'inexistent' }],
    ['too few participants', { gwWinners: '50' }],
  ])('refuses to start with %s', async (_name, values) => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    giveaway(app, values);
    await app.click('startBtn');
    expect([app.text('setupMsg'), app.byId('stage').style.display]).toMatchSnapshot();
  });

  it.each(['person', 'comment'])('runs from start to exports (one chance per %s)', async (mode) => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    giveaway(app, { gwWinners: mode === 'person' ? '2' : '1' });
    app.window.document.querySelector<HTMLInputElement>(`[name=gwMode][value=${mode}]`)!.checked = true;
    await app.click('startBtn');
    expect(stage(app)).toMatchSnapshot('ready');
    await app.click('drawBtn');
    await app.waitForReveal();
    expect(stage(app)).toMatchSnapshot('first winner');
    await app.click('redrawBtn');
    await app.waitForReveal();
    await app.click('nextBtn');
    await drawAll(app);
    expect([app.text('fSub'), app.html('fGrid')]).toMatchSnapshot('final');
    expect(app.stored('ls_gw_state')).toMatchSnapshot('state');
    expect(await exportEverything(app)).toMatchSnapshot('exports');
  });

  it('warns that rules cannot apply to a plain account list', async () => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    giveaway(app, { gwSource: 'list', comments: '@ana\n@ion\n@ema\n@ana' });
    await app.click('checkBtn');
    expect([app.text('setupMsg'), app.html('dups'), app.html('check')]).toMatchSnapshot();
    await app.click('startBtn');
    await app.click('pvBtn');
    expect(app.html('pv')).toMatchSnapshot('report');
  });

  it('draws people without @ from a list, with no tags required by default', async () => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    expect(app.byId<HTMLInputElement>('gwMinTags').value).toBe('0');
    app.fill({ gwSource: 'list', comments: 'Ion Popescu\tVreau\nMaria Ionescu\tSi eu', gwReserves: '0' });
    await app.click('checkBtn');
    expect(app.text('check')).toContain('Ion Popescu, Maria Ionescu');
    expect(app.text('dups')).toContain('Numele nu sunt unice');
    await app.click('startBtn');
    await drawAll(app);
    expect(app.stored('ls_gw_state').results[0].name).toMatch(/^(Ion Popescu|Maria Ionescu)$/);
  });

  it('warns about the wrong source and about lines it could not read', async () => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    app.fill({ comments: '@ana\n@ion' });
    await app.click('checkBtn');
    expect(app.text('setupMsg')).toContain('Nu am găsit niciun participant');
    expect(app.text('dups')).toContain('Textul pare o listă');
    expect(app.text('dups')).toContain('Rânduri ignorate, pe care nu le-am putut atribui cuiva (2)');
  });

  it('shows at most 300 rejected comments', async () => {
    const app = await mountDrawApp({ kind: 'giveaway' });
    giveaway(app, {
      gwSource: 'list',
      comments: Array.from({ length: 305 }, (_, i) => `user${i}\tfără nimic`).join('\n'),
    });
    await app.click('checkBtn');
    expect(app.byId('dups').lastElementChild!.textContent).toBe('… și încă 5');
  });
});

describe('demo', () => {
  it.each(['tombola', 'giveaway'] as const)('runs the prefilled %s without saving the form', async (kind) => {
    const app = await mountDrawApp({ kind, demo: true });
    await app.click('checkBtn');
    expect([app.text('setupMsg'), app.html('dups'), app.html('check')]).toMatchSnapshot('check');
    await app.click('startBtn');
    await drawAll(app);
    expect(app.html('fGrid')).toMatchSnapshot('final');
    expect(Object.keys(app.storage())).toMatchSnapshot('storage keys');
  });
});

describe('setup form', () => {
  it.each(['tombola', 'giveaway'] as const)('saves, restores, exports and clears the %s form', async (kind) => {
    const first = await mountDrawApp({ kind });
    (kind === 'tombola' ? tombola : giveaway)(first);
    await first.wait(400);
    const storage = first.storage();
    expect(storage).toMatchSnapshot('saved');
    await first.click('exportCfg');
    expect(await first.downloads()).toMatchSnapshot('exported');
    unmountDrawApp();

    const app = await mountDrawApp({ kind, storage });
    expect(app.byId<HTMLInputElement>('evTitle').value).toBe(JSON.parse(Object.values(storage)[0]).title);
    await app.click('clearForm');
    await app.click('clearForm');
    expect([app.text('setupMsg'), app.storage()]).toMatchSnapshot('cleared');
  });

  it.each([
    ['invalid JSON', '{'],
    ['another app', '{"app":"x"}'],
    ['the other kind', '{"app":"lasorti.ro","kind":"giveaway"}'],
    [
      'a valid file',
      '{"app":"lasorti.ro","v":1,"title":"Importat","theme":"inexistent","byName":false,"sub":7,"hack":"x","logo":"javascript:alert(1)"}',
    ],
  ])('imports %s', async (_name, text) => {
    const app = await mountDrawApp();
    await app.chooseFile('importCfg', { text, name: 'c.json', type: 'application/json' });
    await app.wait(400);
    expect([app.text('cfgMsg'), app.byId('cfgMsg').className, app.stored('ls_setup')]).toMatchSnapshot();
  });

  it('rejects a logo over 1 MB', async () => {
    const app = await mountDrawApp();
    await app.chooseFile('logoFile', { size: 1024 * 1024 + 1, name: 'l.png', type: 'image/png' });
    expect(app.text('cfgMsg')).toBe('Logo-ul are peste 1 MB. Folosește o imagine mai mică.');
  });

  it('applies the chosen theme to the page', async () => {
    const app = await mountDrawApp();
    app.fill({ theme: 'violet' });
    expect(app.window.document.documentElement.dataset.theme).toBe('violet');
    app.fill({ theme: '' });
    expect(app.window.document.documentElement.dataset.theme).toBeUndefined();
  });
});
