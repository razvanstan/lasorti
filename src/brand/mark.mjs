// The single source of the lasorti.ro symbol: a gift box with a raised lid and a cut-out star, on a 64×64 grid.
// Used by the <Mark /> component and by scripts/brand.mjs (logo files, favicon, PNGs).

/** Four-pointed star with sides curved inwards. */
function star(cx, cy, r, k = 0.22) {
  const q = r * k;
  const a = q * 0.6,
    b = q * 1.4;
  return (
    `M${cx} ${cy - r}C${cx + a} ${cy - b} ${cx + b} ${cy - a} ${cx + r} ${cy}` +
    `C${cx + b} ${cy + a} ${cx + a} ${cy + b} ${cx} ${cy + r}` +
    `C${cx - a} ${cy + b} ${cx - b} ${cy + a} ${cx - r} ${cy}` +
    `C${cx - b} ${cy - a} ${cx - a} ${cy - b} ${cx} ${cy - r}Z`
  );
}

/** `dark` is for dark backgrounds, `light` for light ones. */
export const PALETTE = {
  dark: {
    stops: ['#ff9b73', '#ff5a3c', '#d9381f'],
    ink: '#f4f5f7',
    accent: '#ff5a3c',
    muted: '#8b919c',
    bg: '#0c0e12',
  },
  light: {
    stops: ['#ff8a5c', '#ef4a2f', '#c2301b'],
    ink: '#0f1115',
    accent: '#e0412a',
    muted: '#6b717c',
    bg: '#f5f6f8',
  },
};

/** The shapes of the symbol (without <svg>), filled with a colour or url(#gradient). */
export function markShapes(fill) {
  return (
    `<g fill="${fill}">` +
    `<path fill-rule="evenodd" d="M15 36h34a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V41a5 5 0 0 1 5-5z ${star(32, 47.5, 10)}"/>` +
    `<g transform="rotate(-9 8 30)">` +
    `<rect x="7" y="23" width="50" height="10" rx="4"/>` +
    `<path d="M30 22C25 11 13 9 13 16.5 13 20.5 20 22 30 22zM34 22C39 11 51 9 51 16.5 51 20.5 44 22 34 22z"/>` +
    `</g></g>`
  );
}

/** Diagonal gradient; each stop is the attribute that gives it a colour (attribute, style or class). */
export function markGradientWith(id, stops) {
  return (
    `<linearGradient id="${id}" x1="10" y1="8" x2="54" y2="59" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" ${stops[0]}/><stop offset=".55" ${stops[1]}/><stop offset="1" ${stops[2]}/>` +
    `</linearGradient>`
  );
}

export function markGradient(id, colors) {
  return markGradientWith(
    id,
    colors.map((color) => `stop-color="${color}"`),
  );
}

/** The whole symbol as a standalone SVG. */
export function markSvg(variant, id, size = 0) {
  // canvases need an explicit size
  const dimensions = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dimensions}><defs>${markGradient(id, PALETTE[variant].stops)}</defs>${markShapes(`url(#${id})`)}</svg>`;
}
