// The geometry and the rules of the wheel; pure functions, no page involved.
import { foldDiacritics } from './text';

export const MAX_OPTIONS = 40;
export const COLORS = 6;
const RADIUS = 100;
const PEG_RADIUS = 96;
const LABEL_START = 24;
export const LABEL_END = 90;
const MAX_TWO_LINES = 12;
const ONE_LINE = 10;
const MIN_LABEL = 5;
/** Average, relative to the font size. */
const CHAR_WIDTH = 0.58;

export function wheelError(options: number) {
  if (options < 2) return 'Scrie cel puțin două opțiuni.';
  if (options > MAX_OPTIONS) return `Roata are loc pentru cel mult ${MAX_OPTIONS} de opțiuni; lista are ${options}.`;
  return '';
}

/** Options written more than once, which have more chances. */
export function repeatedOptions(options: string[]) {
  const keys = options.map(foldDiacritics);
  return options.filter((_option, i) => keys.indexOf(keys[i]) === i && keys.lastIndexOf(keys[i]) !== i);
}

/** Clockwise from the top, where the pointer is. */
function pointAt(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return `${(RADIUS * Math.sin(radians)).toFixed(3)} ${(-RADIUS * Math.cos(radians)).toFixed(3)}`;
}

export function pegAt(index: number, count: number) {
  const radians = (index * 2 * Math.PI) / count;
  return { cx: PEG_RADIUS * Math.sin(radians), cy: -PEG_RADIUS * Math.cos(radians) };
}

export function slicePath(index: number, count: number) {
  const size = 360 / count;
  return `M0 0L${pointAt(index * size)}A${RADIUS} ${RADIUS} 0 0 1 ${pointAt((index + 1) * size)}Z`;
}

/** Neighbours never have the same colour, not even the last slice and the first. */
export function sliceColor(index: number, count: number) {
  const isLastLikeFirst = index === count - 1 && index > 0 && index % COLORS === 0;
  return isLastLikeFirst ? COLORS / 2 : index % COLORS;
}

/** The two lines that are closest in length; one line when there is nothing to split. */
function splitLabel(text: string) {
  const words = text.split(' ');
  const splits = words.slice(1).map((_word, i) => [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')]);
  const longest = (lines: string[]) => Math.max(...lines.map((line) => line.length));
  return splits.reduce((best, lines) => (longest(lines) < longest(best) ? lines : best), [text]);
}

/** How long a label may be: near the hub the slices are too narrow for it. */
function labelRoom(size: number, count: number) {
  return LABEL_END - Math.max(LABEL_START, (size * count * 0.8) / (2 * Math.PI));
}

export function fitLabel(text: string, count: number) {
  const lines = count <= MAX_TWO_LINES && text.length > ONE_LINE ? splitLabel(text) : [text];
  const longest = Math.max(...lines.map((line) => Array.from(line).length));
  const largest = Math.max(6, Math.min(11, 13 - count * 0.25));
  const size = Math.min(largest, Math.max(MIN_LABEL, labelRoom(largest, count) / (longest * CHAR_WIDTH)));
  const room = labelRoom(size, count);
  const most = Math.floor(room / (size * CHAR_WIDTH) + 1e-9);
  const shorten = (line: string) => {
    const chars = Array.from(line);
    return chars.length > most ? `${chars.slice(0, most - 1).join('')}…` : line;
  };
  return { size, room, lines: lines.map(shorten) };
}

/** The slice under the pointer. */
export function sliceAt(angle: number, count: number) {
  const fromTop = (((-angle % 360) + 360) % 360) / 360;
  return Math.min(count - 1, Math.floor(fromTop * count));
}

/** A wheel that was not spun yet: the pointer is in the middle of the first slice. */
export const idleAngle = (count: number) => -180 / count;
