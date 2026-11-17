import type { DisplayUnit } from './types';

export const UNIT_DIV: Record<DisplayUnit, number> = { Rp: 1, ribu: 1e3, juta: 1e6, miliar: 1e9 };
export const UNIT_LABEL: Record<DisplayUnit, string> = { Rp: 'Rp', ribu: 'Rp ribu', juta: 'Rp juta', miliar: 'Rp miliar' };

const nf = (d: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache: Record<number, Intl.NumberFormat> = {};
export const fmt = (n: number | null | undefined, d = 0): string => {
  if (n === null || n === undefined || !isFinite(n)) return '–';
  return (cache[d] ||= nf(d)).format(n);
};
export const fmtUnit = (n: number | null | undefined, unit: DisplayUnit, d?: number): string => {
  if (n === null || n === undefined || !isFinite(n)) return '–';
  const div = UNIT_DIV[unit];
  return fmt(n / div, d ?? (unit === 'miliar' ? 2 : unit === 'juta' ? 1 : 0));
};
export const fmtPct = (n: number | null | undefined, d = 1): string => (n === null || n === undefined || !isFinite(n) ? 'n/a' : `${fmt(n * 100, d)}%`);

export function parseNum(s: string): number | null {
  let t = s.trim().replace(/\s/g, '');
  if (t === '' || t === '-' || t === '.' || t === ',') return null;
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  else if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isFinite(n) ? n : null;
}
