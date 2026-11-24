import type { DrawKind } from './kind';

// Cookie-free traffic statistics (Umami, self-hosted): one request per page view,
// and one when a draw starts and ends.
// Sends only what visit() returns and the name of the event. Never the lists, the settings or anything else typed in the tool.
const ENDPOINT = 'https://stats.lasorti.ro/api/c';
const WEBSITE_ID = 'c935a96f-df5b-46b4-9bcb-960315616d84';
/** Development, previews and forks are not counted. */
const HOSTNAME = 'lasorti.ro';
/** Set to anything in localStorage to leave a browser out of the statistics. */
const OPT_OUT_KEY = 'umami.disabled';

/** Where the visitor came from: nothing for our own pages, and no query string, which may hold private data. */
function externalReferrer(): string {
  if (!document.referrer) return '';
  const url = new URL(document.referrer);
  return url.hostname === HOSTNAME ? '' : url.origin + url.pathname;
}

function visit() {
  return {
    website: WEBSITE_ID,
    hostname: HOSTNAME,
    url: location.pathname,
    referrer: externalReferrer(),
    title: document.title,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
  };
}

function hasOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== null;
  } catch {
    return false; // storage is blocked
  }
}

async function send(event?: { name: string }) {
  if (location.hostname !== HOSTNAME || hasOptedOut()) return;
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', payload: { ...visit(), ...event } }),
      credentials: 'omit',
      keepalive: true,
    });
  } catch {
    // offline or blocked: the tool works the same
  }
}

export const countPageView = () => send();

/** That a draw happened and of which type; nothing about its contents. */
export const countDraw = (kind: DrawKind['id'], step: 'start' | 'end') => send({ name: `${kind}-${step}` });
