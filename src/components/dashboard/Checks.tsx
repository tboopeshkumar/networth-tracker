import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { useMemo } from 'react';
import { runChecks } from '../../lib/checks';
import type { Grids, Model } from '../../lib/model';
import { Card } from '../ui';

export function Checks({ model, values, canEdit }: { model: Model; values: Grids; canEdit: boolean }) {
  const checks = useMemo(() => runChecks(model, values, canEdit), [model, values, canEdit]);
  return (
    <Card title="Worth a look" sub="Checked against the sheet on every load">
      {checks.length
        ? (
          <div className="space-y-2">
            {checks.map((c) => (
              <div className="flex gap-2.5 rounded-xl border border-warn/35 bg-warn-soft px-3 py-2.5 text-[13px]" key={c.id}>
                <IconAlertTriangle size={17} stroke={1.75} className="mt-px flex-none text-[color-mix(in_srgb,var(--warn)_70%,var(--ink-1))]" aria-hidden="true" />
                <span><b className="font-semibold">{c.title}</b> <span className="text-ink-2">{c.detail}</span></span>
              </div>
            ))}
          </div>
        )
        : (
          <div className="flex items-center gap-2 text-[13px] text-good">
            <IconCircleCheck size={17} stroke={1.75} aria-hidden="true" />Nothing to flag.
          </div>
        )}
    </Card>
  );
}
