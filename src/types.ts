export const MAX_YEARS = 10;

export type EscMode = 'inflation' | 'custom' | 'none';
export type OpexKind = 'manpower' | 'fixed' | 'pctRevenue' | 'perUnit';
export type CapexKind = 'manday' | 'lump';
export type DisplayUnit = 'Rp' | 'ribu' | 'juta' | 'miliar';

export interface General {
  startYear: number; // kalender untuk tahun ke-1
  tenor: number; // 1..MAX_YEARS
  cof: number; // cost of fund (fraksi)
  riskPremium: number;
  wacc: number; // batas IRR untuk keputusan layak
  inflation: number;
  taxRate: number;
  salvagePct: number; // % dari total capex, diterima di akhir tenor
  insurancePct: number; // % per tahun dari capex terpasang
  activeScenarioId: string;
  displayUnit: DisplayUnit;
}

export interface Funding {
  debtPct: number; // porsi utang dari capex tahun ke-0
  interestRate: number;
  repaymentYears: number; // angsuran pokok sama rata mulai tahun ke-1
}

/** Pengali what-if (1 = tidak berubah). */
export interface Flex {
  price: number;
  volume: number;
  opex: number;
  capex: number;
}

/** Proyeksi volume transaksi dasar. growth[i] = pertumbuhan tahun ke-(i+1); growth[0] tidak dipakai. */
export interface Driver {
  id: string;
  name: string;
  unit: string;
  baseVolume: number; // volume tahun ke-1
  growth: number[]; // panjang MAX_YEARS
  /** 'growth' (default): volume tahun ke-1 + pertumbuhan %. 'manual': volume tiap tahun diinput langsung. */
  mode?: 'growth' | 'manual';
  manual?: number[]; // volume tahun ke-(i+1), panjang MAX_YEARS; dipakai bila mode = 'manual'
  note?: string;
}

export interface Component {
  id: string;
  name: string;
  unit: string; // satuan jual (mis. tCO2e, trx, lisensi)
  driverId: string | null;
  conversion: number; // faktor konversi driver -> satuan jual
  takeUp: number[]; // take-up rate per tahun (fraksi), panjang MAX_YEARS
  price: number; // harga dasar (Rp/satuan) tahun ke-1
  priceEscalation: number; // kenaikan harga per tahun
  note?: string;
}

export interface Scenario {
  id: string;
  name: string;
  volumeMultiplier: number;
  prices: Record<string, number>; // componentId -> harga
  note?: string;
}

export interface OpexItem {
  id: string;
  category: string;
  name: string;
  kind: OpexKind;
  roleCode?: string;
  qty: number;
  unitCost: number; // manpower: rate/hari; fixed: harga per periode; perUnit: Rp per satuan
  daysPerMonth: number;
  toolPerMonth: number;
  marginPct: number;
  period: 'month' | 'year';
  pct: number;
  componentId: string | null;
  escMode: EscMode;
  esc: number;
  startYear: number;
  endYear: number | null;
  note?: string;
}

export interface CapexItem {
  id: string;
  category: string;
  name: string;
  kind: CapexKind;
  roleCode?: string;
  qty: number;
  mandays: number;
  rate: number;
  toolPerDay: number;
  amount: number; // untuk lump
  year: number; // tahun pengeluaran (0..tenor)
  lifeYears: number | null; // null = sama dengan tenor
  note?: string;
}

export interface Note {
  id: string;
  param: string;
  value: string;
  status: 'DATA' | 'ANALIS' | 'KEPUTUSAN' | 'TEMPLATE';
  source: string;
}

export interface Simulation {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  general: General;
  funding: Funding;
  flex: Flex;
  drivers: Driver[];
  components: Component[];
  scenarios: Scenario[];
  opex: OpexItem[];
  capex: CapexItem[];
  notes: Note[];
}

export interface RateCardRole {
  code: string;
  name: string;
  daily: number; // harga satuan harian
  monthly: number;
}
