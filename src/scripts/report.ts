import type { DrawKind } from './kind';
import { hasUnequalChances } from './people';
import { headerCells, resultRows, rowCells } from './results';
import { escapeHtml, formatDate, formatTime } from './text';
import type { DrawState } from './types';

const WEIGHTED_METHOD =
  'Extragere aleatorie ponderată după numărul de șanse, fără reintroducere (o persoană poate fi extrasă o singură dată)';
const UNIFORM_METHOD =
  'Extragere aleatorie uniformă, fără reintroducere (fiecare persoană poate fi extrasă o singură dată)';

const REPEATED_METHOD = 'Extragere aleatorie uniformă, cu reintroducere (o persoană poate câștiga mai multe premii)';

function drawMethod({ all, opts }: DrawState) {
  if (opts.multiWin) return REPEATED_METHOD;
  return hasUnequalChances(all) ? WEIGHTED_METHOD : UNIFORM_METHOD;
}

function winnersTable(kind: DrawKind, state: DrawState) {
  const columns = kind.columns(state);
  const rows = resultRows(state).map((row) => `<tr>${rowCells(columns, row)}<td>${formatTime(row.at)}</td></tr>`);
  return `<table><thead><tr>${headerCells(columns)}<th>Ora</th></tr></thead><tbody>
        ${rows.join('')}
      </tbody></table>`;
}

function redrawsTable(kind: DrawKind, state: DrawState) {
  if (!state.redraws.length) return '<p>Nu au avut loc re-extrageri.</p>';
  const columns = kind.report.redrawColumns;
  const rows = state.redraws.map((redraw) => {
    const cells = columns.map(([, value]) => `<td>${escapeHtml(value(redraw, state))}</td>`);
    return `<tr>${cells.join('')}<td>${formatTime(redraw.at)}</td></tr>`;
  });
  return `<table><thead><tr>${columns.map(([header]) => `<th>${header}</th>`).join('')}<th>Ora</th></tr></thead><tbody>
        ${rows.join('')}
      </tbody></table>`;
}

/** The printable record of the draw ("proces-verbal"). */
export function reportHtml(kind: DrawKind, state: DrawState) {
  const { meta } = state;
  const { report } = kind;
  const subtitle = meta.sub ? ` · ${escapeHtml(meta.sub)}` : '';
  const method = drawMethod(state);
  return `
      <h1>${report.title}</h1>
      <div>${escapeHtml(meta.title || kind.defaultTitle)}${subtitle}</div>
      <h2>Date generale</h2>
      <table class="kv"><tbody>
        <tr><td>Începutul extragerii</td><td>${formatDate(meta.startedAt)}</td></tr>
        <tr><td>Sfârșitul extragerii</td><td>${state.done ? formatDate(meta.endedAt) : 'extragere în desfășurare'}</td></tr>
        ${report.factsHtml(state)}
        <tr><td>Amprenta listei de participanți (SHA-256)</td><td class="mono">${escapeHtml(meta.hash || 'indisponibilă')}</td></tr>
        <tr><td>Metodă</td><td>${method}, cu generatorul criptografic al browserului (Web Crypto, <code>crypto.getRandomValues</code>), prin instrumentul lasorti.ro, rulat local.</td></tr>
      </tbody></table>
      <h2>${report.winnersHeading}</h2>
      ${winnersTable(kind, state)}
      <h2>Re-extrageri</h2>
      ${redrawsTable(kind, state)}
      <div class="sign"><div>Organizator (nume, semnătură)</div><div>Martor / comisie (nume, semnătură)</div></div>
      <p class="foot">Document generat cu lasorti.ro la ${formatDate(Date.now())}. Instrumentul doar efectuează extragerea aleatorie${report.toolScope}; organizatorul răspunde de regulamentul campaniei, de eligibilitatea participanților, de acordarea premiilor și de respectarea legislației aplicabile${report.organizerDuties}.</p>`;
}

export function printReport(container: HTMLElement, html: string) {
  container.innerHTML = html;
  document.body.classList.add('print-pv');
  addEventListener('afterprint', () => document.body.classList.remove('print-pv'), { once: true });
  window.print();
}
