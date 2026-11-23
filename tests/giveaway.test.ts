import { describe, expect, it } from 'vitest';
import {
  applyRules,
  isNoise,
  looksListed,
  mentions,
  parseComments,
  parseExclude,
  type Rules,
} from '../src/scripts/giveaway';
import { DEMO_GW_COMMENTS } from '../src/data/demo';

describe('isNoise', () => {
  it.each([
    '',
    '2h',
    '3 likes Reply',
    '1 săpt. 2 aprecieri Răspunde',
    'See translation',
    "ana's profile picture",
    'View all 3 replies',
    '(3)',
  ])('drops %j', (line) => expect(isNoise(line)).toBe(true));
  it.each(['Vreau și eu', 'ana.pop', '😍', '2 bilete'])('keeps %j', (line) => expect(isNoise(line)).toBe(false));
});

describe('parseComments from Instagram', () => {
  it.each([
    ['nothing', ''],
    ['the Instagram demo', DEMO_GW_COMMENTS],
    ['a multi-line comment', 'ana.pop\nprima linie\na doua linie @x\n2h'],
    ['a verified account', 'ana.pop Verified\nvreau și eu\n2h'],
    ['a one-word comment', 'ana.pop\nVreau și eu!\n2h 3 likes Reply\nion.v\nvreau\n1h Reply\nmaria.x\nsuper tare\n2h'],
    ['only one-word comments', 'ion.v\nvreau\n1h Reply\nana\neu\n2h Reply'],
    ['a one-word comment from a verified account', 'ion.v\nVerified\nvreau\n1h Reply\nana.p\nSuper tare\n2h'],
    ['accounts without comments next to a comment', 'ana\nion\nema\nsuper tare'],
    ['lines before the first account', 'Ion Popescu\n@maria\nana.pop\nvreau'],
  ])('handles %s', (_name, text) => {
    expect(parseComments(text, 'instagram')).toMatchSnapshot();
  });
});

describe('parseComments from a list or table', () => {
  it.each([
    ['nothing', ''],
    ['accounts with and without @', '@ana.pop\nion.v\n@Ion.V\n\nema'],
    ['names', 'Ana Pop\nIon  Popescu\n3. Ana 🌸\nana pop'],
    ['follow buttons', 'ana\nFollow\nion\nFollow'],
    ['a table', 'Nume\tComentariu\n@Ana.Pop\tvreau @x\nIon  Popescu\tși eu\tda'],
  ])('handles %s', (_name, text) => {
    expect(parseComments(text, 'list')).toMatchSnapshot();
  });
});

describe('looksListed', () => {
  it.each(['ana\nion', '@ana\n@ion', 'ana\tvreau\nion\tda'])('spots %j', (text) =>
    expect(looksListed(text)).toBe(true),
  );
  it.each(['', DEMO_GW_COMMENTS, 'ion.v\nvreau\n1h Reply'])('accepts copied comments (%#)', (text) =>
    expect(looksListed(text)).toBe(false),
  );
});

describe('mentions', () => {
  it('counts distinct tags without the author', () =>
    expect([...mentions('@Ana @ana. @ion @me', 'me')]).toEqual(['ana', 'ion']));
  it('ignores emails', () => expect([...mentions('scrie la ana@gmail.com', 'x')]).toEqual([]));
  it('counts tags without spaces between them', () =>
    expect([...mentions('@ana@ion.v', 'x')]).toEqual(['ana', 'ion.v']));
});

it('parses excluded accounts', () =>
  expect(parseExclude('@Ana, ion;\nIon  Popescu\nana')).toEqual(['ana', 'ion', 'ion popescu']));

describe('applyRules', () => {
  const comments = [
    { user: 'ana', name: '@ana', text: 'Cafea @ion' },
    { user: 'Ana', name: '@Ana', text: 'CĂFEA @ema' },
    { user: 'ion', name: '@ion', text: 'fără' },
    { user: 'ema', name: '@ema', text: '@ion' },
    { user: 'brand', name: '@brand', text: 'cafea @ana' },
  ];
  const rules: Rules = { minTags: 1, keyword: 'cafea', exclude: ['brand'], mode: 'person' };
  const run = (over: Partial<Rules>, hasText = true) => {
    const { valid, rejected, weight } = applyRules(comments, { ...rules, ...over }, hasText);
    return { valid: valid.map((e) => [e.user, e.valid, weight(e)]), rejected };
  };
  it('applies every rule', () => expect(run({})).toMatchSnapshot());
  it('weighs by comments', () => expect(run({ mode: 'comment', minTags: 2, keyword: '' })).toMatchSnapshot());
  it('counts all valid comments', () => expect(run({ mode: 'comment', minTags: 0, keyword: '' })).toMatchSnapshot());
  it('skips text rules for plain lists', () => expect(run({}, false)).toMatchSnapshot());
});
