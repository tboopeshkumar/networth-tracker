// Reading the sheet: one round of requests when the tab list is as last time,
// and the right data however the tabs changed in between. Uses the fixture.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { beforeEach, test } from 'vitest';

import { DemoSheets, type Fixture } from '../src/lib/demoSheets';
import { forgetAllTabs, rememberedTabs } from '../src/lib/tabCache';
import { loadAll } from '../src/lib/writer';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));

// The browser's storage, for Node
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
});
beforeEach(() => store.clear());

/** The demo backend, counting its reads (each read is one round of requests). */
class Counting extends DemoSheets {
  reads: string[][] = [];
  override async read(tabs: readonly string[], valuesOnly?: readonly string[]) {
    this.reads.push([...tabs]);
    return super.read(tabs, valuesOnly);
  }
}
const fixture = (): Fixture => JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
const extras = (f: Fixture) => f.sheets.length;

withFixture('the first load takes two rounds, every load after it one, with the same data', async () => {
  const demo = new Counting(fixture());
  const first = await loadAll(demo);
  assert.equal(demo.reads.length, 2);
  assert.ok(rememberedTabs('demo').length > 0, 'its extra tabs are remembered');

  demo.reads = [];
  const again = await loadAll(demo);
  assert.equal(demo.reads.length, 1, 'one round');
  assert.deepEqual(Object.keys(again.data.values).sort(), Object.keys(first.data.values).sort());
  assert.deepEqual(again.model.totals, first.model.totals);
  assert.equal(extras(fixture()), extras(demo.f));
});

withFixture('a tab added since is fetched in a short second round, and included from then on', async () => {
  const demo = new Counting(fixture());
  await loadAll(demo);
  const added = 'Feed Status';
  if (demo.f.sheets.some((s) => s.title === added)) return;
  demo.f.sheets.push({ title: added, sheetId: 999 });
  demo.f.values[added] = [['Feed', 'Status', 'Message', 'Last run', 'Last success'], ['NPS NAVs', 'Error', 'x', 1, 1]];
  demo.f.formulas[added] = demo.f.values[added];

  demo.reads = [];
  const loaded = await loadAll(demo);
  assert.deepEqual(demo.reads.map((r) => r.includes(added)), [false, true]);
  assert.deepEqual(demo.reads[1], [added], 'only the new tab');
  assert.equal(loaded.model.feeds[0]?.feed, 'NPS NAVs');

  demo.reads = [];
  await loadAll(demo);
  assert.equal(demo.reads.length, 1);
});

withFixture('a remembered tab that was deleted or renamed falls back to the two-step read', async () => {
  const demo = new Counting(fixture());
  await loadAll(demo);
  const gone = rememberedTabs('demo').find((t) => t === 'Rates Feed') ?? rememberedTabs('demo')[0];
  demo.f.sheets = demo.f.sheets.filter((s) => s.title !== gone);

  demo.reads = [];
  const loaded = await loadAll(demo);
  assert.equal(demo.reads.length, 3, 'the failed attempt, then the two-step read');
  assert.ok(!(gone in loaded.data.values));
  assert.ok(!rememberedTabs('demo').includes(gone));

  demo.reads = [];
  await loadAll(demo);
  assert.equal(demo.reads.length, 1);
});

test('revoking access forgets every sheet\'s tabs', () => {
  store.set('networth.tabs', JSON.stringify({ a: ['X'] }));
  forgetAllTabs();
  assert.deepEqual(rememberedTabs('a'), []);
});
