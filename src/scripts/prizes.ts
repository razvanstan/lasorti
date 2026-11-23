import type { Prize, Rarity } from './types';

export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Comun',
  rare: 'Rar',
  epic: 'Epic',
  legendary: '★ Legendar',
};
const RARITY_BY_TAG: Record<string, Rarity> = { comun: 'common', rar: 'rare', epic: 'epic', legendar: 'legendary' };
const MIN_EUR_LEGENDARY = 3000;
const MIN_EUR_EPIC = 1000;
const MIN_EUR_RARE = 250;
/** Approximate on purpose: it only decides the rarity shown on stage. */
const RON_PER_EUR = 5;
const MAX_SPONSOR_LENGTH = 120;
const MAX_PRIZE_LENGTH = 300;

interface PrizeRow {
  sponsor: string;
  prize: string;
  tag?: Rarity;
}

/** "1.200", "1 200" and "1,200" are thousands; "20.50" and "20,50" have decimals. */
const AMOUNT =
  /(?<![\d.,])(\d{1,3}(?:([. ,])\d{3})(?:\2\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(euro|eur|€|lei|ron)(?!\p{L})/giu;

function parseAmount(text: string) {
  const [, whole, decimals = '0'] = text.match(/^(.*?)(?:[.,](\d{1,2}))?$/)!;
  return Number(`${whole.replace(/\D/g, '')}.${decimals}`);
}

/** Highest amount mentioned in the text, in euro. */
function valueInEur(text: string) {
  const amounts = [...text.matchAll(AMOUNT)].map(([, digits, , currency]) => {
    const amount = parseAmount(digits);
    return /lei|ron/i.test(currency) ? amount / RON_PER_EUR : amount;
  });
  return Math.max(0, ...amounts);
}

function rarityByValue(eur: number): Rarity {
  if (eur >= MIN_EUR_LEGENDARY) return 'legendary';
  if (eur >= MIN_EUR_EPIC) return 'epic';
  return eur >= MIN_EUR_RARE ? 'rare' : 'common';
}

/** Null for blank and header rows. */
function parseRow(raw: string): PrizeRow | null {
  let tag: Rarity | undefined;
  const line = raw
    .replace(/#(comun|rar|epic|legendar)\b/gi, (_match, name: string) => {
      tag = RARITY_BY_TAG[name.toLowerCase()];
      return '';
    })
    .trim();
  const cells = line
    .split(line.includes('|') ? '|' : '\t')
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length && /^\d+\.?$/.test(cells[0])) cells.shift();
  if (!cells.length || /^(nr\.?|de la cine|oferit de|sponsor|premiu)$/i.test(cells[0])) return null;
  const [first, ...rest] = cells;
  return rest.length ? { sponsor: first, prize: rest.join(' · '), tag } : { sponsor: '', prize: first, tag };
}

export function parsePrizes(text: string, grandLast: boolean): Prize[] {
  const rows = text
    .split(/\r?\n/)
    .map(parseRow)
    .filter((row) => row !== null);
  return rows.map(({ sponsor, prize, tag }, index) => {
    const description = `${sponsor} ${prize}`;
    const isGrand = grandLast && rows.length > 1 && index === rows.length - 1;
    const rar =
      tag ?? (isGrand || /marele premiu/i.test(description) ? 'legendary' : rarityByValue(valueInEur(description)));
    return { sponsor: sponsor.slice(0, MAX_SPONSOR_LENGTH), prize: prize.slice(0, MAX_PRIZE_LENGTH), rar };
  });
}
