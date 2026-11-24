import { createHash } from 'node:crypto';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import DrawApp from '../../src/components/DrawApp.astro';
import QuickDraw from '../../src/components/QuickDraw.astro';
import { initDrawApp } from '../../src/scripts/draw';
import { initQuickDraw } from '../../src/scripts/quick-draw';

export interface Download {
  name: string;
  content: string;
}

interface Options {
  kind?: 'tombola' | 'giveaway';
  demo?: boolean;
  storage?: Record<string, string>;
}

/** Deterministic stand-in for the browser's random source, so that a whole draw can be snapshotted. */
function seededUint32() {
  let state = 12345;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
}

async function readBlob(blob: Blob) {
  // ignoreBOM keeps the byte order mark in the decoded text, because it is part of the CSV contract
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer());
}

export const mountDrawApp = ({ kind = 'tombola', demo = false, storage }: Options = {}) =>
  mountApp(DrawApp, { kind, demo }, initDrawApp, storage);

export const mountQuickDraw = (kind: 'echipe' | 'ordine', storage?: Record<string, string>) =>
  mountApp(QuickDraw, { kind }, initQuickDraw, storage);

/** Renders the real Astro component into jsdom and starts the app on it, with fake time and randomness. */
async function mountApp(
  component: Parameters<AstroContainer['renderToString']>[0],
  props: Record<string, unknown>,
  init: () => void,
  storage: Record<string, string> = {},
) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(component, { props });
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const { window } = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: 'http://localhost/' });

  vi.useFakeTimers({
    now: new Date('2026-11-23T10:00:00Z'),
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'],
  });
  const nextUint32 = seededUint32();
  const blobs: { name: string; blob: Blob }[] = [];
  let lastBlob: Blob;
  const clipboard: string[] = [];
  const reload = vi.fn();
  const print = vi.fn();

  window.setTimeout = globalThis.setTimeout as never;
  window.clearTimeout = globalThis.clearTimeout as never;
  window.print = print;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy({}, { get: () => () => {}, set: () => true })) as never;
  window.HTMLAnchorElement.prototype.click = function () {
    blobs.push({ name: this.download, blob: lastBlob });
  };
  Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, value));

  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('localStorage', window.localStorage);
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('navigator', { clipboard: { writeText: async (text: string) => void clipboard.push(text) } });
  vi.stubGlobal('FileReader', window.FileReader);
  vi.stubGlobal('CustomEvent', window.CustomEvent);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('addEventListener', window.addEventListener.bind(window));
  vi.stubGlobal('removeEventListener', window.removeEventListener.bind(window));
  vi.stubGlobal('MutationObserver', window.MutationObserver);
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal('crypto', {
    getRandomValues: (array: Uint32Array) => array.fill(nextUint32()),
    subtle: {
      digest: async (_name: string, data: Uint8Array) =>
        new Uint8Array(createHash('sha256').update(data).digest()).buffer,
    },
  });
  vi.spyOn(Math, 'random').mockImplementation(() => nextUint32() / 2 ** 32);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    lastBlob = blob as Blob;
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  init();

  const byId = <T extends HTMLElement = HTMLElement>(id: string) => window.document.getElementById(id) as T;
  const flush = () => vi.advanceTimersByTimeAsync(0);
  return {
    window,
    byId,
    reload,
    print,
    clipboard,
    flush,
    text: (id: string) => byId(id).textContent,
    html: (id: string) => byId(id).innerHTML,
    fill(values: Record<string, string | boolean>) {
      for (const [id, value] of Object.entries(values)) {
        const el = byId<HTMLInputElement>(id);
        if (typeof value === 'boolean') el.checked = value;
        else el.value = value;
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
      }
    },
    async click(id: string) {
      byId(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await flush();
    },
    async press(code: string, key = code) {
      window.document.body.dispatchEvent(
        new window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }),
      );
      await flush();
    },
    wait: (ms: number) => vi.advanceTimersByTimeAsync(ms),
    /** Long enough for the countdown and the longest spin. */
    waitForReveal: () => vi.advanceTimersByTimeAsync(9000),
    async chooseFile(id: string, file: { text?: string; size?: number; type?: string; name: string }) {
      const input = byId<HTMLInputElement>(id);
      const value = new window.File([file.text ?? 'x'.repeat(file.size ?? 1)], file.name, { type: file.type });
      Object.defineProperty(value, 'text', { value: async () => file.text ?? '' });
      Object.defineProperty(input, 'files', { value: [value], configurable: true });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      await flush();
    },
    stored: (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null'),
    storage: () =>
      Object.fromEntries(Object.keys(window.localStorage).map((k) => [k, window.localStorage.getItem(k)!])),
    downloads: (): Promise<Download[]> =>
      Promise.all(blobs.map(async ({ name, blob }) => ({ name, content: await readBlob(blob) }))),
  };
}

export type MountedApp = Awaited<ReturnType<typeof mountDrawApp>>;

export function unmountDrawApp() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}
