import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect } from 'react';
import type { Plan } from '../lib/writer';

/** How long the confirmation stays before the dialog closes itself. */
const SHOWN_MS = 1500;

/**
 * The last step of a write dialog: says what was saved, where you are already
 * looking, then closes the dialog by itself. A tap closes it sooner.
 */
export function Saved({ plan, deleted, onDone }: { plan: Plan; deleted?: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, SHOWN_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  // The first change is the one the dialog was opened for; the rest follow from it
  const [main, ...rest] = plan.changes;
  return (
    <div role="status" className="grid cursor-pointer justify-items-center gap-1 py-5 text-center" onClick={onDone}>
      <IconCircleCheck size={40} stroke={1.5} className="mb-1 text-good" aria-hidden="true" />
      <div className="text-base font-semibold">{deleted ? 'Deleted from your sheet' : 'Saved to your sheet'}</div>
      <div className="text-[13px] text-ink-2">{deleted ? plan.title.replace(/^Delete\s+/, '') : plan.title}</div>
      {!deleted && (
        <div className="text-[13px] text-ink-3 tabular-nums">
          {main && <>{main.where}: <b className="font-semibold text-ink">{main.after}</b></>}
          {rest.length > 0 && ` · +${rest.length} more`}
        </div>
      )}
    </div>
  );
}
