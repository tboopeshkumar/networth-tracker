// MF Central Consolidated Account Summary: reading and matching.
// Made-up funds and numbers, laid out like the real statement.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { casHoldings, casNumber, matchCas, nameScore, type TextItem } from '../src/lib/cas';
import type { Model } from '../src/lib/model';

// Header row, then holdings: folio at x 34, scheme at 102, numbers from 368, date at 508
const header: TextItem[] = [
  { x: 332, y: 458, str: 'Invested Value' }, { x: 436, y: 458, str: 'Balance' }, { x: 660, y: 458, str: 'Market Value' },
  { x: 43, y: 452, str: 'Folio No.' }, { x: 171, y: 452, str: 'Scheme Details' }, { x: 508, y: 452, str: 'NAV Date' }, { x: 595, y: 452, str: 'NAV' },
];
const holding = (y: number, folio: string, name: string | null, invested: string, units: string, nav: string, value: string): TextItem[] => [
  { x: 34, y, str: folio }, ...(name ? [{ x: 102, y, str: name }] : []),
  { x: 368, y, str: invested }, { x: 450, y, str: units }, { x: 508, y, str: '30-Sep-2026' }, { x: 610, y, str: nav }, { x: 689, y, str: value },
  { x: 780, y: y - 5, str: '(+1.00%)' },
];
const page: TextItem[] = [
  ...header,
  ...holding(418, '11112222', 'Example Flexi Cap Fund - Direct Plan Growth', '1,00,000.00', '1,234.567', '90.1234', '1,11,262.00'),
  // a long name wrapping above and below its number line
  { x: 102, y: 391, str: 'Sample Large Cap Fund (erstwhile Bluechip Fund) -' },
  ...holding(385, '33334444', null, '2,50,000.00', '2,000.000', '130.00', '2,60,000.00'),
  { x: 102, y: 379, str: 'Direct Plan - Growth' },
  // a closed folio
  ...holding(352, '55556666', 'Example Mid Cap Fund - Direct Growth', '0.00', '0.000', '100.00', '0.00'),
];

test('CAS numbers, including bracketed losses', () => {
  assert.equal(casNumber('1,23,456.78'), 123456.78);
  assert.equal(casNumber('(9,876.50)'), -9876.5);
  assert.equal(casNumber('30-Sep-2026'), null);
});

test('each holding line becomes one holding, wrapped names joined in order', () => {
  const h = casHoldings([page]);
  assert.equal(h.length, 3);
  assert.deepEqual(h[0], { folio: '11112222', scheme: 'Example Flexi Cap Fund - Direct Plan Growth', invested: 100000, units: 1234.567, navDate: '30-Sep-2026', nav: 90.1234, value: 111262 });
  assert.equal(h[1].scheme, 'Sample Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan - Growth');
  assert.equal(h[1].units, 2000);
  assert.equal(h[2].units, 0);
  assert.deepEqual(casHoldings([[{ x: 10, y: 10, str: 'no table here' }]]), []);
});

test('names compare without plan and option words or former names', () => {
  assert.ok(nameScore('Sample Large Cap Fund', 'Sample Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan - Growth') === 1);
  assert.ok(nameScore('Example Flexi Cap', 'Other House Small Cap Fund') < 0.5);
});

test('funds match by folio (digits only, suffixes allowed) and name; closed folios are ignored', () => {
  const model = { rows: { mf: [
    { _key: 'a', _row: 5, fund: 'Example Flexi Cap', folio: '1111-2222', units: 1000 },
    { _key: 'b', _row: 6, fund: 'Sample Large Cap Fund', folio: '33334444/01', units: 2000 },
    { _key: 'c', _row: 7, fund: 'Example Mid Cap Fund', folio: '55556666', units: 5 },
    { _key: 'd', _row: 8, fund: 'Someone Else Fund', folio: '99990000', units: 1 },
  ] } } as unknown as Model;
  const r = matchCas(model, casHoldings([page]));
  assert.deepEqual(r.matches.map((m) => [m.rec._key, m.holding.folio, m.by]), [['a', '11112222', 'folio'], ['b', '33334444', 'folio']]);
  assert.deepEqual(r.notInCas.map((x) => x._key), ['c', 'd'], 'a zero-unit folio is not a match');
  assert.equal(r.notInSheet.length, 0);
});
