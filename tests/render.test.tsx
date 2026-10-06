// Rendering guarantees that don't need a browser.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import { PickScreen } from '../src/components/Screens';
import { Holdings } from '../src/components/dashboard/Holdings';
import { Positions } from '../src/components/dashboard/Positions';
import { Summary } from '../src/components/dashboard/Summary';
import { DemoSheets, type Fixture } from '../src/lib/demoSheets';
import { makeLinker } from '../src/lib/links';
import { loadAll } from '../src/lib/writer';

const FIX = new URL('../demo/fixture.json', import.meta.url);

test('the sheet chooser offers a paste-a-link path for iPhone', () => {
  const html = renderToStaticMarkup(<PickScreen onPick={() => {}} onLink={() => {}} />);
  assert.ok(html.includes('Choose from Google Drive'));
  assert.ok(html.includes('On iPhone or iPad?'));
  assert.ok(/<input[^>]*type="url"/.test(html), 'a link field');
});

test('sheet text is escaped, never interpreted as markup', async () => {
  if (!existsSync(FIX)) return;
  const fixture = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  const evil = '<img src=x onerror=alert(1)>';

  // Plant hostile text in the first Net Worth line's name
  const { model: m0 } = await loadAll(new DemoSheets(fixture));
  const line = m0.rows.networth[0];
  fixture.values['Net Worth'][line._row][m0.tables.networth.cols.asset] = evil;

  const { model } = await loadAll(new DemoSheets(fixture));
  const html = renderToStaticMarkup(<Positions model={model} linkOf={makeLinker(model)} onDrill={() => {}} />);

  assert.ok(!html.includes('<img'), 'no element was injected');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the text is shown literally');
});

test('summary renders without a sheet-specific layout', async () => {
  if (!existsSync(FIX)) return;
  const { model } = await loadAll(new DemoSheets(JSON.parse(readFileSync(FIX, 'utf8')) as Fixture));
  const html = renderToStaticMarkup(<Summary model={model} />);
  for (const label of ['Invested capital', 'now worth', 'Unrealised', 'Liquid cash', 'Equity exposure', 'Held in UAE']) {
    assert.ok(html.includes(label), label);
  }
});

test('an open ledger offers add in its header and delete on every entry, to editors only', async () => {
  if (!existsSync(FIX)) return;
  const { model } = await loadAll(new DemoSheets(JSON.parse(readFileSync(FIX, 'utf8')) as Fixture));
  const L = Object.values(model.ledgers)[0];
  if (!L) return;
  const render = (canEdit: boolean) => renderToStaticMarkup(
    <Holdings model={model} canEdit={canEdit} onEdit={() => {}} open={new Set([`ledger:${L.sheet}`] as const)} onToggle={() => {}} flash={null} sectionRef={() => {}} only="Money lent" />,
  );
  const count = (html: string, needle: string) => html.split(needle).length - 1;

  const html = render(true);
  assert.equal(count(html, `aria-label="Add to ${L.title.replace(/&/g, '&amp;')}"`), 1, 'add button on the ledger header');
  // Each entry is drawn twice: as a card for phones and as a table row for wider screens
  assert.equal(count(html, 'aria-label="Delete"'), L.rows.length * 2, 'a delete button per entry');

  const viewer = render(false);
  assert.equal(count(viewer, 'aria-label="Delete"'), 0);
  assert.equal(count(viewer, 'aria-label="Add to'), 0);
});
