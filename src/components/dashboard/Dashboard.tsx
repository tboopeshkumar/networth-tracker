import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeLinker, type ViewId } from '../../lib/links';
import type { Loaded } from '../../lib/writer';
import { ChangeChart } from '../charts/ChangeChart';
import { TrendChart } from '../charts/TrendChart';
import { IconPlus } from '@tabler/icons-react';
import { BTN, Card, type OnEdit } from '../ui';
import { Allocation } from './Allocation';
import { Checks } from './Checks';
import { Holdings } from './Holdings';
import { Positions } from './Positions';
import { RatesInputs } from './RatesInputs';
import { Summary } from './Summary';

interface Props {
  loaded: Loaded;
  canEdit: boolean;
  onEdit: OnEdit;
}

export function Dashboard({ loaded: { model, data }, canEdit, onEdit }: Props) {
  const linkOf = useMemo(() => makeLinker(model), [model]);
  const trend = model.rows.trend;

  // Holdings sections: which are open survives edits and reloads
  const [open, setOpen] = useState<ReadonlySet<ViewId>>(() => new Set(['mf']));
  const [flash, setFlash] = useState<ViewId | null>(null);
  const [scrollTo, setScrollTo] = useState<ViewId | null>(null);
  const sections = useRef(new Map<ViewId, HTMLDetailsElement>());

  const toggle = useCallback((id: ViewId, isOpen: boolean) => {
    setOpen((prev) => {
      if (prev.has(id) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // Drilling down from a Net Worth line: open that section, then bring it into view
  const drill = useCallback((id: ViewId) => {
    toggle(id, true);
    setScrollTo(id);
  }, [toggle]);

  useEffect(() => {
    if (!scrollTo) return;
    sections.current.get(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlash(scrollTo);
    setScrollTo(null);
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [scrollTo]);

  const sectionRef = useCallback((id: ViewId, el: HTMLDetailsElement | null) => {
    if (el) sections.current.set(id, el);
    else sections.current.delete(id);
  }, []);

  return (
    <>
      <Summary model={model} />
      <Positions model={model} linkOf={linkOf} onDrill={drill} />
      <Holdings model={model} canEdit={canEdit} onEdit={onEdit}
        open={open} onToggle={toggle} flash={flash} sectionRef={sectionRef} />
      <RatesInputs model={model} canEdit={canEdit} onEdit={onEdit} />
      <Checks model={model} values={data.values} canEdit={canEdit} />

      <Card
        title="Net worth over time"
        sub={`${trend.length} recorded months · ringed points carry a note`}
        action={canEdit && <button type="button" className={BTN} onClick={() => onEdit({ kind: 'add', id: 'trend' })}><IconPlus size={14} stroke={2} aria-hidden="true" />Snapshot</button>}
      >
        <TrendChart series={trend} />
      </Card>
      <Card title="Month-on-month change" sub="Recorded saving or drawdown between entries">
        <ChangeChart series={trend} />
      </Card>
      <Allocation model={model} />
    </>
  );
}
