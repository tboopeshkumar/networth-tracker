// The Google Sheets reader: which tabs each request asks for. No network:
// fetch is replaced by a stand-in that answers like the Sheets API.

import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { GoogleSheets, MissingTabError } from '../src/lib/sheets';

afterEach(() => vi.unstubAllGlobals());

/** Answers batchGet with a one-cell grid per tab, naming the render option; records each request. */
function stubSheetsApi() {
  const asked: { render: string; ranges: string[] }[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const q = new URL(url).searchParams;
    const render = q.get('valueRenderOption') ?? '';
    const ranges = q.getAll('ranges');
    asked.push({ render, ranges });
    return new Response(JSON.stringify({ valueRanges: ranges.map((r) => ({ values: [[`${render} of ${r}`]] })) }), { status: 200 });
  });
  return asked;
}

test('script-written tabs are downloaded once, as values; every other tab with its formulas too', async () => {
  const asked = stubSheetsApi();
  const data = await new GoogleSheets('sheet-id', () => 'token').read(['Net Worth', 'Daily Log', 'Mutual Funds'], ['Daily Log']);

  const by = Object.fromEntries(asked.map((a) => [a.render, a.ranges]));
  assert.deepEqual(by.UNFORMATTED_VALUE, ["'Net Worth'", "'Daily Log'", "'Mutual Funds'"]);
  assert.deepEqual(by.FORMULA, ["'Net Worth'", "'Mutual Funds'"], 'no formulas request for Daily Log');
  assert.deepEqual(data.formulas['Net Worth'], [["FORMULA of 'Net Worth'"]]);
  assert.equal(data.formulas['Daily Log'], data.values['Daily Log'], 'its formulas grid is its values');
});

test('when every tab is values-only, no formulas request is made at all', async () => {
  const asked = stubSheetsApi();
  await new GoogleSheets('sheet-id', () => 'token').read(['Daily Log'], ['Daily Log']);
  assert.deepEqual(asked.map((a) => a.render), ['UNFORMATTED_VALUE']);
});

test('a read naming a tab the sheet no longer has is reported as such', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"Unable to parse range: \'Old Tab\'"}}', { status: 400 }));
  await assert.rejects(new GoogleSheets('sheet-id', () => 'token').read(['Old Tab']), MissingTabError);
});
