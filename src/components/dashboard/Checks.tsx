import { useMemo } from 'react';
import { runChecks } from '../../lib/checks';
import type { Grids, Model } from '../../lib/model';
import { Card } from '../ui';

export function Checks({ model, values, canEdit }: { model: Model; values: Grids; canEdit: boolean }) {
  const checks = useMemo(() => runChecks(model, values, canEdit), [model, values, canEdit]);
  return (
    <Card title="Worth a look" sub="Checked against the sheet on every load">
      {checks.length
        ? checks.map((c) => (
          <div className="flag" key={c.id}>
            <span className="flag-ic" aria-hidden="true">▲</span>
            <span><b>{c.title}</b> {c.detail}</span>
          </div>
        ))
        : <div className="ok">✓ Nothing to flag.</div>}
    </Card>
  );
}
