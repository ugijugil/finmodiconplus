import type { RateCardRole, Simulation } from './types';
import { DEFAULT_RATE_CARD } from './rateCard';
import { sporaSimulation } from './defaults';

const KEY_SIMS = 'kajian-finansial.sims.v1';
const KEY_RATE = 'kajian-finansial.rates.v1';
let memSims: string | null = null;
let memRate: string | null = null;

function read(key: string, mem: string | null): string | null {
  try {
    return localStorage.getItem(key) ?? mem;
  } catch {
    return mem;
  }
}
function write(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* penyimpanan diblokir: data tetap di memori selama tab terbuka */
  }
}

export function loadSims(): Simulation[] {
  const raw = read(KEY_SIMS, memSims);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Simulation[];
      if (Array.isArray(arr) && arr.length) {
        // migrasi: contoh lama (Platform Kredit Karbon) yang tidak pernah diubah -> diganti SPORA
        const OLD = 'Contoh – Platform Kredit Karbon';
        const out = arr.filter((x) => !(typeof x.name === 'string' && x.name.startsWith(OLD) && x.createdAt === x.updatedAt));
        const changed = out.length !== arr.length;
        if (changed && out.length === 0) return [sporaSimulation()];
        if (changed) return out;
        return arr;
      }
    } catch {
      /* abaikan */
    }
  }
  return [sporaSimulation()];
}
export function saveSims(sims: Simulation[]) {
  memSims = JSON.stringify(sims);
  write(KEY_SIMS, memSims);
}
export function loadRateCard(): RateCardRole[] {
  const raw = read(KEY_RATE, memRate);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as RateCardRole[];
      if (Array.isArray(arr) && arr.length) return arr;
    } catch {
      /* abaikan */
    }
  }
  return structuredClone(DEFAULT_RATE_CARD);
}
export function saveRateCard(r: RateCardRole[]) {
  memRate = JSON.stringify(r);
  write(KEY_RATE, memRate);
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'simulasi';
