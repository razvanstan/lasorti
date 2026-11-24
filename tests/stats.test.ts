import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { countDraw, countPageView } from '../src/scripts/stats';

function visit(url: string, { referrer, storage = {} }: { referrer?: string; storage?: Record<string, string> } = {}) {
  const { window } = new JSDOM('<title>Pagina</title>', { url, referrer });
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response()));
  vi.stubGlobal('location', window.location);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('localStorage', window.localStorage);
  vi.stubGlobal('navigator', { language: 'ro-RO' });
  vi.stubGlobal('screen', { width: 1920, height: 1080 });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const payload = (fetch: ReturnType<typeof visit>) => JSON.parse(String(fetch.mock.calls[0]![1].body)).payload;

afterEach(() => vi.unstubAllGlobals());

it('sends only the page, the source and the device, never the saved lists', async () => {
  const fetch = visit('https://lasorti.ro/extragere/tombola/?q=secret#secret', {
    referrer: 'https://example.com/post?user=secret',
    storage: { ls_setup: '{"people":"secret"}' },
  });
  await countPageView();

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe('https://stats.lasorti.ro/api/c');
  expect(fetch.mock.calls[0]![1].credentials).toBe('omit');
  expect(payload(fetch)).toEqual({
    website: expect.any(String),
    hostname: 'lasorti.ro',
    url: '/extragere/tombola/',
    referrer: 'https://example.com/post',
    title: 'Pagina',
    language: 'ro-RO',
    screen: '1920x1080',
  });
});

it('does not report our own pages as a source', async () => {
  const fetch = visit('https://lasorti.ro/demo/', { referrer: 'https://lasorti.ro/' });
  await countPageView();
  expect(payload(fetch).referrer).toBe('');
});

it('does not count other domains', async () => {
  const fetch = visit('http://localhost:4321/');
  await countPageView();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not count browsers that opted out', async () => {
  const fetch = visit('https://lasorti.ro/', { storage: { 'umami.disabled': '1' } });
  await countPageView();
  expect(fetch).not.toHaveBeenCalled();
});

it('ignores an unreachable server', async () => {
  const fetch = visit('https://lasorti.ro/');
  fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(countPageView()).resolves.toBeUndefined();
});

it('sends only the type of a draw and that it started or ended', async () => {
  const fetch = visit('https://lasorti.ro/extragere/tombola/');
  await countDraw('tombola', 'end');
  const { name, ...rest } = payload(fetch);
  expect(name).toBe('tombola-end');
  expect(Object.keys(rest).sort()).toEqual(['hostname', 'language', 'referrer', 'screen', 'title', 'url', 'website']);
});
