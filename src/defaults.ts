import { MAX_YEARS } from './types';
import type { CapexItem, Component, Driver, OpexItem, Scenario, Simulation } from './types';
import { DEFAULT_RATE_CARD } from './rateCard';

let counter = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const fill = (v: number) => new Array<number>(MAX_YEARS).fill(v);

export function rateOf(code: string): number {
  return DEFAULT_RATE_CARD.find((r) => r.code === code)?.daily ?? 0;
}

export const OPEX_CATEGORIES = ['Manpower', 'Infrastruktur & Server', 'Jaringan', 'Sewa Bangunan', 'Listrik', 'Pemeliharaan', 'Overhead', 'Asuransi aset', 'Biaya Langsung', 'Lainnya'];
export const CAPEX_CATEGORIES = ['Pembangunan Platform', 'Infrastruktur', 'Perangkat', 'Lisensi', 'Lainnya'];

export function newDriver(p: Partial<Driver> = {}): Driver {
  return { id: uid('drv'), name: 'Driver transaksi baru', unit: 'trx', baseVolume: 0, growth: fill(0.1), ...p };
}

export function newComponent(driverId: string | null, p: Partial<Component> = {}): Component {
  return {
    id: uid('cmp'), name: 'Komponen revenue baru', unit: 'unit', driverId, conversion: 1,
    takeUp: fill(1), price: 0, priceEscalation: 0, ...p,
  };
}

export function newOpex(kind: OpexItem['kind'] = 'fixed', p: Partial<OpexItem> = {}): OpexItem {
  return {
    id: uid('opx'), category: kind === 'manpower' ? 'Manpower' : kind === 'pctRevenue' ? 'Overhead' : kind === 'perUnit' ? 'Biaya Langsung' : 'Infrastruktur & Server',
    name: 'Biaya baru', kind, qty: 1, unitCost: 0, daysPerMonth: 22, toolPerMonth: 0, marginPct: 0,
    period: 'month', pct: 0, componentId: null, escMode: 'inflation', esc: 0, startYear: 1, endYear: null, ...p,
  };
}

/** Overhead standar (% revenue) mengikuti template KKF: pemeliharaan, kepegawaian, adm umum, pemasaran. */
export const STANDARD_OVERHEAD: { name: string; category: string; pct: number }[] = [
  { name: 'Beban pemeliharaan', category: 'Pemeliharaan', pct: 0.0617 },
  { name: 'Beban kepegawaian (overhead)', category: 'Overhead', pct: 0.0954 },
  { name: 'Beban administrasi umum', category: 'Overhead', pct: 0.0667 },
  { name: 'Beban pemasaran', category: 'Overhead', pct: 0.0095 },
];
export function standardOverhead(existing: OpexItem[] = []): OpexItem[] {
  return STANDARD_OVERHEAD.filter((o) => !existing.some((e) => e.kind === 'pctRevenue' && e.name === o.name)).map((o) =>
    newOpex('pctRevenue', { name: o.name, category: o.category, pct: o.pct, note: 'Standar template KKF (% revenue)' }),
  );
}

export function newCapex(kind: CapexItem['kind'] = 'lump', p: Partial<CapexItem> = {}): CapexItem {
  return {
    id: uid('cpx'), category: kind === 'manday' ? 'Pembangunan Platform' : 'Infrastruktur', name: 'Capex baru',
    kind, qty: 1, mandays: 0, rate: 0, toolPerDay: 0, amount: 0, year: 0, lifeYears: null, ...p,
  };
}

export function newScenario(components: Component[], p: Partial<Scenario> = {}): Scenario {
  const prices: Record<string, number> = {};
  for (const c of components) prices[c.id] = c.price;
  return { id: uid('scn'), name: 'Skenario baru', volumeMultiplier: 1, prices, ...p };
}

export function blankSimulation(name = 'Simulasi baru'): Simulation {
  const now = new Date().toISOString();
  const drv = newDriver({ name: 'Jumlah transaksi', unit: 'trx', baseVolume: 100000, growth: fill(0.15) });
  const cmp = newComponent(drv.id, { name: 'Fee transaksi', unit: 'trx', takeUp: fill(0.5), price: 5000 });
  const sc = newScenario([cmp], { name: 'Basis' });
  return {
    id: uid('sim'), name, description: '', createdAt: now, updatedAt: now,
    general: {
      startYear: new Date().getFullYear() + 1, tenor: 5, cof: 0.0893, riskPremium: 0.02, wacc: 0.0893,
      inflation: 0.04, taxRate: 0.25, salvagePct: 0, insurancePct: 0.02, activeScenarioId: sc.id, displayUnit: 'juta',
    },
    funding: { debtPct: 0, interestRate: 0.09, repaymentYears: 5 },
    flex: { price: 1, volume: 1, opex: 1, capex: 1 },
    drivers: [drv], components: [cmp], scenarios: [sc], opex: standardOverhead(), capex: [], notes: [],
  };
}

