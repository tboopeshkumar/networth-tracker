// The Real Estate tab as a holdings table. Made-up data: no real figures.

import { describe, expect, it } from 'vitest';
import { SPECS, locateTable, readRows, type Grid, type RowOf } from '../src/lib/model';

const grid: Grid = [
  ['Real Estate (Fractional)'],
  [],
  [],
  ['Provider', 'Property', 'Value (AED)', 'Value (INR)'],
  ['Acme Shares', 'Studio, Example Tower', 1000],
  ['Acme Shares', '1BR, Sample Residences', 2500.5],
  ['', 'TOTAL', 3500.5, 87512.5],
];

describe('real estate table', () => {
  const table = locateTable(grid, SPECS.realEstate);
  const rows = readRows<RowOf<'realEstate'>>(grid, table);

  it('finds the properties and stops at the total row', () => {
    expect(table.totalRow).toBe(6);
    expect(rows.map((r) => r.property)).toEqual(['Studio, Example Tower', '1BR, Sample Residences']);
    expect(rows.map((r) => r.valueAed)).toEqual([1000, 2500.5]);
  });

  it('spans the rupee column when the sheet has one, so a deleted row takes its cell with it', () => {
    expect(table.cols.valueInr).toBe(3);
    expect(table.maxCol).toBe(3);
  });

  it('works without the rupee column', () => {
    const narrow = grid.map((r) => r.slice(0, 3));
    expect(readRows(narrow, locateTable(narrow, SPECS.realEstate))).toHaveLength(2);
  });

  it('reads an Invested column wherever it sits, and does without one', () => {
    expect(table.cols.invested).toBeUndefined();
    const withInvested = grid.map((r, i) => (i < 3 ? r : [r[0], r[1], i === 3 ? 'Invested' : i === 6 ? 3200 : i === 4 ? 900 : 2300, ...r.slice(2)]));
    const t = locateTable(withInvested, SPECS.realEstate);
    expect(t.cols).toMatchObject({ invested: 2, valueAed: 3, valueInr: 4 });
    expect(readRows<RowOf<'realEstate'> & { invested: number }>(withInvested, t).map((r) => [r.invested, r.valueAed])).toEqual([[900, 1000], [2300, 2500.5]]);
  });
});
