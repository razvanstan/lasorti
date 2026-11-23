import { markSvg } from '../brand/mark.mjs';
import { winnersOf } from './draw-state';
import type { DrawState, Result } from './types';

export const IMAGE_FORMATS = {
  story: { width: 1080, height: 1920, maxWinners: 10 },
  square: { width: 1080, height: 1080, maxWinners: 5 },
};
export type ImageFormat = keyof typeof IMAGE_FORMATS;
export interface ImageOptions {
  format: ImageFormat;
  /** Index in `state.results`, or 'all'. */
  choice: number | 'all';
  shortNames: boolean;
}

interface ImageContent {
  title: string;
  heading: string;
  lines: { name: string; detail: string }[];
  hidden: number;
  date: string;
}

type Measure = (text: string) => number;

const MARGIN = 90;
const SITE = 'lasorti.ro';

/** "Ana Maria Pop" → "Ana P."; accounts and single words stay as they are. */
export function shortenName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || name.startsWith('@')) return name;
  return `${words[0]} ${[...words.at(-1)!][0]}.`;
}

function truncate(text: string, maxWidth: number, measure: Measure) {
  if (measure(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && measure(`${chars.join('')}…`) > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/** Breaks text into lines that fit; whatever does not fit is cut with "…". */
export function wrapText(text: string, maxWidth: number, maxLines: number, measure: Measure) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && measure(joined) <= maxWidth) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines) kept[maxLines - 1] = lines.slice(maxLines - 1).join(' ');
  return kept.map((line) => truncate(line, maxWidth, measure));
}

/** Only names and prizes, never contact data (in a list of codes, the code is the name). */
export function imageContent(state: DrawState, { choice, format, shortNames }: ImageOptions): ImageContent {
  const toLine = ({ name, prize }: Result) => ({ name: shortNames ? shortenName(name) : name, detail: prize });
  const selected = choice === 'all' ? null : state.results[choice];
  const winners = selected ? [selected] : winnersOf(state).filter((winner) => !winner.reserve);
  const shown = winners.slice(0, IMAGE_FORMATS[format].maxWinners);
  return {
    title: state.meta.title,
    heading: selected ? (selected.label ?? 'Câștigător') : winners.length === 1 ? 'Câștigător' : 'Câștigători',
    lines: shown.map(toLine),
    hidden: winners.length - shown.length,
    date: new Date(state.meta.endedAt || Date.now()).toLocaleDateString('ro-RO', { dateStyle: 'long' }),
  };
}

function loadImage(source: string) {
  const image = new Image();
  image.src = source;
  return image.decode().then(() => image);
}

async function loadFonts(family: string, text: string) {
  // the text makes the browser load every subset it needs (ș, ț, ă)
  await Promise.all([800, 600].map((weight) => document.fonts.load(`${weight} 40px ${family}`, text)));
}

function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return {
    font: read('--font-display'),
    background: read('--bg'),
    card: read('--card'),
    ink: read('--ink'),
    muted: read('--muted'),
    accent: read('--acc'),
    glow: read('--acc-rgb'),
    brand: read('--brand'),
  };
}

type Palette = ReturnType<typeof readPalette>;

/** Writes centred text and returns the y under it. */
function createWriter(context: CanvasRenderingContext2D, width: number, font: string) {
  return (
    text: string,
    y: number,
    style: { size: number; weight: number; color: string; maxLines?: number; spacing?: number },
  ) => {
    context.font = `${style.weight} ${style.size}px ${font}`;
    context.fillStyle = style.color;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    const lines = wrapText(text, width - 2 * MARGIN, style.maxLines ?? 1, (part) => context.measureText(part).width);
    const lineHeight = style.size * 1.18;
    lines.forEach((line, i) => context.fillText(line, width / 2, y + i * lineHeight));
    return y + lines.length * lineHeight + (style.spacing ?? 0);
  };
}

function paintBackground(context: CanvasRenderingContext2D, width: number, height: number, palette: Palette) {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width / 2, 0, 0, width / 2, 0, height * 0.7);
  glow.addColorStop(0, `rgba(${palette.glow}, 0.24)`);
  glow.addColorStop(1, `rgba(${palette.glow}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

/** The symbol and the site name, side by side at the bottom. */
async function paintSignature(context: CanvasRenderingContext2D, width: number, y: number, palette: Palette) {
  const size = 72;
  const gap = 18;
  const variant = document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
  const mark = await loadImage(`data:image/svg+xml,${encodeURIComponent(markSvg(variant, 'mark', size))}`);
  context.font = `800 46px ${palette.font}`;
  const left = (width - size - gap - context.measureText(SITE).width) / 2;
  context.drawImage(mark, left, y, size, size);
  context.fillStyle = palette.ink;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(SITE, left + size + gap, y + size / 2 + 4);
}

async function paintLogo(context: CanvasRenderingContext2D, width: number, y: number, source: string) {
  try {
    const logo = await loadImage(source);
    const scale = Math.min(420 / logo.naturalWidth, 130 / logo.naturalHeight);
    const [w, h] = [logo.naturalWidth * scale, logo.naturalHeight * scale];
    if (w > 0 && h > 0) context.drawImage(logo, (width - w) / 2, y, w, h);
  } catch {
    // an unreadable logo is left out
  }
}

export async function paintShareImage(canvas: HTMLCanvasElement, state: DrawState, options: ImageOptions) {
  const { width, height } = IMAGE_FORMATS[options.format];
  const content = imageContent(state, options);
  const palette = readPalette();
  const isStory = options.format === 'story';
  const isSingle = content.lines.length === 1;
  await loadFonts(palette.font, JSON.stringify(content) + SITE);

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const write = createWriter(context, width, palette.font);
  paintBackground(context, width, height, palette);

  let y = isStory ? 170 : 64;
  if (state.meta.logo) {
    await paintLogo(context, width, y, state.meta.logo);
    y += 160;
  }
  if (content.title) y = write(content.title, y, { size: 50, weight: 600, color: palette.ink, maxLines: 2 });

  const sizes = isStory
    ? { heading: 52, singleName: 144, singleDetail: 56, name: 62, detail: 36 }
    : { heading: 42, singleName: 112, singleDetail: 46, name: 50, detail: 32 };
  const rowHeight = (sizes.name + sizes.detail) * 1.18 + 18;
  const bottom = height - (isStory ? 260 : 150);
  const bodyHeight = isSingle
    ? isStory
      ? 540
      : 440
    : 130 + content.lines.length * rowHeight + (content.hidden ? 60 : 0);
  y = Math.max(y + 36, (y + bottom - bodyHeight) / 2);
  y = write(content.heading.toLocaleUpperCase('ro-RO'), y, {
    size: sizes.heading,
    weight: 800,
    color: palette.accent,
    spacing: 30,
  });
  for (const { name, detail } of content.lines) {
    y = write(name, y, {
      size: isSingle ? sizes.singleName : sizes.name,
      weight: 800,
      color: palette.ink,
      maxLines: isSingle ? 2 : 1,
      spacing: isSingle ? 24 : 0,
    });
    y = write(detail, y, {
      size: isSingle ? sizes.singleDetail : sizes.detail,
      weight: 600,
      color: palette.muted,
      maxLines: isSingle ? 3 : 1,
      spacing: 18,
    });
  }
  if (content.hidden) write(`… și încă ${content.hidden}`, y, { size: 34, weight: 600, color: palette.muted });

  write(content.date, bottom, { size: 30, weight: 600, color: palette.muted });
  await paintSignature(context, width, bottom + 54, palette);
}
