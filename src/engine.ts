import type { CapexItem, Component, OpexItem, Scenario, Simulation } from './types';

/** Semua array hasil berindeks tahun: 0..tenor (indeks 0 = tahun ke-0 / persiapan). */
export interface Result {
  N: number;
  years: number[]; // 0..N
  calendar: number[]; // tahun kalender
  driverVolume: Record<string, number[]>;
  comp: Record<string, { qty: number[]; price: number[]; revenue: number[] }>;
  revenue: number[];
  opexLines: { id: string; category: string; name: string; values: number[] }[];
  opexItems: number[]; // jumlah baris opex (tanpa asuransi)
  insurance: number[];
  opexTotal: number[]; // tunai = items + asuransi
  ebitda: number[];
  capexLines: { id: string; name: string; amount: number; spend: number[]; amort: number[] }[];
  capexSpend: number[];
  capexCum: number[];
  amort: number[];
  ebit: number[];
  interest: number[];
  ebt: number[];
  tax: number[];
  netIncome: number[];
  debtOpen: number[];
  debtDraw: number[];
  debtPrincipal: number[];
  debtClose: number[];
  salvage: number[];
  ncf: number[];
  cum: number[];
  metrics: Metrics;
}

export interface Metrics {
  discountRate: number;
  npv: number;
  irr: number | null;
  pv: number; // PV arus kas tahun 1..N
  investment: number; // -ncf[0] bila positif
  pi: number | null;
  roi: number | null;
  payback: number | null; // tahun ke-n
  bep: number | null; // tahun (interpolasi)
  totalNcf: number;
  totalRevenue: number;
  totalOpex: number;
  totalCapex: number;
  totalNetIncome: number;
  ok: boolean;
  result: 'OK' | 'ASK BOD';
}

const zeros = (n: number) => new Array<number>(n + 1).fill(0);

export function activeScenario(sim: Simulation): Scenario | undefined {
  return sim.scenarios.find((s) => s.id === sim.general.activeScenarioId) ?? sim.scenarios[0];
}

export function scenarioPrice(sc: Scenario | undefined, c: Component): number {
  const p = sc?.prices[c.id];
  return typeof p === 'number' ? p : c.price;
}

export function escRate(sim: Simulation, item: Pick<OpexItem, 'escMode' | 'esc'>): number {
  return item.escMode === 'inflation' ? sim.general.inflation : item.escMode === 'custom' ? item.esc : 0;
}

export function opexBaseAnnual(it: OpexItem): number {
  if (it.kind === 'manpower') {
    return (it.qty * it.unitCost * it.daysPerMonth + it.qty * it.toolPerMonth) * (1 + it.marginPct) * 12;
  }
  if (it.kind === 'fixed') return it.qty * it.unitCost * (it.period === 'month' ? 12 : 1);
  return 0;
}

export function capexAmount(it: CapexItem): number {
  return it.kind === 'manday' ? it.qty * it.mandays * (it.rate + it.toolPerDay) : it.amount;
}

export function capexLife(it: CapexItem, tenor: number): number {
  return Math.max(1, it.lifeYears ?? tenor);
}

