// Rendering guarantees that don't need a browser.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import { Positions } from '../src/components/dashboard/Positions';
import { StatTiles } from '../src/components/dashboard/StatTiles';
import { DemoSheets, type Fixture } from '../src/lib/demoSheets';
import { makeLinker } from '../src/lib/links';
import { loadAll } from '../src/lib/writer';

const FIX = new URL('../demo/fixture.json', import.meta.url);

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

test('summary tiles render without a sheet-specific layout', async () => {
  if (!existsSync(FIX)) return;
  const { model } = await loadAll(new DemoSheets(JSON.parse(readFileSync(FIX, 'utf8')) as Fixture));
  const html = renderToStaticMarkup(<StatTiles model={model} />);
  for (const label of ['Invested', 'Total net worth', 'Unrealised P&amp;L', 'Overall return']) {
    assert.ok(html.includes(label), label);
  }
});
