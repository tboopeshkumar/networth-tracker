import type { CellPath } from '../../lib/editors';
import { fmtDate, inr, num } from '../../lib/format';
import type { Model } from '../../lib/model';
import { feedRateFor } from '../../lib/ratesFeed';
import { Card, EditButton, type OnEdit } from '../ui';

interface Tile { label: string; value: string; note: string; path: CellPath }

/** Single cells the totals depend on, as tiles. */
export function RatesInputs({ model, canEdit, onEdit }: { model: Model; canEdit: boolean; onEdit: OnEdit }) {
  const C = model.cells;
  const S = model.summaries;
  const tiles: Tile[] = [];
  const fxNote = (formula: string | null | undefined, live: string) => {
    const daily = feedRateFor(model.ratesFeed, formula);
    return daily ? `Daily · ${fmtDate(daily.rateDate)}` : formula ? live : 'Typed in';
  };
  if (C.fxAedInr) tiles.push({ label: 'AED → INR', value: num(C.fxAedInr.value, 4), note: fxNote(C.fxAedInr.formula, 'Live rate'), path: 'cells.fxAedInr' });
  if (C.fxUsdAed) tiles.push({ label: 'USD → AED', value: num(C.fxUsdAed.value, 4), note: C.fxUsdAed.formula ? 'Formula' : 'Typed in', path: 'cells.fxUsdAed' });
  if (C.npsInvested) tiles.push({ label: 'NPS contributions', value: inr(C.npsInvested.value), note: `As of ${fmtDate(C.npsAsOf?.value)}`, path: 'cells.npsInvested' });
  if (C.npsGain) tiles.push({ label: 'NPS gain', value: inr(C.npsGain.value), note: 'Unrealised', path: 'cells.npsGain' });
  if (S.goldUae) tiles.push({ label: 'Gold (UAE) value', value: `AED ${num(S.goldUae.currentAed.value)}`, note: `${num(S.goldUae.qty.value)} g held`, path: 'summaries.goldUae.currentAed' });
  if (S.silverUae?.sellPrice) tiles.push({ label: 'Silver sell price', value: `AED ${num(S.silverUae.sellPrice.value)}`, note: `per oz · ${num(S.silverUae.qty.value)} oz held`, path: 'summaries.silverUae.sellPrice' });

  if (!tiles.length) return null;
  return (
    <Card title="Rates & other inputs" sub="Single cells the totals depend on">
      <div className="inputs">
        {tiles.map((t) => (
          <div className="input-tile" key={t.path}>
            <div className="input-label">{t.label}</div>
            <div className="input-val">{t.value}</div>
            <div className="input-foot">
              <span>{t.note}</span>
              {canEdit && <EditButton request={{ kind: 'cell', path: t.path }} onEdit={onEdit} />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
