export function byId<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

/** For elements that only exist on some pages. */
export function findById<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

/** Empty when the field does not exist on this page (the two draw types have different forms). */
export function fieldValue(id: string) {
  return findById<HTMLInputElement>(id)?.value ?? '';
}

export function isChecked(id: string) {
  return findById<HTMLInputElement>(id)?.checked ?? false;
}

export function setVisible(element: HTMLElement | null, visible: boolean) {
  if (element) element.style.display = visible ? 'block' : 'none';
}

export function showMessage(id: string, text: string, isError = false) {
  const element = byId(id);
  element.className = isError ? 'msg err' : 'msg';
  element.textContent = text;
}

export function downloadFile(name: string, content: string, type: string) {
  downloadBlob(name, new Blob([content], { type }));
}

export function downloadBlob(name: string, blob: Blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

const CONFIRM_WINDOW_MS = 3000;

/** Runs the action only on a second click, without using browser dialogs. */
export function onConfirmedClick(button: HTMLElement, action: () => void) {
  const label = button.textContent;
  let timer = 0;
  const disarm = () => {
    delete button.dataset.armed;
    button.textContent = label;
  };
  button.addEventListener('click', () => {
    if (button.dataset.armed) {
      clearTimeout(timer);
      disarm();
      action();
      return;
    }
    button.dataset.armed = '1';
    button.textContent = 'Sigur? Apasă din nou';
    timer = window.setTimeout(disarm, CONFIRM_WINDOW_MS);
  });
}
