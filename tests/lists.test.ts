import { describe, expect, it } from 'vitest';
import { canonicalList, parsePeople } from '../src/scripts/people';
import { parsePrizes } from '../src/scripts/prizes';
import { pickWeighted, randomInt } from '../src/scripts/random';
import type { DedupeBy } from '../src/scripts/types';
import { escapeHtml, normalizeName } from '../src/scripts/text';

const people = (text: string, dedupe: DedupeBy = 'email-name', column = '') => {
  const { list, dups } = parsePeople(text, dedupe, column);
  return {
    list: list.map((p) => [p.id, p.name, p.email]),
    dups: dups.map((d) => [d.name, d.email, d.why, d.keep.name]),
  };
};

describe('parsePeople', () => {
  it.each([
    ['header and blank rows', 'Nume\tEmail\n\nAna Pop\tana@e.ro'],
    ['timestamps and row numbers', '12.11.2026 10:00\t1\tAna Pop\tANA@e.ro\n2\tIon Pop\tion@e.ro'],
    ['numbered names', '1. Ana Pop\n2) Ion Pop'],
    ['letter case', 'ana-maria pop\nION ȘTEFĂNESCU\nvan der Berg'],
    ['email only', 'ana.pop@e.ro'],
    ['duplicate emails', 'Ana\ta@e.ro\nAltă Ana\tA@E.RO'],
    ['duplicate names in another order', 'Ana Pop\nPOP ANĂ\nAna-Pop'],
    ['an email learned from a duplicate name', 'Ana Pop\nPop Ana\tana@e.ro\nAlta\tana@e.ro'],
    ['separators', 'Ana Pop;ana@e.ro\nIon Pop|ion@e.ro\nEma Pop,ema@e.ro'],
    ['separate name columns', 'Popescu\tIon\tion@e.ro\nPopescu\tMaria\tmaria@e.ro'],
    ['comma inside the name', 'Popescu, Ion\nPopescu, Maria'],
    ['name and email in one cell', 'Ion Popescu <ion@e.ro>\nEma Pop ema@e.ro'],
    ['names that differ only by a number', 'Echipa 1\nEchipa 2\nEchipa 1'],
    ['extra columns', 'Ana Pop\tBucurești\tana@e.ro\nIon\t0722 000 111\nEma\tema@e.ro\t12.11.2026'],
    ['Cyrillic duplicates', 'Іван Петренко\nІван Петренко'],
  ])('handles %s', (_name, text) => {
    expect(people(text)).toMatchSnapshot();
  });
  it('keeps people with the same name when asked to', () => {
    expect(people('Ana Pop\nAna Pop', 'email')).toMatchSnapshot();
  });
});

describe('unique field', () => {
  const names = (text: string, dedupe: DedupeBy, column = '') => {
    const { list, dups, missing, error } = parsePeople(text, dedupe, column);
    return { list: list.map((p) => [p.name, p.key].filter(Boolean).join('/')), dups: dups.length, missing, error };
  };
  it('recognises the same phone in any form', () =>
    expect(
      names('Ana\t0722 000 111\nAna P\t+40722000111\nIon\t722000111\nEma\t0040 722-000-111\nDan', 'phone'),
    ).toEqual({
      list: ['Ana/0722000111', 'Dan'],
      dups: 3,
      missing: 1,
      error: undefined,
    }));
  it('does not show phones used as names', () =>
    expect(names('0722000111\n0722 000 222', 'phone').list).toEqual(['•••111/0722000111', '•••222/0722000222']));
  it('keeps people with the same email when the phone is unique', () =>
    expect(names('Ana\ta@e.ro\t0722000111\nIon\ta@e.ro\t0722000222', 'phone').list).toHaveLength(2));
  it('finds a column by name and skips the header', () =>
    expect(names('Cod Bilet;Nume\nA1;Ana Pop\na1;Ion Pop\nA2;Ana Pop', 'code', 'cod bilet')).toEqual({
      list: ['Ana Pop/A1', 'Ana Pop/A2'],
      dups: 1,
      missing: 0,
      error: undefined,
    }));
  it('finds a column by number, with empty cells before it', () =>
    expect(names('Ana\t\t101\nIon\t\t102\nEma\tx\t101', 'code', '3').list).toEqual(['Ana/101', 'Ion/102']));
  it('draws plain ticket numbers', () =>
    expect(names('101\n102\n101', 'code', '1').list).toEqual(['101/101', '102/102']));
  it('explains an unknown or missing column', () => {
    expect(names('Nume\nAna', 'code', 'Cod').error).toBe('Nu găsesc coloana „Cod” în antet.');
    expect(names('Nume\nAna', 'code').error).toContain('Scrie coloana unică');
  });
  it('keeps every row when duplicates stay, with distinct ids', () => {
    const { list } = parsePeople('Ana\ta@e.ro\nAna\ta@e.ro', 'none');
    expect(new Set(list.map((p) => p.id)).size).toBe(2);
  });
  it('includes the key in the published list', () =>
    expect(canonicalList(parsePeople('A1;Ana', 'code', '1').list)).toBe('Ana\tA1\n'));
});

describe('parsePrizes', () => {
  it.each([
    ['sponsor and prize', 'X | Voucher\nDoar premiu\nA\tB\tC'],
    ['header and numbering', 'Nr.\tSponsor\tPremiu\n1\tX\tVoucher'],
    ['forced rarity', 'X | Voucher #epic\nY #LEGENDAR'],
    [
      'value thresholds',
      'a 249 euro\nb 250 euro\nc 1.000 €\nd 3000 eur\ne 1.250 lei\nf 15000 ron\ng 1249 lei\nMarele premiu',
    ],
    [
      'decimals and nearby numbers',
      'a 20.50 euro\nb 1.200,50 lei\nc iPhone 15 3000 lei\nd 1,200 euro\ne 1 200 euro\nf 12.500.000 lei\ng 250€\nh 249,99 euro',
    ],
  ])('handles %s', (_name, text) => {
    expect(parsePrizes(text, false)).toMatchSnapshot();
  });
  it('promotes the last prize only when there are several', () => {
    expect([parsePrizes('a\nb', true), parsePrizes('a', true)]).toMatchSnapshot();
  });
});

describe('canonicalList', () => {
  const ana = { id: 'a', name: 'Ana', email: 'a@e.ro' };
  it('lists names and emails', () =>
    expect(canonicalList([ana, { id: 'b', name: 'Ion', email: '' }])).toBe('Ana\ta@e.ro\nIon\n'));
  it('lists chances when they differ', () =>
    expect(canonicalList([ana, { id: 'b', name: 'Ion', email: '', w: 3 }])).toBe('Ana\t1\nIon\t3\n'));
});

describe('text helpers', () => {
  it('escapes HTML', () => expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;'));
  it('escapes missing values as empty text', () => expect(escapeHtml(null)).toBe(''));
  it('normalises names', () => expect(normalizeName('  Șerban-ION, Popă ')).toBe('ion popa serban'));
});

describe('randomness', () => {
  it('stays in range and is roughly uniform', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[randomInt(3)]++;
    counts.forEach((n) => expect(Math.abs(n - 10000)).toBeLessThan(500));
  });
  it('respects the number of chances', () => {
    const pool = [1, 3, 6].map((w, i) => ({ id: String(i), name: '', email: '', w }));
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[pickWeighted(pool)]++;
    [3000, 9000, 18000].forEach((n, i) => expect(Math.abs(counts[i] - n)).toBeLessThan(600));
  });
});
