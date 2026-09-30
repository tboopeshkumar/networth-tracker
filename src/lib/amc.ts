// Fund houses (AMCs, and NPS pension fund managers), recognised from a fund's
// name. Each has initials and a brand-like colour for a monogram, and most a
// logo: public/amc/<logo>.png, downloaded once from the fund house's own site
// (or Google's copy of its site icon) and served from this app, so viewing
// never contacts a third party. Houses without a usable icon show the monogram.

export interface Amc { name: string; initials: string; color: string; logo?: string }

const AMCS: [RegExp, Amc][] = [
  [/aditya birla|\babsl\b|birla sun/i, { name: 'Aditya Birla Sun Life', initials: 'AB', color: '#9e1b32', logo: 'absl' }],
  [/\baxis\b/i, { name: 'Axis', initials: 'AX', color: '#97144d', logo: 'axis' }],
  [/bandhan|\bidfc\b/i, { name: 'Bandhan', initials: 'BA', color: '#c8102e', logo: 'bandhan' }],
  [/baroda|bnp/i, { name: 'Baroda BNP Paribas', initials: 'BB', color: '#f26522' }],
  [/canara/i, { name: 'Canara Robeco', initials: 'CR', color: '#0a5aa4', logo: 'canara' }],
  [/\bdsp\b/i, { name: 'DSP', initials: 'DS', color: '#1f2937', logo: 'dsp' }],
  [/edelweiss/i, { name: 'Edelweiss', initials: 'ED', color: '#1b5fa8', logo: 'edelweiss' }],
  [/franklin|templeton/i, { name: 'Franklin Templeton', initials: 'FT', color: '#0b2f5b' }],
  [/groww/i, { name: 'Groww', initials: 'GR', color: '#00a88f', logo: 'groww' }],
  [/\bhdfc\b/i, { name: 'HDFC', initials: 'HD', color: '#004c8f', logo: 'hdfc' }],
  [/\bhsbc\b/i, { name: 'HSBC', initials: 'HS', color: '#db0011', logo: 'hsbc' }],
  [/icici/i, { name: 'ICICI Prudential', initials: 'IP', color: '#ae282e', logo: 'icici' }],
  [/invesco/i, { name: 'Invesco', initials: 'IN', color: '#1a3c8f', logo: 'invesco' }],
  [/\bjio\b|blackrock/i, { name: 'Jio BlackRock', initials: 'JB', color: '#0f3cc9', logo: 'jio' }],
  [/kotak/i, { name: 'Kotak', initials: 'KO', color: '#ed1c24', logo: 'kotak' }],
  [/\blic\b/i, { name: 'LIC', initials: 'LI', color: '#0a3d91', logo: 'lic' }],
  [/mahindra/i, { name: 'Mahindra Manulife', initials: 'MM', color: '#c3002f' }],
  [/mirae/i, { name: 'Mirae Asset', initials: 'MA', color: '#f58220', logo: 'mirae' }],
  [/motilal/i, { name: 'Motilal Oswal', initials: 'MO', color: '#e87722' }],
  [/\bnavi\b/i, { name: 'Navi', initials: 'NA', color: '#2c3e9a' }],
  [/nippon|reliance/i, { name: 'Nippon India', initials: 'NI', color: '#d7282f', logo: 'nippon' }],
  [/parag parikh|ppfas/i, { name: 'PPFAS', initials: 'PP', color: '#0f4c81', logo: 'ppfas' }],
  [/\bquant\b/i, { name: 'Quant', initials: 'QU', color: '#6d28d9' }],
  [/\bsbi\b/i, { name: 'SBI', initials: 'SB', color: '#1b4f9c' }],
  [/sundaram/i, { name: 'Sundaram', initials: 'SU', color: '#0b6e4f' }],
  [/\btata\b/i, { name: 'Tata', initials: 'TA', color: '#486aae' }],
  [/\buti\b/i, { name: 'UTI', initials: 'UT', color: '#1a4fa0' }],
  [/white\s*oak/i, { name: 'WhiteOak Capital', initials: 'WO', color: '#1e6b3a', logo: 'whiteoak' }],
  [/zerodha/i, { name: 'Zerodha', initials: 'ZE', color: '#387ed1', logo: 'zerodha' }],
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
