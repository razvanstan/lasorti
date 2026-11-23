import { describe, expect, it } from 'vitest';
import { imageContent, shortenName, wrapText } from '../src/scripts/share-image';
import type { DrawState, Result } from '../src/scripts/types';

const measure = (text: string) => [...text].length;
const result = (name: string, more: Partial<Result> = {}): Result => ({
  id: name,
  name,
  email: 'secret@example.com',
  key: '0722000111',
  sponsor: 'S',
  prize: 'Premiu',
  rar: 'common',
  at: 1,
  ...more,
});
const state = (results: Result[]) =>
  ({ results, meta: { title: 'Gala', endedAt: Date.UTC(2026, 10, 23) } }) as unknown as DrawState;

it.each([
  ['Ana Pop', 'Ana P.'],
  ['Ana Maria Șerban', 'Ana Ș.'],
  ['@ana.pop', '@ana.pop'],
  ['Ana', 'Ana'],
])('shortens %s', (name, expected) => expect(shortenName(name)).toBe(expected));

describe('wrapText', () => {
  it('breaks between words', () => expect(wrapText('unu doi trei', 8, 3, measure)).toEqual(['unu doi', 'trei']));
  it('cuts what does not fit', () =>
    expect(wrapText('unu doi trei patru', 8, 2, measure)).toEqual(['unu doi', 'trei pa…']));
  it('cuts long words', () => expect(wrapText('abcdefghij', 5, 1, measure)).toEqual(['abcd…']));
});

describe('imageContent', () => {
  const draw = state([result('Ana Pop'), result('Ion Ion'), result('Ema Em', { reserve: true, label: 'Rezerva 1' })]);
  it('lists the winners without reserves and without contact data', () => {
    const content = imageContent(draw, { choice: 'all', format: 'story', shortNames: true });
    expect(content.lines.map(({ name }) => name)).toEqual(['Ana P.', 'Ion I.']);
    expect(content.date).toBe('23 noiembrie 2026');
    expect(JSON.stringify(content)).not.toMatch(/secret|0722/);
  });
  it('shows one winner with the full name', () => {
    const content = imageContent(draw, { choice: 2, format: 'square', shortNames: false });
    expect([content.heading, content.lines]).toEqual(['Rezerva 1', [{ name: 'Ema Em', detail: 'Premiu' }]]);
  });
  it('counts the winners that do not fit', () => {
    const many = state(Array.from({ length: 8 }, (_, i) => result(`P ${i}`)));
    expect(imageContent(many, { choice: 'all', format: 'square', shortNames: false }).hidden).toBe(3);
  });
});
