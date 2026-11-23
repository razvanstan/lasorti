const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function foldDiacritics(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Same key for the same name, whatever the diacritics, letter case or word order. */
export function normalizeName(name: string) {
  return foldDiacritics(name)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function maskEmail(email: string) {
  if (!email) return '';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}•••@${domain}`;
}

/** Enough to recognise your own phone number or code, without showing it. */
export function maskEnd(text: string) {
  return text.length > 3 ? `•••${text.slice(-3)}` : text;
}

export function slugify(text: string) {
  return (
    normalizeName(text)
      .replace(/[^a-z\s]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'extragere'
  );
}

export function formatDate(timestamp: number) {
  return timestamp ? new Date(timestamp).toLocaleString('ro-RO', { dateStyle: 'long', timeStyle: 'medium' }) : '—';
}

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('ro-RO');
}

export function clampInt(text: string, min: number, max: number, fallback: number) {
  const value = parseInt(text, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
