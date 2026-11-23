import { byId, downloadBlob, isChecked, fieldValue, showMessage } from './dom';
import { shortenName, paintShareImage, type ImageFormat, type ImageOptions } from './share-image';
import { escapeHtml, slugify } from './text';
import type { DrawState } from './types';

function readOptions(): ImageOptions {
  const choice = fieldValue('shareChoice');
  return {
    format: fieldValue('shareFormat') as ImageFormat,
    choice: choice === 'all' ? 'all' : Number(choice),
    shortNames: isChecked('shareShort'),
  };
}

function fillChoices(state: DrawState) {
  const options = state.results.flatMap((result, i) =>
    result
      ? [`<option value="${i}">${escapeHtml(`${shortenName(result.name)} · ${result.label ?? result.prize}`)}</option>`]
      : [],
  );
  const all = options.length > 1 ? '<option value="all">Toți câștigătorii</option>' : '';
  byId('shareChoice').innerHTML = all + options.join('');
}

/** The picture for social media, offered once the draw is over. It is made in the browser, like everything else. */
export function initSharePanel(getState: () => DrawState | null) {
  const panel = byId<HTMLDetailsElement>('sharePanel');
  const canvas = byId<HTMLCanvasElement>('shareCanvas');
  let painted: Promise<void> = Promise.resolve();

  function paint() {
    const state = getState();
    if (!state || !panel.open) return;
    // one at a time, otherwise a slower earlier picture could cover a newer one
    painted = painted
      .then(() => paintShareImage(canvas, state, readOptions()))
      .catch(() => showMessage('shareMsg', 'Poza nu a putut fi creată în acest browser.', true));
  }

  async function toFile() {
    await painted;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('the canvas is empty');
    return new File([blob], `castigatori-${slugify(getState()?.meta.title ?? '')}.png`, { type: 'image/png' });
  }

  async function withFile(action: (file: File) => unknown) {
    try {
      await action(await toFile());
    } catch (err) {
      const wasCancelled = err instanceof DOMException && err.name === 'AbortError';
      if (!wasCancelled) showMessage('shareMsg', 'Poza nu a putut fi salvată.', true);
    }
  }

  panel.addEventListener('toggle', () => {
    const state = getState();
    if (!panel.open || !state) return;
    fillChoices(state);
    paint();
  });
  ['shareChoice', 'shareFormat', 'shareShort'].forEach((id) => byId(id).addEventListener('change', paint));
  new MutationObserver(paint).observe(document.documentElement, { attributeFilter: ['data-mode'] });
  byId('shareDownload').addEventListener('click', () => withFile((file) => downloadBlob(file.name, file)));

  const shareButton = byId('shareSend');
  const probe = new File([''], 'probe.png', { type: 'image/png' });
  shareButton.hidden = !navigator.canShare?.({ files: [probe] });
  shareButton.addEventListener('click', () => withFile((file) => navigator.share({ files: [file] })));
}
