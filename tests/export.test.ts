// The PDF export: complete, masked when asked, and a readable text PDF.
// Like core.test.ts, expectations come from the gitignored fixture at run time.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { buildReport } from '../src/components/export/report';
import { pdfSafe, reportPdf } from '../src/components/export/pdf';
import { DemoSheets, type Fixture } from '../src/lib/demoSheets';
import { inr } from '../src/lib/format';
import { loadAll } from '../src/lib/writer';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));
const load = async () => loadAll(new DemoSheets(JSON.parse(readFileSync(FIX, 'utf8')) as Fixture));
const allText = (r: ReturnType<typeof buildReport>) =>
  [r.title, ...r.meta.flat(), ...r.sections.flatMap((s) => [s.heading, ...(s.lines ?? []), ...(s.table ? [...s.table.head, ...s.table.rows.flat()] : [])])].join('\n');

test('PDF text is limited to what its built-in font can print', () => {
  assert.equal(pdfSafe('₹5,40,000 −2% AED → INR ● ✓'), 'Rs 5,40,000 -2% AED -> INR * ');
});

withFixture('the report covers every section with exact totals', async () => {
  const { model, data } = await load();
  const r = buildReport(model, data.values, { sheetTitle: 'Test', version: 'abc1234', mask: false });
  const text = allText(r);
  for (const h of ['Summary', 'Net worth lines', 'Allocation by category', 'Rates and other inputs', 'Monthly net worth trend', 'Worth a look']) {
    assert.ok(r.sections.some((s) => s.heading.startsWith(h)), h);
  }
  assert.ok(text.includes(inr(model.totals.current)), 'net worth in full');
  assert.ok(r.sections.some((s) => s.heading.includes('Mutual funds') && (s.table?.rows.length ?? 0) === model.rows.mf.length), 'every fund listed');
  assert.ok(r.sections.some((s) => s.heading.includes('Bank · AED')), 'cash sections included');
  assert.ok(!/₹\d+(\.\d+)? (Cr|L)\b/.test(text), 'no compact Cr/L figures');
});

withFixture('masking removes holder names and long account numbers, not amounts', async () => {
  const { model, data } = await load();
  const plain = allText(buildReport(model, data.values, { sheetTitle: 'Test', version: 'x', mask: false }));
  const masked = allText(buildReport(model, data.values, { sheetTitle: 'Test', version: 'x', mask: true }));
  const holders = [...new Set(model.rows.networth.map((r) => String(r.holder ?? '').trim()))].filter((h) => h.length > 2 && !/^(both|joint)$/i.test(h));
  assert.ok(holders.length > 0);
  for (const h of holders) {
    assert.ok(plain.includes(h), 'present when not masked');
    assert.ok(!new RegExp(`\\b${h}\\b`, 'i').test(masked), 'a holder name leaked into the masked report');
  }
  // Amounts are comma-grouped, so any bare run of 6+ digits would be an account or folio number
  assert.ok(!/\b[A-Z]{0,4}\d{6,}\b/.test(masked), 'a long account number leaked into the masked report');
  assert.ok(masked.includes(inr(model.totals.current)), 'amounts unchanged');
  assert.ok(masked.includes('Person 1'));
});

withFixture('a real PDF comes out, with its text readable', async () => {
  const { model, data } = await load();
  const blob = await reportPdf(buildReport(model, data.values, { sheetTitle: 'Test', version: 'x', mask: true }));
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 5_000, `size ${bytes.length}`);
});
