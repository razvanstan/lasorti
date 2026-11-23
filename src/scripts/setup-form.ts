import { byId, downloadFile, fieldValue, findById, onConfirmedClick, setVisible, showMessage } from './dom';
import type { DrawKind } from './kind';
import { slugify } from './text';
import { setTheme, THEMES } from './theme';

type Setup = Record<string, string | boolean>;

/** Marks exported files; importing anything else is refused. */
const APP_ID = 'lasorti.ro';
const MAX_LOGO_BYTES = 1024 * 1024;
const SAVE_DELAY_MS = 300;

/** The setup form. Fields with a data-persist attribute are saved in the browser (except in the demo). */
export function initSetupForm(app: HTMLElement, kind: DrawKind, isDemo: boolean) {
  const storageKey = `ls_${kind.storagePrefix}setup`;
  let logo = '';
  let saveTimer = 0;

  const fields = () => [...app.querySelectorAll<HTMLInputElement>('[data-persist]')];

  function read(): Setup {
    const setup: Setup = { logo };
    for (const field of fields()) {
      const key = field.dataset.persist!;
      if (field.type === 'checkbox') setup[key] = field.checked;
      else if (field.type !== 'radio' || field.checked) setup[key] = field.value;
    }
    return setup;
  }

  /** Forms saved before the unique field could be chosen only had the byName checkbox. */
  function upgrade<T extends Record<string, unknown>>(setup: T): T {
    return setup.byName === false && setup.dedupe === undefined ? { ...setup, dedupe: 'email' } : setup;
  }

  function apply(setup: Setup) {
    for (const field of fields()) {
      const value = setup[field.dataset.persist!];
      if (value === undefined || value === null) continue;
      if (field.type === 'radio') field.checked = field.value === value;
      else if (field.type === 'checkbox' && typeof value === 'boolean') field.checked = value;
      else if (field.type !== 'checkbox' && typeof value === 'string') field.value = value;
    }
    if (typeof setup.theme === 'string') setTheme(setup.theme);
    setLogo(typeof setup.logo === 'string' && setup.logo.startsWith('data:image/') ? setup.logo : '');
  }

  function save() {
    if (isDemo) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(read()));
      } catch {
        showMessage('cfgMsg', 'Browserul nu mai are spațiu de salvare (logo prea mare?).', true);
      }
    }, SAVE_DELAY_MS);
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved) apply(upgrade(saved));
    } catch {
      // unreadable or blocked storage: start with an empty form
    }
  }

  function clear() {
    for (const field of fields()) {
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = field.defaultChecked;
      else if (field.tagName === 'SELECT') (field as unknown as HTMLSelectElement).selectedIndex = 0;
      else if (field.tagName === 'TEXTAREA' || field.type === 'text') field.value = '';
      else field.value = field.defaultValue ?? '';
    }
    setLogo('');
    setTheme('');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // storage is blocked, so nothing was saved
    }
    setVisible(byId('dups'), false);
    setVisible(byId('check'), false);
    showMessage('setupMsg', 'Formular golit.');
  }

  function setLogo(source: string) {
    logo = source;
    const preview = byId<HTMLImageElement>('logoPreview');
    preview.hidden = !source;
    if (source) preview.src = source;
    else preview.removeAttribute('src');
    byId('logoRemove').hidden = !source;
  }

  function uploadLogo(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      showMessage('cfgMsg', 'Logo-ul are peste 1 MB. Folosește o imagine mai mică.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(String(reader.result));
      save();
      showMessage('cfgMsg', 'Logo adăugat.');
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogo('');
    byId<HTMLInputElement>('logoFile').value = '';
    save();
  }

  function exportConfig() {
    const setup = read();
    const name = `lasorti-${kind.filePrefix}${slugify(String(setup.title || 'configuratie'))}.json`;
    downloadFile(name, JSON.stringify({ app: APP_ID, v: 1, kind: kind.id, ...setup }, null, 2), 'application/json');
    showMessage(
      'cfgMsg',
      'Configurație salvată. Fișierul conține și datele participanților: păstrează-l în siguranță.',
    );
  }

  /** Keeps only known fields, so that a tampered file cannot inject anything else. */
  function sanitize(config: Record<string, unknown>) {
    const setup: Setup = {};
    const keys = [...fields().map((field) => field.dataset.persist!), 'logo'];
    for (const key of keys) {
      const value = config[key];
      if (typeof value === 'string' || (typeof value === 'boolean' && key !== 'logo')) setup[key] = value;
    }
    if (typeof setup.theme === 'string' && !THEMES.includes(setup.theme)) setup.theme = '';
    return setup;
  }

  async function importConfig(file: File) {
    try {
      const config = JSON.parse(await file.text());
      if (config?.app !== APP_ID) throw new Error('not a configuration file');
      if ((config.kind ?? 'tombola') !== kind.id) {
        const actual = config.kind === 'giveaway' ? 'un giveaway' : 'o tombolă';
        showMessage('cfgMsg', `Fișierul e pentru ${actual}. Deschide pagina potrivită și încarcă-l acolo.`, true);
        return;
      }
      apply(sanitize(upgrade(config)));
      save();
      showMessage('cfgMsg', 'Configurație încărcată.');
    } catch {
      showMessage('cfgMsg', 'Fișierul nu este o configurație lasorti.ro validă.', true);
    }
  }

  if (isDemo) setTheme('');
  else restore();
  for (const field of fields()) {
    field.addEventListener('input', save);
    field.addEventListener('change', save);
  }
  byId('theme').addEventListener('change', () => setTheme(fieldValue('theme')));
  byId('logoFile').addEventListener('change', ({ target }) => {
    const file = (target as HTMLInputElement).files?.[0];
    if (file) uploadLogo(file);
  });
  byId('logoRemove').addEventListener('click', removeLogo);
  byId('exportCfg').addEventListener('click', exportConfig);
  byId('importCfg').addEventListener('change', async ({ target }) => {
    const input = target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await importConfig(file);
    input.value = ''; // lets the same file be chosen again
  });
  const clearButton = findById('clearForm'); // missing in the demo
  if (clearButton) onConfirmedClick(clearButton, clear);

  return { logo: () => logo };
}
