// Fund houses (AMCs, and NPS pension fund managers), recognised from a fund's
// name, each with initials and a colour close to its brand for a monogram
// badge. Generated in the app: no logos are fetched or stored.

export interface Amc { name: string; initials: string; color: string }

const AMCS: [RegExp, Amc][] = [
  [/aditya birla|\babsl\b|birla sun/i, { name: 'Aditya Birla Sun Life', initials: 'AB', color: '#9e1b32' }],
  [/\baxis\b/i, { name: 'Axis', initials: 'AX', color: '#97144d' }],
  [/bandhan|\bidfc\b/i, { name: 'Bandhan', initials: 'BA', color: '#c8102e' }],
  [/baroda|bnp/i, { name: 'Baroda BNP Paribas', initials: 'BB', color: '#f26522' }],
  [/canara/i, { name: 'Canara Robeco', initials: 'CR', color: '#0a5aa4' }],
  [/\bdsp\b/i, { name: 'DSP', initials: 'DS', color: '#1f2937' }],
  [/edelweiss/i, { name: 'Edelweiss', initials: 'ED', color: '#1b5fa8' }],
  [/franklin|templeton/i, { name: 'Franklin Templeton', initials: 'FT', color: '#0b2f5b' }],
  [/groww/i, { name: 'Groww', initials: 'GR', color: '#00a88f' }],
  [/\bhdfc\b/i, { name: 'HDFC', initials: 'HD', color: '#004c8f' }],
  [/\bhsbc\b/i, { name: 'HSBC', initials: 'HS', color: '#db0011' }],
  [/icici/i, { name: 'ICICI Prudential', initials: 'IP', color: '#ae282e' }],
  [/invesco/i, { name: 'Invesco', initials: 'IN', color: '#1a3c8f' }],
  [/\bjio\b|blackrock/i, { name: 'Jio BlackRock', initials: 'JB', color: '#0f3cc9' }],
  [/kotak/i, { name: 'Kotak', initials: 'KO', color: '#ed1c24' }],
  [/\blic\b/i, { name: 'LIC', initials: 'LI', color: '#0a3d91' }],
  [/mahindra/i, { name: 'Mahindra Manulife', initials: 'MM', color: '#c3002f' }],
  [/mirae/i, { name: 'Mirae Asset', initials: 'MA', color: '#f58220' }],
  [/motilal/i, { name: 'Motilal Oswal', initials: 'MO', color: '#e87722' }],
  [/\bnavi\b/i, { name: 'Navi', initials: 'NA', color: '#2c3e9a' }],
  [/nippon|reliance/i, { name: 'Nippon India', initials: 'NI', color: '#d7282f' }],
  [/parag parikh|ppfas/i, { name: 'PPFAS', initials: 'PP', color: '#0f4c81' }],
  [/\bquant\b/i, { name: 'Quant', initials: 'QU', color: '#6d28d9' }],
  [/\bsbi\b/i, { name: 'SBI', initials: 'SB', color: '#1b4f9c' }],
  [/sundaram/i, { name: 'Sundaram', initials: 'SU', color: '#0b6e4f' }],
  [/\btata\b/i, { name: 'Tata', initials: 'TA', color: '#486aae' }],
  [/\buti\b/i, { name: 'UTI', initials: 'UT', color: '#1a4fa0' }],
  [/white\s*oak/i, { name: 'WhiteOak Capital', initials: 'WO', color: '#1e6b3a' }],
  [/zerodha/i, { name: 'Zerodha', initials: 'ZE', color: '#387ed1' }],
];

/** The fund house behind a fund or scheme name; unknown names get their own initials in grey. */
export function amcOf(fundName: unknown): Amc {
  const name = String(fundName ?? '').trim();
  const hit = AMCS.find(([re]) => re.test(name));
  if (hit) return hit[1];
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return { name, initials, color: '#6b7280' };
}