/** Contoh terisi (terinspirasi dari KKF Green Mobility & Carbon Platform, disederhanakan). */
export function exampleSimulation(): Simulation {
  const s = blankSimulation('Contoh – Platform Kredit Karbon (disederhanakan)');
  s.description = 'Contoh pengisian: penjualan kredit karbon lewat dua kanal, tim operasi dari rate card KHS, capex bottom-up mandays. Angka ilustrasi, bukan data resmi.';
  s.general.startYear = 2027;
  s.general.insurancePct = 0.02;

  const energi = newDriver({
    name: 'Energi charging yang hak karbonnya diserahkan', unit: 'kWh', baseVolume: 400_000_000,
    growth: [0, 0.4, 0.35, 0.3, 0.25, 0.2, 0.2, 0.2, 0.2, 0.2],
    note: 'Dasar: rekap transaksi SPKLU (ilustrasi).',
  });
  s.drivers = [energi];

  const idx = newComponent(energi.id, {
    name: 'Kredit karbon – IDXCarbon', unit: 'tCO2e', conversion: 0.00059,
    takeUp: [0.25, 0.35, 0.45, 0.5, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55].map((x) => x * 0.5), price: 47000, priceEscalation: 0.03,
    note: 'Faktor konversi 0,59 kgCO2e/kWh; 50% volume ke kanal ini.',
  });
  const b2b = newComponent(energi.id, {
    name: 'Kredit karbon – B2B langsung', unit: 'tCO2e', conversion: 0.00059,
    takeUp: [0.25, 0.35, 0.45, 0.5, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55].map((x) => x * 0.5), price: 52000, priceEscalation: 0.03,
  });
  s.components = [idx, b2b];

  s.scenarios = [
    newScenario(s.components, { name: '1. Basis' }),
    newScenario(s.components, { name: '2. Konservatif', prices: { [idx.id]: 35000, [b2b.id]: 38000 } }),
    newScenario(s.components, { name: '3. Optimis', prices: { [idx.id]: 70000, [b2b.id]: 75000 } }),
  ];
  s.general.activeScenarioId = s.scenarios[0].id;

  const mp = (name: string, code: string, qty: number, p: Partial<OpexItem> = {}) =>
    newOpex('manpower', { name, roleCode: code, qty, unitCost: rateOf(code), toolPerMonth: 1_000_000, marginPct: 0.106, ...p });
  s.opex = [
    mp('Koordinator Teknis Junior', 'COT JR', 1),
    mp('Database Administration Junior', 'DBA JR', 1),
    mp('Bisnis Proses Senior (spesialis karbon)', 'BP SR', 1),
    mp('Bisnis Proses Madya (pengelola kanal)', 'BP MD', 1),
    mp('Quality Assurance Junior', 'QA JR', 1),
    newOpex('fixed', { category: 'Infrastruktur & Server', name: 'Sewa cloud – database', qty: 4, unitCost: 1_108_000, period: 'month' }),
    newOpex('fixed', { category: 'Infrastruktur & Server', name: 'Sewa cloud – aplikasi & core', qty: 20, unitCost: 750_000, period: 'month' }),
    newOpex('fixed', { category: 'Sewa Bangunan', name: 'Sewa ruang kerja tim', qty: 1, unitCost: 15_000_000, period: 'month' }),
    newOpex('fixed', { category: 'Listrik', name: 'Listrik & utilitas kantor', qty: 1, unitCost: 4_000_000, period: 'month' }),
    newOpex('fixed', { category: 'Jaringan', name: 'Jaringan & konektivitas', qty: 1, unitCost: 6_000_000, period: 'month' }),
    newOpex('fixed', { category: 'Lainnya', name: 'Legal, kepatuhan & audit karbon', qty: 1, unitCost: 300_000_000, period: 'year', escMode: 'none' }),
    ...standardOverhead(),
    newOpex('pctRevenue', { category: 'Overhead', name: 'Biaya registrasi, penerbitan & transaksi', pct: 0.03 }),
    newOpex('perUnit', { category: 'Biaya Langsung', name: 'Verifikasi pihak ketiga (idx)', componentId: idx.id, unitCost: 30000, escMode: 'none' }),
    newOpex('perUnit', { category: 'Biaya Langsung', name: 'Verifikasi pihak ketiga (b2b)', componentId: b2b.id, unitCost: 30000, escMode: 'none' }),
  ];

  const cx = (name: string, code: string, qty: number, days: number) =>
    newCapex('manday', { name, roleCode: code, qty, mandays: days, rate: rateOf(code), toolPerDay: 45454.55 });
  s.capex = [
    cx('Product Owner / Project Manager', 'PMO', 2, 90),
    cx('System Analyst', 'SA SR', 3, 80),
    cx('Solution Architect', 'SOL ARC', 2, 50),
    cx('Backend Developer', 'PRG SR1', 5, 100),
    cx('Mobile Developer', 'PRG MD', 5, 80),
    cx('Web Developer', 'PRG MD', 5, 80),
    cx('Quality Assurance', 'QA SR', 10, 70),
    cx('UI/UX', 'UX', 5, 50),
    newCapex('lump', { category: 'Perangkat', name: 'Perangkat & lisensi pendukung', amount: 250_000_000, year: 0 }),
  ];

  s.notes = [
    { id: uid('nt'), param: 'Harga karbon lokal basis', value: 'Rp47.000/tCO2e', status: 'KEPUTUSAN', source: 'Rata-rata kumulatif IDXCarbon (contoh).' },
    { id: uid('nt'), param: 'WACC / CoF', value: '8,93%', status: 'TEMPLATE', source: 'Sheet Asumsi template KKF.' },
    { id: uid('nt'), param: 'Faktor emisi dihindari', value: '0,59 kg/kWh', status: 'ANALIS', source: 'Ilustrasi; perlu validasi.' },
  ];
  return s;
}
