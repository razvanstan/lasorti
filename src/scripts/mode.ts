// Light/dark mode. The initial value is set by the inline script in Base.astro, before the first paint.
const KEY = 'ls_mode';

function currentMode(): 'light' | 'dark' {
  return document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
}

export function toggleMode() {
  const next = currentMode() === 'light' ? 'dark' : 'light';
  const system = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.mode = next;
  try {
    // choosing what the system already has means following the system again
    if (next === system) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // storage is blocked: the choice lasts until the page is closed
  }
}
