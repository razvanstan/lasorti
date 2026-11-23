#!/usr/bin/env node
/**
 * Generates the brand files from src/brand/mark.mjs:   npm run brand
 *
 *   public/favicon.svg              the symbol; its palette follows the browser theme
 *   public/apple-touch-icon.png     180×180, on a dark background
 *   public/icon-192.png, icon-512.png   for site.webmanifest
 *   public/og-image.png             1200×630, the preview image for shared links
 *   public/brand/                   logo and symbol for dark/light backgrounds, mono, PNGs
 *
 * Text is converted to outlines (Archivo), so the files look the same everywhere, without the font installed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { PALETTE, markGradient, markGradientWith, markShapes, markSvg } from '../src/brand/mark.mjs';

const require = createRequire(import.meta.url);

function loadArchivo(weight, subset) {
  const bytes = readFileSync(require.resolve(`@fontsource/archivo/files/archivo-${subset}-${weight}-normal.woff`));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** Each font is [main, fallback for missing characters (ș, ț, ă...)]. */
const FONTS = {
  logo: [loadArchivo(800, 'latin'), loadArchivo(800, 'latin-ext')],
  ui: [loadArchivo(600, 'latin'), loadArchivo(600, 'latin-ext')],
};

const PUB = path.resolve('public');
const BRAND = path.join(PUB, 'brand');
mkdirSync(BRAND, { recursive: true });

const logFile = (file) => console.log(`  ${path.relative(process.cwd(), file)}`);
const round = (n) => Math.round(n * 100) / 100;
const roundScale = (n) => Math.round(n * 1e5) / 1e5;

function writeFile(file, data) {
  writeFileSync(file, data);
  logFile(file);
}

/**
 * Text as SVG outlines. `runs` = [{ text, color, font }], placed on the same baseline.
 * The returned sizes are in the same units as `size` (the font size).
 */
function textPaths(runs, { x = 0, y = 0, size = 40, tracking = -0.03 } = {}) {
  let cx = x,
    svg = '';
  for (const run of runs) {
    const [latin, ext = latin] = FONTS[run.font ?? 'logo'];
    let d = '';
    let prev = null;
    for (const ch of run.text) {
      const font = latin.charToGlyphIndex(ch) ? latin : ext;
      const g = font.charToGlyph(ch);
      const scale = size / font.unitsPerEm;
      if (prev && prev.font === font) cx += font.getKerningValue(prev.g, g) * scale;
      d += pathData(g.getPath(cx, y, size));
      cx += g.advanceWidth * scale + tracking * size;
      prev = { font, g };
    }
    svg += `<path fill="${run.color}" d="${d}"/>`;
  }
  const os2 = FONTS.logo[0].tables.os2,
    em = FONTS.logo[0].unitsPerEm;
  return { svg, width: cx - x - tracking * size, capHeight: (os2.sCapHeight / em) * size };
}

/** Not toPathData() from opentype.js, because it sometimes writes NaN coordinates. */
function pathData(p) {
  const n = (v) => {
    if (!Number.isFinite(v)) throw new Error('invalid coordinate in glyph');
    return String(Math.round(v * 100) / 100);
  };
  return p.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error('unknown command ' + c.type);
      }
    })
    .join('');
}

const word = (p) => [
  { text: 'LA', color: p.ink },
  { text: 'SORȚI', color: p.accent },
];
const LOGO = { size: 40, tracking: 0.06, markRatio: 1.1, gap: 0.27 };

/**
 * The LASORȚI logo (spaced capitals and the symbol) with its bounding box, in its own units.
 * The symbol is visually about 1.1 × the cap height, centred on the capitals.
 */
function logoParts(p, gradId = 'g') {
  const { size, tracking, markRatio, gap } = LOGO;
  const probe = textPaths(word(p), { size, tracking });
  const cap = probe.capHeight;
  const s = (markRatio * cap) / 50; // the visible body of the symbol: y 9…59 on the 64 grid
  const baseline = 100,
    mid = baseline - cap / 2;
  const markY = mid - 34 * s; // its visual centre is at y≈34
  const textX = 64 * s + gap * size;
  const t = textPaths(word(p), { x: textX, y: baseline, size, tracking });
  const top = Math.min(markY + 8 * s, baseline - cap);
  const bottom = Math.max(markY + 60 * s, baseline + 0.24 * size); // the comma of Ț goes below the baseline
  const svg = `<g transform="translate(0 ${round(markY)}) scale(${roundScale(s)})">${markShapes(`url(#${gradId})`)}</g>${t.svg}`;
  return { svg, x: 0, y: top, w: textX + t.width, h: bottom - top };
}

/** Horizontal logo: the symbol and LASORȚI. */
function logoSvg(variant, { bg = false } = {}) {
  const p = PALETTE[variant];
  const L = logoParts(p);
  const pad = bg ? 0.4 * L.h : 0;
  const vx = round(L.x - pad),
    vy = round(L.y - pad),
    vw = round(L.w + 2 * pad),
    vh = round(L.h + 2 * pad);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}">` +
    (bg ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${p.bg}"/>` : '') +
    `<defs>${markGradient('g', p.stops)}</defs>${L.svg}</svg>`
  );
}