/** Nilai awal-fraksi IRR dengan bisection pada rentang luas; null jika tidak ada pergantian tanda. */
export function irr(flows: number[]): number | null {
  const f = (r: number) => flows.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  // Pindai grid untuk mencari semua pergantian tanda (arus kas bisa berganti tanda lebih dari sekali,
  // misalnya tahun terakhir negatif). Dipilih akar yang paling dekat dengan tebakan 10% seperti Excel.
  const grid: number[] = [];
  for (let r = -0.99; r < 0; r += 0.01) grid.push(r);
  for (let r = 0; r < 10; r += 0.05) grid.push(r);
  for (let r = 10; r < 1e9; r *= 1.1) grid.push(r);
  const roots: number[] = [];
  let pr = grid[0];
  let pf = f(pr);
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const fr = f(r);
    if (isFinite(pf) && isFinite(fr)) {
      if (pf === 0) roots.push(pr);
      else if (pf * fr < 0) {
        let lo = pr, hi = r, flo = pf;
        for (let k = 0; k < 200; k++) {
          const mid = (lo + hi) / 2;
          const fm = f(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        roots.push((lo + hi) / 2);
      }
    }
    pr = r;
    pf = fr;
  }
  if (!roots.length) return null;
  const pool = roots.some((x) => x >= 0) ? roots.filter((x) => x >= 0) : roots; // utamakan IRR positif yang bermakna
  return pool.reduce((best, x) => (Math.abs(x - 0.1) < Math.abs(best - 0.1) ? x : best));
}

export function compute(sim: Simulation): Result {
  const g = sim.general;
  const N = Math.max(1, Math.min(10, Math.round(g.tenor)));
  const sc = activeScenario(sim);
  const flex = sim.flex;
  const years = Array.from({ length: N + 1 }, (_, i) => i);
  const calendar = years.map((y) => g.startYear + y - 1);

  // 1. Proyeksi transaksi
  const driverVolume: Record<string, number[]> = {};
  for (const d of sim.drivers) {
    const v = zeros(N);
    if (d.mode === 'manual') {
      for (let y = 1; y <= N; y++) v[y] = d.manual?.[y - 1] ?? 0;
    } else {
      v[1] = d.baseVolume;
      for (let y = 2; y <= N; y++) v[y] = v[y - 1] * (1 + (d.growth[y - 1] ?? 0));
    }
    driverVolume[d.id] = v;
  }

  // 2. Revenue
  const comp: Result['comp'] = {};
  const revenue = zeros(N);
  for (const c of sim.components) {
    const qty = zeros(N);
    const price = zeros(N);
    const rev = zeros(N);
    const dv = c.driverId ? driverVolume[c.driverId] : undefined;
    const base = scenarioPrice(sc, c);
    for (let y = 1; y <= N; y++) {
      qty[y] = (dv ? dv[y] : 0) * (c.takeUp[y - 1] ?? 0) * c.conversion * flex.volume * (sc?.volumeMultiplier ?? 1);
      price[y] = base * Math.pow(1 + c.priceEscalation, y - 1) * flex.price;
      rev[y] = qty[y] * price[y];
      revenue[y] += rev[y];
    }
    comp[c.id] = { qty, price, revenue: rev };
  }

  // 3. Capex & amortisasi
  const capexLines: Result['capexLines'] = [];
  const capexSpend = zeros(N);
  const amort = zeros(N);
  for (const it of sim.capex) {
    const amount = capexAmount(it) * flex.capex;
    const spend = zeros(N);
    const am = zeros(N);
    const yr = Math.round(it.year);
    if (yr >= 0 && yr <= N) {
      spend[yr] = amount;
      const life = capexLife(it, N);
      for (let y = yr + 1; y <= N && y <= yr + life; y++) am[y] = (amount * (1 - g.salvagePct)) / life;
    }
    for (let y = 0; y <= N; y++) {
      capexSpend[y] += spend[y];
      amort[y] += am[y];
    }
    capexLines.push({ id: it.id, name: it.name, amount: amount, spend, amort: am });
  }
  const capexCum = zeros(N);
  for (let y = 0; y <= N; y++) capexCum[y] = (y > 0 ? capexCum[y - 1] : 0) + capexSpend[y];

  // 4. Opex
  const opexLines: Result['opexLines'] = [];
  const opexItems = zeros(N);
  for (const it of sim.opex) {
    const vals = zeros(N);
    const e = escRate(sim, it);
    const base = opexBaseAnnual(it);
    for (let y = 1; y <= N; y++) {
      const active = y >= it.startYear && y <= (it.endYear ?? 99);
      if (!active) continue;
      const esc = Math.pow(1 + e, y - 1);
      let v = 0;
      if (it.kind === 'manpower' || it.kind === 'fixed') v = base * esc;
      else if (it.kind === 'pctRevenue') v = it.pct * revenue[y];
      else if (it.kind === 'perUnit') v = it.unitCost * (it.componentId && comp[it.componentId] ? comp[it.componentId].qty[y] : 0) * esc;
      vals[y] = v * flex.opex;
      opexItems[y] += vals[y];
    }
    opexLines.push({ id: it.id, category: it.category, name: it.name, values: vals });
  }
  const insurance = zeros(N);
  for (let y = 1; y <= N; y++) insurance[y] = g.insurancePct * capexCum[y - 1];
  const opexTotal = years.map((y) => opexItems[y] + insurance[y]);
  const ebitda = years.map((y) => revenue[y] - opexTotal[y]);

  // 5. Pendanaan
  const f = sim.funding;
  const debtDraw = zeros(N);
  debtDraw[0] = f.debtPct * capexSpend[0];
  const debtOpen = zeros(N);
  const debtClose = zeros(N);
  const debtPrincipal = zeros(N);
  const interest = zeros(N);
  debtClose[0] = debtDraw[0];
  const R = Math.max(1, Math.round(f.repaymentYears));
  for (let y = 1; y <= N; y++) {
    debtOpen[y] = debtClose[y - 1];
    interest[y] = f.interestRate * debtOpen[y];
    debtPrincipal[y] = y <= R ? Math.min(debtOpen[y], debtDraw[0] / R) : 0;
    debtClose[y] = debtOpen[y] - debtPrincipal[y];
  }

  // 6. Laba rugi & arus kas
  const ebit = years.map((y) => ebitda[y] - amort[y]);
  const ebt = years.map((y) => ebit[y] - interest[y]);
  const tax = years.map((y) => (ebt[y] > 0 ? g.taxRate * ebt[y] : 0));
  const netIncome = years.map((y) => ebt[y] - tax[y]);
  const totalCapex = capexSpend.reduce((a, b) => a + b, 0);
  const salvage = zeros(N);
  salvage[N] = g.salvagePct * totalCapex;
  const ncf = zeros(N);
  ncf[0] = -capexSpend[0] + debtDraw[0];
  for (let y = 1; y <= N; y++) {
    ncf[y] = netIncome[y] + amort[y] + debtDraw[y] - debtPrincipal[y] - capexSpend[y] + salvage[y];
  }
  const cum = zeros(N);
  for (let y = 0; y <= N; y++) cum[y] = (y > 0 ? cum[y - 1] : 0) + ncf[y];

  // 7. Indikator
  const d = g.cof + g.riskPremium;
  let pv = 0;
  for (let y = 1; y <= N; y++) pv += ncf[y] / Math.pow(1 + d, y);
  const npv = pv + ncf[0];
  const investment = ncf[0] < 0 ? -ncf[0] : 0;
  const irrVal = irr(ncf);
  const pi = investment > 0 ? pv / investment : null;
  const roi = investment > 0 ? npv / investment : null;
  let payback: number | null = null;
  for (let y = 1; y <= N; y++) {
    if (cum[y] >= 0) {
      payback = y;
      break;
    }
  }
  let bep: number | null = null;
  if (payback !== null) bep = payback - 1 + (ncf[payback] !== 0 ? -cum[payback - 1] / ncf[payback] : 0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const ok = npv > 0 && irrVal !== null && irrVal > g.wacc && pi !== null && pi > 1;

  return {
    N, years, calendar, driverVolume, comp, revenue, opexLines, opexItems, insurance, opexTotal, ebitda,
    capexLines, capexSpend, capexCum, amort, ebit, interest, ebt, tax, netIncome,
    debtOpen, debtDraw, debtPrincipal, debtClose, salvage, ncf, cum,
    metrics: {
      discountRate: d, npv, irr: irrVal, pv, investment, pi, roi, payback, bep,
      totalNcf: cum[N], totalRevenue: sum(revenue), totalOpex: sum(opexTotal), totalCapex,
      totalNetIncome: sum(netIncome), ok, result: ok ? 'OK' : 'ASK BOD',
    },
  };
}

// ---------- Sensitivitas ----------

export type FlexKey = 'price' | 'volume' | 'opex' | 'capex';
export const FLEX_LABEL: Record<FlexKey, string> = {
  price: 'Harga jual',
  volume: 'Volume penjualan',
  opex: 'Opex',
  capex: 'Capex',
};

export function withFlex(sim: Simulation, patch: Partial<Record<FlexKey, number>>): Simulation {
  const s = structuredClone(sim);
  for (const k of Object.keys(patch) as FlexKey[]) s.flex[k] = s.flex[k] * (patch[k] as number);
  return s;
}

export interface SensRow {
  key: FlexKey;
  label: string;
  deltas: { delta: number; npv: number; irr: number | null }[];
}

export const SENS_DELTAS = [-0.2, -0.1, 0, 0.1, 0.2];

export function sensitivity(sim: Simulation): SensRow[] {
  return (Object.keys(FLEX_LABEL) as FlexKey[]).map((key) => ({
    key,
    label: FLEX_LABEL[key],
    deltas: SENS_DELTAS.map((delta) => {
      const m = compute(withFlex(sim, { [key]: 1 + delta })).metrics;
      return { delta, npv: m.npv, irr: m.irr };
    }),
  }));
}

export interface ScenarioRow {
  id: string;
  name: string;
  npv: number;
  irr: number | null;
  pi: number | null;
  payback: number | null;
  result: string;
  revenue: number;
}

export function scenarioComparison(sim: Simulation): ScenarioRow[] {
  return sim.scenarios.map((sc) => {
    const s = structuredClone(sim);
    s.general.activeScenarioId = sc.id;
    const m = compute(s).metrics;
    return { id: sc.id, name: sc.name, npv: m.npv, irr: m.irr, pi: m.pi, payback: m.payback, result: m.result, revenue: m.totalRevenue };
  });
}

export const MATRIX_PRICE = [0.8, 0.9, 1, 1.1, 1.2];
export const MATRIX_VOLUME = [0.8, 0.9, 1, 1.1, 1.2];

export function priceVolumeMatrix(sim: Simulation): number[][] {
  return MATRIX_PRICE.map((p) => MATRIX_VOLUME.map((v) => compute(withFlex(sim, { price: p, volume: v })).metrics.npv));
}
