// A page left open across an update can't load the parts it loads on demand.

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { isOutdated } from '../src/hooks/useUpdateCheck';

test('each browser\'s wording of a missing on-demand file is recognised, nothing else is', () => {
  const url = 'https://example.github.io/networth-tracker/assets/pdf-R2SErDUh.js';
  assert.ok(isOutdated(new TypeError(`Failed to fetch dynamically imported module: ${url}`)), 'Chrome');
  assert.ok(isOutdated(new TypeError('Importing a module script failed.')), 'Safari');
  assert.ok(isOutdated(new TypeError(`error loading dynamically imported module: ${url}`)), 'Firefox');
  assert.ok(!isOutdated(new Error('This PDF is password protected.')));
  assert.ok(!isOutdated(new Error('Sheets API 500: backend error')));
});
