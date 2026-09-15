// Hand-rolled SVG charts. All text goes in via textContent.

import { cr, fmtMonth, isNum } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function tipLines(tip, lines) {
  tip.replaceChildren(...lines.map(([cls, text]) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }));
}

function placeTip(tip, host, x, y) {
  tip.style.opacity = 1;
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.max(0, Math.min(host.clientWidth - tw, x - tw / 2))}px`;
  tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
}

// Redraws on resize so text stays at real pixel size on phones.
function responsive(host, draw) {
  let w = 0;
  const go = () => {
    if (host.clientWidth === w) return;
    w = host.clientWidth;
    host.querySelector('svg')?.remove();
    draw(w || 700);
  };
  go();
  new ResizeObserver(go).observe(host);
}

export function trendChart(host, series) {
  const tip = host.querySelector('.tip');
  const pts = series.filter((d) => isNum(d.month) && isNum(d.networth));
  if (pts.length < 2) return;

  responsive(host, (W) => {
    const H = 280;
    const P = { t: 12, r: 12, b: 26, l: 50 };
    const iw = W - P.l - P.r;
    const ih = H - P.t - P.b;
    const max = Math.max(...pts.map((d) => d.networth)) * 1.06;
    const X = (i) => P.l + (i / (pts.length - 1)) * iw;
    const Y = (v) => P.t + ih - (v / max) * ih;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': 'Net worth over time' });

    const step = max > 8e7 ? 4e7 : 2e7;
    for (let v = 0; v <= max; v += step) {
      root.append(svg('line', { x1: P.l, x2: P.l + iw, y1: Y(v), y2: Y(v), class: 'grid' }));
      root.append(svg('text', { x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, `${v / 1e7} Cr`));
    }
    const every = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 80)));
    pts.forEach((d, i) => {
      if (i % every && i !== pts.length - 1) return;
      root.append(svg('text', { x: X(i), y: H - 7, 'text-anchor': 'middle', class: 'tick' }, fmtMonth(d.month)));
    });

    const line = pts.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${Y(d.networth)}`).join('');
    root.append(svg('path', { d: `${line}L${X(pts.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z`, class: 'area' }));
    root.append(svg('path', { d: line, class: 'line' }));
    pts.forEach((d, i) => { if (d.note) root.append(svg('circle', { cx: X(i), cy: Y(d.networth), r: 4, class: 'ring' })); });

    const cross = svg('line', { y1: P.t, y2: P.t + ih, class: 'cross', opacity: 0 });
    const dot = svg('circle', { r: 5, class: 'dot', opacity: 0 });
    root.append(cross, dot);

    const hit = svg('rect', { x: P.l, y: P.t, width: iw, height: ih, fill: 'transparent' });
    const move = (clientX) => {
      const r = root.getBoundingClientRect();
      const i = Math.max(0, Math.min(pts.length - 1, Math.round((((clientX - r.left) * W / r.width) - P.l) / iw * (pts.length - 1))));
      const d = pts[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(d.networth)); dot.setAttribute('opacity', 1);
      const lines = [['tl', fmtMonth(d.month)], ['tv', cr(d.networth)]];
      if (isNum(d.savings)) lines.push(['ts', `${d.savings >= 0 ? '+' : ''}${cr(d.savings)} vs previous`]);
      if (d.note) lines.push(['tn', d.note]);
      tipLines(tip, lines);
      placeTip(tip, host, X(i) * r.width / W, Y(d.networth) * r.height / H);
    };
    hit.addEventListener('pointermove', (e) => move(e.clientX));
    hit.addEventListener('pointerdown', (e) => move(e.clientX));
    hit.addEventListener('pointerleave', () => { tip.style.opacity = 0; cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); });
    root.append(hit);
    host.prepend(root);
  });
}

export function changeChart(host, series) {
  const tip = host.querySelector('.tip');
  const pts = series.filter((d) => isNum(d.savings));
  if (!pts.length) return;

  responsive(host, (W) => {
    const H = 190;
    const P = { t: 10, r: 12, b: 24, l: 50 };
    const iw = W - P.l - P.r;
    const ih = H - P.t - P.b;
    const max = Math.max(0, ...pts.map((d) => d.savings));
    const min = Math.min(0, ...pts.map((d) => d.savings));
    const Y = (v) => P.t + ih - ((v - min) / (max - min || 1)) * ih;
    const slot = iw / pts.length;
    const bw = Math.max(2, slot - 3);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': 'Month-on-month change' });

    for (const v of [min, 0, max]) {
      if (v !== 0 && Math.abs(Y(v) - Y(0)) < 14) continue; // would collide with the zero label
      root.append(svg('line', { x1: P.l, x2: P.l + iw, y1: Y(v), y2: Y(v), class: v === 0 ? 'base' : 'grid' }));
      root.append(svg('text', { x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, v === 0 ? '0' : `${Math.round(v / 1e5)} L`));
    }
    pts.forEach((d, i) => {
      const x = P.l + i * slot;
      const up = d.savings >= 0;
      const bar = svg('rect', {
        x, y: up ? Y(d.savings) : Y(0), width: bw, height: Math.max(1.5, Math.abs(Y(d.savings) - Y(0))), rx: 2,
        class: up ? 'bar-up' : 'bar-down',
      });
      const show = () => {
        const r = root.getBoundingClientRect();
        const lines = [['tl', fmtMonth(d.month)], [up ? 'tv up' : 'tv down', `${up ? '+' : ''}${cr(d.savings)}`]];
        if (d.note) lines.push(['tn', d.note]);
        tipLines(tip, lines);
        placeTip(tip, host, (x + bw / 2) * r.width / W, Math.min(Y(d.savings), Y(0)) * r.height / H);
      };
      bar.addEventListener('pointerenter', show);
      bar.addEventListener('pointerdown', show);
      bar.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
      root.append(bar);
      const every = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 80)));
      if (!(i % every) || i === pts.length - 1) {
        root.append(svg('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'tick' }, fmtMonth(d.month)));
      }
    });
    host.prepend(root);
  });
}