/** App icon: the symbol on a dark square, rounded unless the system rounds it (apple-touch). */
function appIconSvg({ rounded = true } = {}) {
  const p = PALETTE.dark;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" ${rounded ? 'rx="14"' : ''} fill="${p.bg}"/>` +
    `<defs>${markGradient('g', p.stops)}</defs><g transform="translate(9.5 8) scale(.7)">${markShapes('url(#g)')}</g></svg>`
  );
}

/** Adaptive favicon: its palette follows the browser theme. */
function faviconSvg() {
  const [d, l] = [PALETTE.dark.stops, PALETTE.light.stops];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>` +
    `.a{stop-color:${l[0]}}.b{stop-color:${l[1]}}.c{stop-color:${l[2]}}` +
    `@media (prefers-color-scheme:dark){.a{stop-color:${d[0]}}.b{stop-color:${d[1]}}.c{stop-color:${d[2]}}}</style>` +
    `<defs>${markGradientWith('g', ['class="a"', 'class="b"', 'class="c"'])}</defs>` +
    `${markShapes('url(#g)')}</svg>`
  );
}

function centredText(text, { color, y, size, tracking, width }) {
  const runs = [{ text, color, font: 'ui' }];
  const measured = textPaths(runs, { size, tracking });
  return textPaths(runs, { x: (width - measured.width) / 2, y, size, tracking }).svg;
}

/** The Open Graph image. */
function ogSvg() {
  const p = PALETTE.dark,
    W = 1200,
    H = 630;
  const L = logoParts(p);
  const scale = 620 / L.w; // the logo takes about 620px of the width
  const lx = (W - L.w * scale) / 2,
    ly = 250 - (L.y + L.h) * scale;
  const title = centredText('Extragere de premii pentru evenimente live', {
    color: p.ink,
    y: 380,
    size: 40,
    tracking: -0.01,
    width: W,
  });
  const subtitle = centredText('Gratuit · fără reclame · datele rămân în browserul tău', {
    color: p.muted,
    y: 440,
    size: 28,
    tracking: 0,
    width: W,
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><radialGradient id="glow" cx="50%" cy="0%" r="75%"><stop offset="0" stop-color="${p.accent}" stop-opacity=".22"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient>` +
    `${markGradient('g', p.stops)}</defs>` +
    `<rect width="${W}" height="${H}" fill="${p.bg}"/><rect width="${W}" height="${H}" fill="url(#glow)"/>` +
    `<g transform="translate(${round(lx)} ${round(ly)}) scale(${roundScale(scale)})">${L.svg}</g>` +
    title +
    subtitle +
    `<rect x="${W / 2 - 40}" y="300" width="80" height="4" rx="2" fill="${p.accent}" opacity=".7"/>` +
    `</svg>`
  );
}

const png = (svg, file, size) =>
  sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file)
    .then(() => logFile(file));

console.log('Generating the brand files:');
writeFile(path.join(PUB, 'favicon.svg'), faviconSvg());
for (const v of ['dark', 'light']) {
  writeFile(path.join(BRAND, `mark-${v}.svg`), markSvg(v, 'g'));
  writeFile(path.join(BRAND, `logo-${v}.svg`), logoSvg(v));
}
writeFile(
  path.join(BRAND, 'mark-mono-black.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markShapes('#000')}</svg>`,
);
writeFile(
  path.join(BRAND, 'mark-mono-white.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markShapes('#fff')}</svg>`,
);
writeFile(path.join(BRAND, 'app-icon.svg'), appIconSvg());

await png(appIconSvg({ rounded: false }), path.join(PUB, 'apple-touch-icon.png'), 180);
await png(appIconSvg(), path.join(PUB, 'icon-192.png'), 192);
await png(appIconSvg(), path.join(PUB, 'icon-512.png'), 512);
for (const v of ['dark', 'light']) {
  const svg = logoSvg(v, { bg: true });
  await sharp(Buffer.from(svg), { density: 300 })
    .resize({ width: 1600 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(BRAND, `logo-${v}.png`));
  console.log(`  public/brand/logo-${v}.png`);
}
await sharp(Buffer.from(ogSvg())).png({ compressionLevel: 9 }).toFile(path.join(PUB, 'og-image.png'));
console.log('  public/og-image.png');

writeFile(
  path.join(PUB, 'site.webmanifest'),
  JSON.stringify(
    {
      name: 'la sorți',
      short_name: 'la sorți',
      description: 'Extragere de premii pentru evenimente live, fără reclame.',
      start_url: '/',
      display: 'standalone',
      background_color: PALETTE.dark.bg,
      theme_color: PALETTE.dark.bg,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ) + '\n',
);
