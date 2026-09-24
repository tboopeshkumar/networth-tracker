import type { CellPath } from '../../lib/editors';
import { fmtDate, fmtDay, inr, num } from '../../lib/format';
import type { Model } from '../../lib/model';
import { feedRateFor } from '../../lib/ratesFeed';
import { Card, EditButton, Label, PANEL, cx, type OnEdit } from '../ui';

interface Tile { label: string; value: string; note: string; live?: boolean; path: CellPath; readOnly?: boolean }

/** Single cells the totals depend on, as tiles. */
export function RatesInputs({ model, canEdit, onEdit }: { model: Model; canEdit: boolean; onEdit: OnEdit }) {
  const C = model.cells;
  const S = model.summaries;
  const tiles: Tile[] = [];
  const fx = (formula: string | null | undefined, live: string) => {
    const daily = feedRateFor(model.ratesFeed, formula);
    return daily ? { note: `Daily · ${fmtDate(daily.rateDate)}`, live: true } : formula ? { note: live, live: true } : { note: 'Typed in' };
  };
  if (C.fxAedInr) tiles.push({ label: 'AED → INR', value: num(C.fxAedInr.value, 4), ...fx(C.fxAedInr.formula, 'Live rate'), path: 'cells.fxAedInr' });
  if (C.fxUsdAed) tiles.push({ label: 'USD → AED', value: num(C.fxUsdAed.value, 4), note: C.fxUsdAed.formula ? 'Formula' : 'Typed in', path: 'cells.fxUsdAed' });
  if (C.npsInvested) tiles.push({ label: 'NPS contributions', value: inr(C.npsInvested.value), note: `As of ${fmtDate(C.npsAsOf?.value)}`, path: 'cells.npsInvested' });
  // Priced from scheme NAVs, the gain is a formula: show where it comes from, and don't offer to overwrite it
  if (C.npsGain) {
    tiles.push(C.npsGain.formula
      ? { label: 'NPS gain', value: inr(C.npsGain.value), note: `From NAVs · ${fmtDay(C.npsAsOf?.value)}`, live: true, path: 'cells.npsGain', readOnly: true }
      : { label: 'NPS gain', value: inr(C.npsGain.value), note: 'Unrealised', path: 'cells.npsGain' });
  }
  if (S.goldUae) tiles.push({ label: 'Gold (UAE) value', value: `AED ${num(S.goldUae.currentAed.value)}`, note: `${num(S.goldUae.qty.value)} g held`, path: 'summaries.goldUae.currentAed' });
  if (S.silverUae?.sellPrice) tiles.push({ label: 'Silver sell price', value: `AED ${num(S.silverUae.sellPrice.value)}`, note: `per oz · ${num(S.silverUae.qty.value)} oz held`, path: 'summaries.silverUae.sellPrice' });

  if (!tiles.length) return null;
  return (
    <Card title="Rates & other inputs" sub="Single cells the totals depend on">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
        {tiles.map((t) => (
          <div className={cx(PANEL, 'flex min-w-0 flex-col px-3 py-2.5')} key={t.path}>
            <Label>{t.label}</Label>
            <div className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{t.value}</div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-1 text-xs text-ink-3">
              <span className={t.live ? 'text-good' : undefined}>{t.live && '● '}{t.note}</span>
              {canEdit && !t.readOnly && <span className="ml-auto -mr-1.5"><EditButton request={{ kind: 'cell', path: t.path }} onEdit={onEdit} /></span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
