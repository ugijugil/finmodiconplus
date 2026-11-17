import ExcelJS from 'exceljs';
import type { Simulation, RateCardRole } from './types';
import { evaluateWorkbook } from './evalFormulas';
import { addCharts } from './xlsxCharts';
import { compute, sensitivity, scenarioComparison, priceVolumeMatrix, MATRIX_PRICE, MATRIX_VOLUME, SENS_DELTAS } from './engine';

// ---------- util ----------
const colL = (n: number): string => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
/** Kolom tahun: tahun ke-0 = E (5), tahun ke-1 = F, dst. Sama di semua sheet deret waktu. */
const YC = (y: number) => 5 + y;
const yl = (y: number) => colL(YC(y));

const FILL_INPUT = 'FFFFF2CC';
const FILL_HEAD = 'FF1F3A5F';
const FILL_SUB = 'FFDCE6F1';
const FILL_TOTAL = 'FFEAF1E4';
const FMT_NUM = '#,##0;[Red](#,##0);"-"';
const FMT_DEC = '#,##0.0000';
const FMT_PCT = '0.0%';

const KIND_OPEX: Record<string, string> = { manpower: 'Manpower', fixed: 'Biaya tetap', pctRevenue: '% Revenue', perUnit: 'Per satuan' };
const KIND_CAPEX: Record<string, string> = { manday: 'Mandays', lump: 'Lumpsum' };

type WS = ExcelJS.Worksheet;

function setCell(ws: WS, r: number, c: number, value: ExcelJS.CellValue, opts: { fmt?: string; bold?: boolean; fill?: string; input?: boolean; color?: string; wrap?: boolean; align?: 'left' | 'center' | 'right' } = {}) {
  const cell = ws.getCell(r, c);
  cell.value = value;
  if (opts.fmt) cell.numFmt = opts.fmt;
  if (opts.bold || opts.color) cell.font = { bold: !!opts.bold, color: opts.color ? { argb: opts.color } : undefined };
  const fill = opts.input ? FILL_INPUT : opts.fill;
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (opts.wrap || opts.align) cell.alignment = { wrapText: opts.wrap, vertical: 'top', horizontal: opts.align };
  return cell;
}
const F = (formula: string): ExcelJS.CellFormulaValue => ({ formula } as ExcelJS.CellFormulaValue);

function title(ws: WS, text: string, sub?: string) {
  setCell(ws, 2, 2, text, { bold: true });
  ws.getCell(2, 2).font = { bold: true, size: 14, color: { argb: 'FF1F3A5F' } };
  if (sub) setCell(ws, 3, 2, sub, { color: 'FF666666' });
}
function headRow(ws: WS, r: number, c1: number, c2: number) {
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEAD } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
}
function bandRow(ws: WS, r: number, c1: number, c2: number, fill: string, bold = true) {
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.font = { bold };
  }
}

/** Baris judul tahun (indeks tahun di baris `r`, kalender di `r+1`). */
function yearHeader(ws: WS, r: number, N: number, _startYear: number, from: 0 | 1, label = 'Tahun ke-') {
  setCell(ws, r, 2, label);
  setCell(ws, r + 1, 2, 'Tahun kalender');
  for (let y = from; y <= N; y++) {
    setCell(ws, r, YC(y), y, { align: 'center' });
    setCell(ws, r + 1, YC(y), F(`Asumsi!$D$5+${yl(y)}${r}-1`), { align: 'center' });
  }
  headRow(ws, r, 2, YC(N));
  headRow(ws, r + 1, 2, YC(N));
}

export async function buildWorkbook(sim: Simulation, rateCard: RateCardRole[]): Promise<ExcelJS.Workbook> {
  const res = compute(sim);
  const N = res.N;
  const g = sim.general;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aplikasi Kajian Finansial';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true } as ExcelJS.CalculationProperties;

  const wsSum = wb.addWorksheet('Ex Summary');
  const wsFin = wb.addWorksheet('FIN Model');
  const wsRev = wb.addWorksheet('REVENUE');
  const wsTrx = wb.addWorksheet('Trx Projections');
  const wsOpx = wb.addWorksheet('OPEX');
  const wsCpx = wb.addWorksheet('CAPEX');
  const wsSen = wb.addWorksheet('Sensitivitas');
  const wsAsm = wb.addWorksheet('Asumsi');
  const wsRO = wb.addWorksheet('Ref. OPEX');
  const wsRC = wb.addWorksheet('Ref. CAPEX');
  const wsRate = wb.addWorksheet('Ref. Rate Card');
  const wsNote = wb.addWorksheet('Catatan');
  for (const ws of [wsSum, wsFin, wsRev, wsTrx, wsOpx, wsCpx, wsSen, wsAsm, wsRO, wsRC, wsRate, wsNote]) {
    ws.views = [{ showGridLines: false }];
    ws.getColumn(1).width = 2;
  }

  // =========================================================
  // ASUMSI
  // =========================================================
  title(wsAsm, 'ASUMSI UMUM', 'Sel kuning = input. Mengubah nilai di sini memengaruhi seluruh model (rumus hidup).');
  wsAsm.getColumn(2).width = 44;
  wsAsm.getColumn(3).width = 22;
  for (let c = 4; c <= 12; c++) wsAsm.getColumn(c).width = 20;
  const asm = (r: number, label: string, value: ExcelJS.CellValue, unit: string, fmt?: string, input = true) => {
    setCell(wsAsm, r, 2, label);
    setCell(wsAsm, r, 4, value, { fmt, input });
    setCell(wsAsm, r, 5, unit, { color: 'FF666666' });
  };
  asm(4, 'Nama simulasi', sim.name, '');
  asm(5, 'Tahun kalender tahun ke-1', g.startYear, 'tahun');
  asm(6, 'Tenor financial model', N, 'tahun (struktur sheet dibuat sesuai tenor ini)');
  asm(7, 'Cost of Fund (CoF)', g.cof, '% per tahun', FMT_PCT);
  asm(8, 'Risk premium', g.riskPremium, '%', FMT_PCT);
  asm(9, 'Discount rate (CoF + risk premium)', F('D7+D8'), '%', FMT_PCT, false);
  asm(10, 'WACC (batas kelayakan IRR)', g.wacc, '%', FMT_PCT);
  asm(11, 'Inflasi', g.inflation, '% per tahun', FMT_PCT);
  asm(12, 'Pajak badan', g.taxRate, '%', FMT_PCT);
  asm(13, 'Nilai sisa (salvage) dari total capex', g.salvagePct, '% (diterima di tahun terakhir)', FMT_PCT);
  asm(14, 'Asuransi aset', g.insurancePct, '% per tahun dari capex terpasang', FMT_PCT);
  setCell(wsAsm, 16, 2, 'Pendanaan', { bold: true });
  asm(17, 'Porsi utang dari capex tahun ke-0', sim.funding.debtPct, '%', FMT_PCT);
  asm(18, 'Bunga pinjaman', sim.funding.interestRate, '% per tahun', FMT_PCT);
  asm(19, 'Tenor angsuran pokok (sama rata)', sim.funding.repaymentYears, 'tahun');
  setCell(wsAsm, 21, 2, 'Pengali what-if (1 = tidak berubah)', { bold: true });
  asm(22, 'Pengali harga jual', sim.flex.price, 'x', '0.00');
  asm(23, 'Pengali volume penjualan', sim.flex.volume, 'x', '0.00');
  asm(24, 'Pengali opex', sim.flex.opex, 'x', '0.00');
  asm(25, 'Pengali capex', sim.flex.capex, 'x', '0.00');

  // skenario
  const scIdx = Math.max(0, sim.scenarios.findIndex((s) => s.id === g.activeScenarioId));
  setCell(wsAsm, 27, 2, 'Skenario harga & volume', { bold: true });
  asm(28, 'Skenario aktif (nomor baris)', scIdx + 1, '→ ubah angka ini untuk memilih skenario');
  setCell(wsAsm, 29, 2, F(`INDEX(B32:B${31 + sim.scenarios.length},D28)`), { bold: true });
  setCell(wsAsm, 29, 4, 'nama skenario aktif', { color: 'FF666666' });
  const sHead = 31;
  setCell(wsAsm, sHead, 2, 'Skenario');
  setCell(wsAsm, sHead, 3, 'Pengali volume');
  sim.components.forEach((c, j) => setCell(wsAsm, sHead, 4 + j, `Harga: ${c.name} (Rp/${c.unit})`));
  headRow(wsAsm, sHead, 2, 3 + sim.components.length);
  wsAsm.getRow(sHead).height = 42;
  sim.scenarios.forEach((s, i) => {
    const r = sHead + 1 + i;
    setCell(wsAsm, r, 2, s.name, { input: true });
    setCell(wsAsm, r, 3, s.volumeMultiplier, { input: true, fmt: '0.00' });
    sim.components.forEach((c, j) => setCell(wsAsm, r, 4 + j, s.prices[c.id] ?? c.price, { input: true, fmt: FMT_NUM }));
  });
  const sFirst = sHead + 1;
  const sLast = sHead + sim.scenarios.length;
  const sAct = sLast + 1;
  setCell(wsAsm, sAct, 2, 'Parameter skenario aktif', { bold: true });
  setCell(wsAsm, sAct, 3, F(`INDEX(C${sFirst}:C${sLast},$D$28)`), { fmt: '0.00', fill: FILL_TOTAL, bold: true });
  sim.components.forEach((_, j) => {
    const L = colL(4 + j);
    setCell(wsAsm, sAct, 4 + j, F(`INDEX(${L}${sFirst}:${L}${sLast},$D$28)`), { fmt: FMT_NUM, fill: FILL_TOTAL, bold: true });
  });
  const A = {
    start: 'Asumsi!$D$5', tenor: 'Asumsi!$D$6', disc: 'Asumsi!$D$9', wacc: 'Asumsi!$D$10', infl: 'Asumsi!$D$11', tax: 'Asumsi!$D$12',
    salv: 'Asumsi!$D$13', ins: 'Asumsi!$D$14', debt: 'Asumsi!$D$17', rate: 'Asumsi!$D$18', repay: 'Asumsi!$D$19',
    mPrice: 'Asumsi!$D$22', mVol: 'Asumsi!$D$23', mOpex: 'Asumsi!$D$24', mCapex: 'Asumsi!$D$25',
    scVol: `Asumsi!$C$${sAct}`, scPrice: (j: number) => `Asumsi!$${colL(4 + j)}$${sAct}`,
  };

  // =========================================================
  // REF. RATE CARD
  // =========================================================
  title(wsRate, 'REFERENSI RATE CARD (HARGA SATUAN TENAGA KERJA)', 'Dipakai sebagai referensi tarif per mandays pada Ref. OPEX dan Ref. CAPEX.');
  wsRate.getColumn(2).width = 14;
  wsRate.getColumn(3).width = 40;
  wsRate.getColumn(4).width = 20;
  wsRate.getColumn(5).width = 20;
  setCell(wsRate, 4, 2, 'Kode');
  setCell(wsRate, 4, 3, 'Spesifikasi');
  setCell(wsRate, 4, 4, 'Harga satuan harian (Rp/mandays)');
  setCell(wsRate, 4, 5, 'Harga satuan bulanan (Rp/man-month)');
  headRow(wsRate, 4, 2, 5);
  rateCard.forEach((r, i) => {
    setCell(wsRate, 5 + i, 2, r.code);
    setCell(wsRate, 5 + i, 3, r.name);
    setCell(wsRate, 5 + i, 4, r.daily, { fmt: FMT_NUM, input: true });
    setCell(wsRate, 5 + i, 5, r.monthly, { fmt: FMT_NUM, input: true });
  });
  const rateRange = `'Ref. Rate Card'!$B$5:$D$${4 + Math.max(1, rateCard.length)}`;
  const rateFormula = (codeCell: string) => `VLOOKUP(${codeCell},${rateRange},3,0)`;
  const cardRate = (code?: string) => (code ? rateCard.find((r) => r.code === code)?.daily : undefined);

  // =========================================================
  // TRX PROJECTIONS
  // =========================================================
  title(wsTrx, 'PROYEKSI TRANSAKSI', 'Mode pertumbuhan: volume tahun ke-1 = input, tahun berikutnya = volume sebelumnya × (1 + pertumbuhan). Mode manual: volume tiap tahun diinput langsung. Sel kuning = input.');
  wsTrx.getColumn(2).width = 46;
  wsTrx.getColumn(3).width = 14;
  wsTrx.getColumn(4).width = 20;
  for (let y = 0; y <= N; y++) wsTrx.getColumn(YC(y)).width = 17;
  yearHeader(wsTrx, 4, N, g.startYear, 1);
  const drvVolRow: Record<string, number> = {};
  let r = 7;
  for (const d of sim.drivers) {
    setCell(wsTrx, r, 2, d.name, { bold: true });
    setCell(wsTrx, r, 3, d.unit);
    const manual = d.mode === 'manual';
    if (manual) setCell(wsTrx, r, 5, '← volume diinput manual per tahun (sel kuning pada baris Volume)', { color: 'FF666666' });
    else {
      setCell(wsTrx, r, 4, d.baseVolume, { fmt: FMT_NUM, input: true });
      setCell(wsTrx, r, 5, '← volume tahun ke-1', { color: 'FF666666' });
    }
    bandRow(wsTrx, r, 2, 4, FILL_SUB);
    setCell(wsTrx, r + 1, 2, manual ? '   Pertumbuhan terhadap tahun sebelumnya (hasil)' : '   Pertumbuhan per tahun');
    setCell(wsTrx, r + 1, 3, '%');
    setCell(wsTrx, r + 2, 2, '   Volume');
    setCell(wsTrx, r + 2, 3, d.unit);
    for (let y = 1; y <= N; y++) {
      if (manual) {
        setCell(wsTrx, r + 2, YC(y), d.manual?.[y - 1] ?? 0, { fmt: FMT_NUM, input: true });
        if (y >= 2) setCell(wsTrx, r + 1, YC(y), F(`IF(${yl(y - 1)}${r + 2}=0,0,${yl(y)}${r + 2}/${yl(y - 1)}${r + 2}-1)`), { fmt: FMT_PCT });
      } else if (y === 1) setCell(wsTrx, r + 2, YC(y), F(`$D$${r}`), { fmt: FMT_NUM });
      else {
        setCell(wsTrx, r + 1, YC(y), d.growth[y - 1] ?? 0, { fmt: FMT_PCT, input: true });
        setCell(wsTrx, r + 2, YC(y), F(`${yl(y - 1)}${r + 2}*(1+${yl(y)}${r + 1})`), { fmt: FMT_NUM });
      }
    }
    drvVolRow[d.id] = r + 2;
    r += 4;
  }

  // =========================================================
  // REVENUE
  // =========================================================
  title(wsRev, 'REVENUE', 'Volume = volume driver × take-up rate × faktor konversi × pengali volume. Harga = harga skenario aktif × (1+eskalasi)^(tahun-1) × pengali harga.');
  wsRev.getColumn(2).width = 46;
  wsRev.getColumn(3).width = 18;
  wsRev.getColumn(4).width = 18;
  for (let y = 0; y <= N; y++) wsRev.getColumn(YC(y)).width = 17;
  yearHeader(wsRev, 4, N, g.startYear, 1);
  const revRow: Record<string, number> = {};
  const qtyRow: Record<string, number> = {};
  r = 7;
  sim.components.forEach((c, j) => {
    const dRow = c.driverId ? drvVolRow[c.driverId] : undefined;
    setCell(wsRev, r, 2, c.name, { bold: true });
    setCell(wsRev, r, 3, c.unit);
    bandRow(wsRev, r, 2, YC(N), FILL_SUB);
    setCell(wsRev, r + 1, 2, '   Take-up rate');
    setCell(wsRev, r + 1, 3, '%');
    setCell(wsRev, r + 2, 2, '   Volume terjual');
    setCell(wsRev, r + 2, 3, 'faktor konversi →', { color: 'FF666666' });
    setCell(wsRev, r + 2, 4, c.conversion, { input: true, fmt: FMT_DEC });
    setCell(wsRev, r + 3, 2, '   Harga satuan (Rp)');
    setCell(wsRev, r + 3, 3, 'eskalasi/tahun →', { color: 'FF666666' });
    setCell(wsRev, r + 3, 4, c.priceEscalation, { input: true, fmt: FMT_PCT });
    setCell(wsRev, r + 4, 2, '   Revenue (Rp)', { bold: true });
    for (let y = 1; y <= N; y++) {
      const L = yl(y);
      setCell(wsRev, r + 1, YC(y), c.takeUp[y - 1] ?? 0, { fmt: FMT_PCT, input: true });
      const drvRef = dRow ? `'Trx Projections'!${L}${dRow}` : '0';
      setCell(wsRev, r + 2, YC(y), F(`${drvRef}*${L}${r + 1}*$D$${r + 2}*${A.mVol}*${A.scVol}`), { fmt: FMT_NUM });
      setCell(wsRev, r + 3, YC(y), F(`${A.scPrice(j)}*(1+$D$${r + 3})^(${L}$4-1)*${A.mPrice}`), { fmt: FMT_NUM });
      setCell(wsRev, r + 4, YC(y), F(`${L}${r + 2}*${L}${r + 3}`), { fmt: FMT_NUM, bold: true });
    }
    qtyRow[c.id] = r + 2;
    revRow[c.id] = r + 4;
    r += 6;
  });
  const revTotal = r;
  setCell(wsRev, revTotal, 2, 'TOTAL REVENUE', { bold: true });
  for (let y = 1; y <= N; y++) {
    const L = yl(y);
    const parts = sim.components.map((c) => `${L}${revRow[c.id]}`);
    setCell(wsRev, revTotal, YC(y), F(parts.length ? parts.join('+') : '0'), { fmt: FMT_NUM, bold: true });
  }
  bandRow(wsRev, revTotal, 2, YC(N), FILL_TOTAL);
  for (let y = 1; y <= N; y++) wsRev.getCell(revTotal, YC(y)).numFmt = FMT_NUM;

  // =========================================================
  // REF. OPEX
  // =========================================================
  title(wsRO, 'REFERENSI OPEX', 'Definisi tiap item biaya operasional. Manpower: ((qty × rate × hari/bln) + (qty × alat kerja)) × (1+margin) × 12. Sel kuning = input.');
  const roHead = ['No', 'Kategori', 'Item', 'Jenis', 'Kode peran', 'Qty', 'Rate/hari atau harga satuan (Rp)', 'Hari/bulan', 'Alat kerja/bulan (Rp)', 'Margin', 'Periode', '% Revenue', 'Komponen terkait', 'Eskalasi/tahun', 'Mulai (thn ke-)', 'Selesai (thn ke-)', 'Biaya dasar/tahun (Rp)'];
  roHead.forEach((h, i) => setCell(wsRO, 4, 1 + i, h));
  headRow(wsRO, 4, 1, 17);
  wsRO.getRow(4).height = 44;
  [5, 22, 40, 14, 12, 8, 22, 11, 18, 10, 10, 11, 32, 12, 11, 11, 22].forEach((w, i) => (wsRO.getColumn(1 + i).width = w));
  const RO0 = 5;
  sim.opex.forEach((it, i) => {
    const rr = RO0 + i;
    const rc = cardRate(it.roleCode);
    const rateCell = it.kind === 'manpower' && it.roleCode && rc !== undefined && Math.abs(rc - it.unitCost) < 1e-6 ? F(rateFormula(`$E${rr}`)) : it.unitCost;
    const compName = it.componentId ? sim.components.find((c) => c.id === it.componentId)?.name ?? '' : '';
    setCell(wsRO, rr, 1, i + 1);
    setCell(wsRO, rr, 2, it.category, { input: true });
    setCell(wsRO, rr, 3, it.name, { input: true });
    setCell(wsRO, rr, 4, KIND_OPEX[it.kind]);
    setCell(wsRO, rr, 5, it.roleCode ?? '', { input: true });
    setCell(wsRO, rr, 6, it.qty, { input: true });
    setCell(wsRO, rr, 7, rateCell, { input: true, fmt: FMT_NUM });
    setCell(wsRO, rr, 8, it.kind === 'manpower' ? it.daysPerMonth : '', { input: true });
    setCell(wsRO, rr, 9, it.kind === 'manpower' ? it.toolPerMonth : '', { input: true, fmt: FMT_NUM });
    setCell(wsRO, rr, 10, it.kind === 'manpower' ? it.marginPct : '', { input: true, fmt: FMT_PCT });
    setCell(wsRO, rr, 11, it.kind === 'fixed' ? (it.period === 'month' ? 'Bulan' : 'Tahun') : '', { input: true });
    setCell(wsRO, rr, 12, it.kind === 'pctRevenue' ? it.pct : '', { input: true, fmt: FMT_PCT });
    setCell(wsRO, rr, 13, compName);
    const esc = it.escMode === 'inflation' ? F(A.infl) : it.escMode === 'custom' ? it.esc : 0;
    setCell(wsRO, rr, 14, it.kind === 'pctRevenue' ? 0 : esc, { input: it.escMode === 'custom', fmt: FMT_PCT });
    setCell(wsRO, rr, 15, it.startYear, { input: true });
    setCell(wsRO, rr, 16, it.endYear ?? 99, { input: true });
    let base: ExcelJS.CellValue = '';
    if (it.kind === 'manpower') base = F(`((F${rr}*G${rr}*H${rr})+(F${rr}*I${rr}))*(1+J${rr})*12`);
    else if (it.kind === 'fixed') base = F(`F${rr}*G${rr}*IF(K${rr}="Bulan",12,1)`);
    setCell(wsRO, rr, 17, base, { fmt: FMT_NUM });
  });
  setCell(wsRO, RO0 + sim.opex.length + 1, 2, 'Catatan: item "% Revenue" dihitung dari total revenue tahun berjalan; item "Per satuan" = biaya per satuan × volume komponen terkait. Selesai = 99 berarti sampai akhir tenor.', { color: 'FF666666' });

  // =========================================================
  // OPEX
  // =========================================================
  title(wsOpx, 'OPEX', 'Biaya = biaya dasar × (1+eskalasi)^(tahun-1) × pengali opex; hanya pada tahun aktif (mulai–selesai).');
  wsOpx.getColumn(2).width = 24;
  wsOpx.getColumn(3).width = 44;
  wsOpx.getColumn(4).width = 14;
  for (let y = 0; y <= N; y++) wsOpx.getColumn(YC(y)).width = 17;
  yearHeader(wsOpx, 4, N, g.startYear, 1);
  setCell(wsOpx, 6, 2, 'Kategori');
  setCell(wsOpx, 6, 3, 'Item');
  setCell(wsOpx, 6, 4, 'Jenis');
  headRow(wsOpx, 6, 2, YC(N));
  const OP0 = 7;
  sim.opex.forEach((it, i) => {
    const rr = OP0 + i;
    const ro = RO0 + i;
    setCell(wsOpx, rr, 2, F(`'Ref. OPEX'!B${ro}`));
    setCell(wsOpx, rr, 3, F(`'Ref. OPEX'!C${ro}`));
    setCell(wsOpx, rr, 4, F(`'Ref. OPEX'!D${ro}`));
    for (let y = 1; y <= N; y++) {
      const L = yl(y);
      const act = `AND(${L}$4>='Ref. OPEX'!$O${ro},${L}$4<='Ref. OPEX'!$P${ro})`;
      const esc = `(1+'Ref. OPEX'!$N${ro})^(${L}$4-1)`;
      let body: string;
      if (it.kind === 'pctRevenue') body = `'Ref. OPEX'!$L${ro}*REVENUE!${L}$${revTotal}`;
      else if (it.kind === 'perUnit') {
        const qr = it.componentId ? qtyRow[it.componentId] : undefined;
        body = qr ? `'Ref. OPEX'!$G${ro}*REVENUE!${L}$${qr}*${esc}` : '0';
      } else body = `'Ref. OPEX'!$Q${ro}*${esc}`;
      setCell(wsOpx, rr, YC(y), F(`IF(${act},${body}*${A.mOpex},0)`), { fmt: FMT_NUM });
    }
  });
  const OP1 = OP0 + Math.max(sim.opex.length, 1) - 1;
  const opxItemsRow = OP1 + 2;
  const opxInsRow = opxItemsRow + 1;
  const opxTotRow = opxInsRow + 1;
  const opxAmRow = opxTotRow + 1;
  const opxAllRow = opxAmRow + 1;
  setCell(wsOpx, opxItemsRow, 2, 'Jumlah item opex', { bold: true });
  setCell(wsOpx, opxInsRow, 2, 'Asuransi aset (otomatis, % capex)', { bold: true });
  setCell(wsOpx, opxTotRow, 2, 'TOTAL OPEX (tunai, termasuk asuransi)', { bold: true });
  setCell(wsOpx, opxAmRow, 2, 'Beban amortisasi (dari sheet CAPEX)', { bold: true });
  setCell(wsOpx, opxAllRow, 2, 'TOTAL BEBAN OPERASIONAL (opex + amortisasi)', { bold: true });
  // capex total row ada di sheet CAPEX; dihitung setelahnya -> deklarasi dulu
  // =========================================================
  // REF. CAPEX
  // =========================================================
  title(wsRC, 'REFERENSI CAPEX', 'Mandays: qty × mandays × (rate + alat kerja/hari). Lumpsum: nilai langsung. Sel kuning = input.');
  const rcHead = ['No', 'Kategori', 'Item', 'Jenis', 'Kode peran', 'Qty (orang)', 'Mandays', 'Rate/hari (Rp)', 'Alat kerja/hari (Rp)', 'Nilai lumpsum (Rp)', 'Tahun belanja', 'Umur amortisasi (thn)', 'Total capex (Rp)'];
  rcHead.forEach((h, i) => setCell(wsRC, 4, 1 + i, h));
  headRow(wsRC, 4, 1, 13);
  wsRC.getRow(4).height = 44;
  [5, 22, 40, 12, 12, 10, 10, 18, 16, 20, 11, 14, 22].forEach((w, i) => (wsRC.getColumn(1 + i).width = w));
  const RC0 = 5;
  sim.capex.forEach((it, i) => {
    const rr = RC0 + i;
    const rc = cardRate(it.roleCode);
    const rateCell = it.kind === 'manday' && it.roleCode && rc !== undefined && Math.abs(rc - it.rate) < 1e-6 ? F(rateFormula(`$E${rr}`)) : it.rate;
    setCell(wsRC, rr, 1, i + 1);
    setCell(wsRC, rr, 2, it.category, { input: true });
    setCell(wsRC, rr, 3, it.name, { input: true });
    setCell(wsRC, rr, 4, KIND_CAPEX[it.kind]);
    setCell(wsRC, rr, 5, it.roleCode ?? '', { input: true });
    setCell(wsRC, rr, 6, it.kind === 'manday' ? it.qty : '', { input: true });
    setCell(wsRC, rr, 7, it.kind === 'manday' ? it.mandays : '', { input: true });
    setCell(wsRC, rr, 8, it.kind === 'manday' ? rateCell : '', { input: true, fmt: FMT_NUM });
    setCell(wsRC, rr, 9, it.kind === 'manday' ? it.toolPerDay : '', { input: true, fmt: FMT_NUM });
    setCell(wsRC, rr, 10, it.kind === 'lump' ? it.amount : '', { input: true, fmt: FMT_NUM });
    setCell(wsRC, rr, 11, it.year, { input: true });
    setCell(wsRC, rr, 12, it.lifeYears === null ? F(A.tenor) : it.lifeYears, { input: true });
    setCell(wsRC, rr, 13, it.kind === 'manday' ? F(`F${rr}*G${rr}*(H${rr}+I${rr})`) : F(`J${rr}`), { fmt: FMT_NUM });
  });
  const RC1 = RC0 + Math.max(sim.capex.length, 1) - 1;
  setCell(wsRC, RC1 + 1, 12, 'TOTAL', { bold: true });
  setCell(wsRC, RC1 + 1, 13, sim.capex.length ? F(`SUM(M${RC0}:M${RC1})`) : 0, { bold: true, fmt: FMT_NUM });

  // =========================================================
  // CAPEX
  // =========================================================
  title(wsCpx, 'CAPEX & AMORTISASI', 'Belanja dicatat pada tahun belanja; amortisasi garis lurus mulai tahun berikutnya selama umur amortisasi, dikurangi nilai sisa.');
  wsCpx.getColumn(2).width = 24;
  wsCpx.getColumn(3).width = 44;
  wsCpx.getColumn(4).width = 14;
  for (let y = 0; y <= N; y++) wsCpx.getColumn(YC(y)).width = 17;
  yearHeader(wsCpx, 4, N, g.startYear, 0);
  setCell(wsCpx, 6, 2, 'A. BELANJA CAPEX', { bold: true });
  headRow(wsCpx, 6, 2, YC(N));
  const CP0 = 7;
  const nCap = sim.capex.length;
  sim.capex.forEach((_, i) => {
    const rr = CP0 + i;
    const rc = RC0 + i;
    setCell(wsCpx, rr, 2, F(`'Ref. CAPEX'!B${rc}`));
    setCell(wsCpx, rr, 3, F(`'Ref. CAPEX'!C${rc}`));
    for (let y = 0; y <= N; y++) setCell(wsCpx, rr, YC(y), F(`IF(${yl(y)}$4='Ref. CAPEX'!$K${rc},'Ref. CAPEX'!$M${rc}*${A.mCapex},0)`), { fmt: FMT_NUM });
  });
  const cpSpendTot = CP0 + Math.max(nCap, 1) + 1;
  const cpCum = cpSpendTot + 1;
  setCell(wsCpx, cpSpendTot, 2, 'TOTAL CAPEX', { bold: true });
  setCell(wsCpx, cpCum, 2, 'Capex kumulatif', { bold: true });
  for (let y = 0; y <= N; y++) {
    setCell(wsCpx, cpSpendTot, YC(y), F(nCap ? `SUM(${yl(y)}${CP0}:${yl(y)}${CP0 + nCap - 1})` : '0'), { fmt: FMT_NUM, bold: true });
    setCell(wsCpx, cpCum, YC(y), F(y === 0 ? `E${cpSpendTot}` : `${yl(y - 1)}${cpCum}+${yl(y)}${cpSpendTot}`), { fmt: FMT_NUM, bold: true });
  }
  bandRow(wsCpx, cpSpendTot, 2, YC(N), FILL_TOTAL);
  bandRow(wsCpx, cpCum, 2, YC(N), FILL_TOTAL);
  for (let y = 0; y <= N; y++) {
    wsCpx.getCell(cpSpendTot, YC(y)).numFmt = FMT_NUM;
    wsCpx.getCell(cpCum, YC(y)).numFmt = FMT_NUM;
  }
  const amHead = cpCum + 2;
  setCell(wsCpx, amHead, 2, 'B. BEBAN AMORTISASI', { bold: true });
  headRow(wsCpx, amHead, 2, YC(N));
  const AM0 = amHead + 1;
  sim.capex.forEach((_it, i) => {
    const rr = AM0 + i;
    const rc = RC0 + i;
    setCell(wsCpx, rr, 2, F(`'Ref. CAPEX'!B${rc}`));
    setCell(wsCpx, rr, 3, F(`'Ref. CAPEX'!C${rc}`));
    for (let y = 1; y <= N; y++) {
      const L = yl(y);
      setCell(wsCpx, rr, YC(y), F(`IF(AND(${L}$4>'Ref. CAPEX'!$K${rc},${L}$4<='Ref. CAPEX'!$K${rc}+'Ref. CAPEX'!$L${rc}),'Ref. CAPEX'!$M${rc}*${A.mCapex}*(1-${A.salv})/'Ref. CAPEX'!$L${rc},0)`), { fmt: FMT_NUM });
    }
  });
  const cpAmTot = AM0 + Math.max(nCap, 1) + 1;
  setCell(wsCpx, cpAmTot, 2, 'TOTAL AMORTISASI', { bold: true });
  for (let y = 1; y <= N; y++) setCell(wsCpx, cpAmTot, YC(y), F(nCap ? `SUM(${yl(y)}${AM0}:${yl(y)}${AM0 + nCap - 1})` : '0'), { fmt: FMT_NUM, bold: true });
  bandRow(wsCpx, cpAmTot, 2, YC(N), FILL_TOTAL);
  for (let y = 1; y <= N; y++) wsCpx.getCell(cpAmTot, YC(y)).numFmt = FMT_NUM;

  // --- lanjut OPEX totals (butuh capex kumulatif) ---
  for (let y = 1; y <= N; y++) {
    const L = yl(y);
    setCell(wsOpx, opxItemsRow, YC(y), F(sim.opex.length ? `SUM(${L}${OP0}:${L}${OP0 + sim.opex.length - 1})` : '0'), { fmt: FMT_NUM, bold: true });
    setCell(wsOpx, opxInsRow, YC(y), F(`${A.ins}*CAPEX!${yl(y - 1)}$${cpCum}`), { fmt: FMT_NUM });
    setCell(wsOpx, opxTotRow, YC(y), F(`${L}${opxItemsRow}+${L}${opxInsRow}`), { fmt: FMT_NUM, bold: true });
  }
  for (let y = 1; y <= N; y++) {
    const L = yl(y);
    setCell(wsOpx, opxAmRow, YC(y), F(`CAPEX!${L}${cpAmTot}`), { fmt: FMT_NUM });
    setCell(wsOpx, opxAllRow, YC(y), F(`${L}${opxTotRow}+${L}${opxAmRow}`), { fmt: FMT_NUM, bold: true });
  }
  bandRow(wsOpx, opxTotRow, 2, YC(N), FILL_TOTAL);
  bandRow(wsOpx, opxAllRow, 2, YC(N), FILL_TOTAL);
  for (let y = 1; y <= N; y++) {
    wsOpx.getCell(opxTotRow, YC(y)).numFmt = FMT_NUM;
    wsOpx.getCell(opxAllRow, YC(y)).numFmt = FMT_NUM;
  }
  // rekap per kategori
  const cats = Array.from(new Set(sim.opex.map((o) => o.category)));
  const recapHead = opxAllRow + 2;
  setCell(wsOpx, recapHead, 2, 'REKAP PER KATEGORI', { bold: true });
  headRow(wsOpx, recapHead, 2, YC(N));
  cats.forEach((cat, i) => {
    const rr = recapHead + 1 + i;
    setCell(wsOpx, rr, 2, cat);
    for (let y = 1; y <= N; y++) {
      const L = yl(y);
      setCell(wsOpx, rr, YC(y), F(`SUMIF($B$${OP0}:$B$${OP1},$B${rr},${L}$${OP0}:${L}$${OP1})`), { fmt: FMT_NUM });
    }
  });

  // =========================================================
  // FIN MODEL
  // =========================================================
  title(wsFin, 'ANALISIS FINANSIAL (FINANCIAL MODEL)', 'Seluruh angka dalam Rupiah. Tahun ke-0 = persiapan/pembangunan.');
  wsFin.getColumn(2).width = 46;
  wsFin.getColumn(3).width = 4;
  wsFin.getColumn(4).width = 4;
  for (let y = 0; y <= N; y++) wsFin.getColumn(YC(y)).width = 18;
  yearHeader(wsFin, 4, N, g.startYear, 0);
  const fin: Record<string, number> = {};
  let fr = 7;
  const section = (label: string) => {
    setCell(wsFin, fr, 2, label, { bold: true });
    bandRow(wsFin, fr, 2, YC(N), FILL_SUB);
    fr++;
  };
  const line = (key: string, label: string, make: (y: number) => string | null, opts: { bold?: boolean; total?: boolean; pct?: boolean } = {}) => {
    fin[key] = fr;
    setCell(wsFin, fr, 2, label, { bold: opts.bold });
    for (let y = 0; y <= N; y++) {
      const f = make(y);
      if (f !== null) setCell(wsFin, fr, YC(y), F(f), { fmt: opts.pct ? FMT_PCT : FMT_NUM, bold: opts.bold });
    }
    if (opts.total) bandRow(wsFin, fr, 2, YC(N), FILL_TOTAL);
    if (opts.total) for (let y = 0; y <= N; y++) wsFin.getCell(fr, YC(y)).numFmt = FMT_NUM;
    fr++;
  };
  const prev = (y: number) => yl(y - 1);

  section('1. LABA / RUGI');
  sim.components.forEach((c) => line(`rev_${c.id}`, `   ${c.name}`, (y) => (y >= 1 ? `REVENUE!${yl(y)}${revRow[c.id]}` : null)));
  line('revenue', 'PENDAPATAN', (y) => (y >= 1 ? `REVENUE!${yl(y)}${revTotal}` : null), { bold: true });
  line('opex', 'Opex (tanpa asuransi)', (y) => (y >= 1 ? `OPEX!${yl(y)}${opxItemsRow}` : null));
  line('ins', 'Asuransi aset (otomatis, % capex)', (y) => (y >= 1 ? `OPEX!${yl(y)}${opxInsRow}` : null));
  line('ebitda', 'EBITDA', (y) => (y >= 1 ? `${yl(y)}${fin.revenue}-${yl(y)}${fin.opex}-${yl(y)}${fin.ins}` : null), { bold: true });
  line('amort', 'Depresiasi / Amortisasi', (y) => (y >= 1 ? `CAPEX!${yl(y)}${cpAmTot}` : null));
  line('ebit', 'EBIT (laba usaha)', (y) => (y >= 1 ? `${yl(y)}${fin.ebitda}-${yl(y)}${fin.amort}` : null), { bold: true });
  line('interest', 'Bunga pinjaman', (y) => (y >= 1 ? `${yl(y)}${fr + 14}` : null)); // placeholder, diperbaiki setelah baris utang ada
  line('ebt', 'Laba sebelum pajak (EBT)', (y) => (y >= 1 ? `${yl(y)}${fin.ebit}-${yl(y)}${fin.interest}` : null), { bold: true });
  line('tax', 'Pajak badan', (y) => (y >= 1 ? `IF(${yl(y)}${fin.ebt}>0,${A.tax}*${yl(y)}${fin.ebt},0)` : null));
  line('ni', 'LABA BERSIH', (y) => (y >= 1 ? `${yl(y)}${fin.ebt}-${yl(y)}${fin.tax}` : null), { bold: true, total: true });
  line('mEbitda', 'EBITDA margin', (y) => (y >= 1 ? `IF(${yl(y)}${fin.revenue}=0,0,${yl(y)}${fin.ebitda}/${yl(y)}${fin.revenue})` : null), { pct: true });
  line('mNet', 'Net margin', (y) => (y >= 1 ? `IF(${yl(y)}${fin.revenue}=0,0,${yl(y)}${fin.ni}/${yl(y)}${fin.revenue})` : null), { pct: true });
  fr++;
  section('2. PENDANAAN (UTANG)');
  line('dOpen', 'Saldo awal', (y) => (y >= 1 ? `${prev(y)}${fr + 3}` : null));
  line('dDraw', 'Penarikan utang (tahun ke-0)', (y) => (y === 0 ? `${A.debt}*CAPEX!E${cpSpendTot}` : null));
  line('dPrin', 'Angsuran pokok', (y) => (y >= 1 ? `IF(${yl(y)}$4<=${A.repay},MIN(${yl(y)}${fin.dOpen},$E${fin.dDraw}/${A.repay}),0)` : null));
  line('dClose', 'Saldo akhir', (y) => (y === 0 ? `E${fin.dDraw}` : `${yl(y)}${fin.dOpen}-${yl(y)}${fin.dPrin}`), { bold: true });
  line('dInt', 'Bunga (saldo awal × bunga)', (y) => (y >= 1 ? `${yl(y)}${fin.dOpen}*${A.rate}` : null));
  // betulkan referensi bunga di laba rugi
  for (let y = 1; y <= N; y++) wsFin.getCell(fin.interest, YC(y)).value = F(`${yl(y)}${fin.dInt}`);
  fr++;
  section('3. ARUS KAS');
  line('cfCapex', 'Belanja capex (−)', (y) => `CAPEX!${yl(y)}${cpSpendTot}`);
  line('cfPrin', 'Angsuran pokok (−)', (y) => (y >= 1 ? `${yl(y)}${fin.dPrin}` : '0'));
  line('cfOut', 'Total pengeluaran', (y) => `${yl(y)}${fin.cfCapex}+${yl(y)}${fin.cfPrin}`, { bold: true });
  line('cfNi', 'Laba bersih (+)', (y) => (y >= 1 ? `${yl(y)}${fin.ni}` : '0'));
  line('cfAm', 'Depresiasi / amortisasi (+)', (y) => (y >= 1 ? `${yl(y)}${fin.amort}` : '0'));
  line('cfDebt', 'Penarikan utang (+)', (y) => (y === 0 ? `E${fin.dDraw}` : '0'));
  // nilai sisa = % × total capex (kumulatif akhir tenor), diterima di tahun terakhir
  line('cfSalv', 'Nilai sisa aset (+)', (y) => (y === N ? `${A.salv}*CAPEX!${yl(N)}${cpCum}` : '0'));
  line('cfIn', 'Total pemasukan', (y) => `${yl(y)}${fin.cfNi}+${yl(y)}${fin.cfAm}+${yl(y)}${fin.cfDebt}+${yl(y)}${fin.cfSalv}`, { bold: true });
  line('ncf', 'ARUS KAS BERSIH (NCF)', (y) => `${yl(y)}${fin.cfIn}-${yl(y)}${fin.cfOut}`, { bold: true, total: true });
  line('cum', 'Arus kas kumulatif', (y) => (y === 0 ? `E${fin.ncf}` : `${prev(y)}${fr}+${yl(y)}${fin.ncf}`), { bold: true });
  line('flag', 'Penanda kumulatif ≥ 0 (bantu payback)', (y) => (y >= 1 ? `IF(${yl(y)}${fin.cum}>=0,1,0)` : null));
  line('df', 'Discount factor', (y) => `1/(1+${A.disc})^${yl(y)}$4`);
  line('pvf', 'PV arus kas', (y) => `${yl(y)}${fin.ncf}*${yl(y)}${fin.df}`);
  fr++;
  section('4. INDIKATOR KELAYAKAN');
  const kpi = (key: string, label: string, f: string, fmt: string) => {
    fin[key] = fr;
    setCell(wsFin, fr, 2, label, { bold: true });
    setCell(wsFin, fr, 5, F(f), { fmt, bold: true, fill: FILL_TOTAL });
    fr++;
  };
  const rngNcf = `E${fin.ncf}:${yl(N)}${fin.ncf}`;
  const rngCum = `E${fin.cum}:${yl(N)}${fin.cum}`;
  const rngFlag = `F${fin.flag}:${yl(N)}${fin.flag}`;
  kpi('npv', 'NPV (pada discount rate)', `SUM(E${fin.pvf}:${yl(N)}${fin.pvf})`, FMT_NUM);
  kpi('irr', 'IRR', `IFERROR(IRR(${rngNcf},0.1),"n/a")`, '0.00%');
  kpi('pv', 'PV arus kas tahun 1..N', `SUM(F${fin.pvf}:${yl(N)}${fin.pvf})`, FMT_NUM);
  kpi('inv', 'Investasi awal (kas keluar tahun ke-0)', `MAX(0,-E${fin.ncf})`, FMT_NUM);
  setCell(wsFin, fin.inv, 6, F(`IF(E${fin.inv}=0,"⚠ Tidak ada kas keluar di tahun ke-0 (capex kosong): IRR, PI, dan ROI tidak dapat dihitung. Isi item capex atau gunakan NPV.","")`), { color: 'FFC0392B' });
  kpi('pi', 'Profitability Index (PV / investasi)', `IF(E${fin.inv}>0,E${fin.pv}/E${fin.inv},"n/a")`, '0.00');
  kpi('roi', 'ROI (NPV / investasi)', `IF(E${fin.inv}>0,E${fin.npv}/E${fin.inv},"n/a")`, '0.0%');
  kpi('pb', 'Payback period (tahun ke-)', `IF(SUM(${rngFlag})=0,"> tenor",MATCH(1,${rngFlag},0))`, '0');
  kpi('bep', 'Break even point (tahun, interpolasi)', `IF(ISNUMBER(E${fin.pb}),E${fin.pb}-1+IF(INDEX(${rngNcf},1,E${fin.pb}+1)=0,0,-INDEX(${rngCum},1,E${fin.pb})/INDEX(${rngNcf},1,E${fin.pb}+1)),"> tenor")`, '0.00');
  kpi('tot', 'Total arus kas bersih (akhir tenor)', `${yl(N)}${fin.cum}`, FMT_NUM);
  kpi('res', 'HASIL (NPV>0, IRR>WACC, PI>1)', `IF(AND(E${fin.npv}>0,ISNUMBER(E${fin.irr}),ISNUMBER(E${fin.pi})),IF(AND(E${fin.irr}>${A.wacc},E${fin.pi}>1),"OK","ASK BOD"),"ASK BOD")`, '@');
  wsFin.views = [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 5 }];

  // fix OPEX row for total in FIN: referensi sudah. =========================================

  // =========================================================
  // EX SUMMARY
  // =========================================================
  title(wsSum, 'EXECUTIVE SUMMARY', undefined);
  wsSum.getColumn(2).width = 40;
  wsSum.getColumn(3).width = 24;
  for (let y = 0; y <= N; y++) wsSum.getColumn(YC(y)).width = Math.max(wsSum.getColumn(YC(y)).width ?? 0, 18);
  setCell(wsSum, 3, 2, F('Asumsi!D4'), { bold: true });
  const sm = (rr: number, label: string, f: string, fmt?: string, bold = false) => {
    setCell(wsSum, rr, 2, label);
    setCell(wsSum, rr, 3, F(f), { fmt, bold });
  };
  setCell(wsSum, 5, 2, 'Asumsi keuangan', { bold: true });
  bandRow(wsSum, 5, 2, 3, FILL_SUB);
  sm(6, 'Discount rate (CoF + risk premium)', A.disc, FMT_PCT);
  sm(7, 'WACC (batas IRR)', A.wacc, FMT_PCT);
  sm(8, 'Tenor (tahun)', A.tenor, '0');
  sm(9, 'Skenario aktif', 'Asumsi!B29');
  setCell(wsSum, 11, 2, 'Indikator kelayakan', { bold: true });
  bandRow(wsSum, 11, 2, 3, FILL_SUB);
  sm(12, 'NPV', `'FIN Model'!E${fin.npv}`, FMT_NUM, true);
  sm(13, 'IRR', `'FIN Model'!E${fin.irr}`, '0.00%', true);
  sm(14, 'Profitability Index', `'FIN Model'!E${fin.pi}`, '0.00');
  sm(15, 'ROI (NPV / investasi)', `'FIN Model'!E${fin.roi}`, '0.0%');
  sm(16, 'Payback (tahun ke-)', `'FIN Model'!E${fin.pb}`, '0');
  sm(17, 'BEP (tahun)', `'FIN Model'!E${fin.bep}`, '0.00');
  sm(18, 'Total arus kas bersih', `'FIN Model'!E${fin.tot}`, FMT_NUM);
  sm(19, 'HASIL', `'FIN Model'!E${fin.res}`, '@', true);
  setCell(wsSum, 21, 2, 'Total selama tenor', { bold: true });
  bandRow(wsSum, 21, 2, 3, FILL_SUB);
  sm(22, 'Total revenue', `SUM('FIN Model'!F${fin.revenue}:${yl(N)}${fin.revenue})`, FMT_NUM);
  sm(23, 'Total capex', `SUM('FIN Model'!E${fin.cfCapex}:${yl(N)}${fin.cfCapex})`, FMT_NUM);
  sm(24, 'Total opex (tunai)', `SUM(OPEX!F${opxTotRow}:${yl(N)}${opxTotRow})`, FMT_NUM);
  sm(26, 'Total beban operasional (opex + amortisasi)', `SUM(OPEX!F${opxAllRow}:${yl(N)}${opxAllRow})`, FMT_NUM);
  sm(25, 'Total laba bersih', `SUM('FIN Model'!F${fin.ni}:${yl(N)}${fin.ni})`, FMT_NUM);
  setCell(wsSum, 27, 2, 'Ringkasan tahunan', { bold: true });
  yearHeader(wsSum, 28, N, g.startYear, 0);
  // Tampilan arus kas tunai: kas keluar bernilai minus, capex di tahun ke-0, tanpa amortisasi (non-tunai).
  const FM = (y: number, k: string) => `'FIN Model'!${yl(y)}${fin[k]}`;
  const sumLines: [string, (y: number) => string, boolean][] = [
    ['Pendapatan', (y) => (y >= 1 ? FM(y, 'revenue') : '0'), false],
    ['Opex tunai (−)', (y) => (y >= 1 ? `-(${FM(y, 'opex')}+${FM(y, 'ins')})` : '0'), false],
    ['Capex (−)', (y) => `-${FM(y, 'cfCapex')}`, false],
    ['Pajak & bunga (−)', (y) => (y >= 1 ? `-(${FM(y, 'tax')}+${FM(y, 'interest')})` : '0'), false],
    ['Pendanaan & nilai sisa', (y) => `${FM(y, 'cfDebt')}-${FM(y, 'cfPrin')}+${FM(y, 'cfSalv')}`, false],
    ['Arus kas bersih', (y) => FM(y, 'ncf'), true],
    ['Arus kas kumulatif', (y) => FM(y, 'cum'), true],
    ['EBITDA (memo)', (y) => (y >= 1 ? FM(y, 'ebitda') : '0'), false],
    ['Laba bersih (memo)', (y) => (y >= 1 ? FM(y, 'ni') : '0'), false],
  ];
  sumLines.forEach(([label, make, bold], i) => {
    const rr = 31 + i;
    setCell(wsSum, rr, 2, label, { bold });
    for (let y = 0; y <= N; y++) setCell(wsSum, rr, YC(y), F(make(y)), { fmt: FMT_NUM, bold });
  });
  setCell(wsSum, 31 + sumLines.length + 1, 2, 'Catatan: workbook ini berisi rumus hidup. Ubah sel kuning di sheet Asumsi / Trx Projections / REVENUE / Ref. OPEX / Ref. CAPEX, hasil di sheet ini ikut berubah.', { color: 'FF666666' });

  // =========================================================
  // SENSITIVITAS (snapshot)
  // =========================================================
  title(wsSen, 'ANALISIS SENSITIVITAS', 'SNAPSHOT: nilai dihitung aplikasi saat ekspor (statis). Untuk what-if langsung di Excel, ubah pengali pada Asumsi!D22:D25.');
  wsSen.getColumn(2).width = 36;
  for (let c = 3; c <= 9; c++) wsSen.getColumn(c).width = 20;
  const sens = sensitivity(sim);
  setCell(wsSen, 5, 2, 'A. NPV terhadap perubahan satu variabel', { bold: true });
  setCell(wsSen, 6, 2, 'Variabel');
  SENS_DELTAS.forEach((d, i) => setCell(wsSen, 6, 3 + i, `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`));
  headRow(wsSen, 6, 2, 2 + SENS_DELTAS.length);
  sens.forEach((row, i) => {
    setCell(wsSen, 7 + i, 2, row.label);
    row.deltas.forEach((d, j) => setCell(wsSen, 7 + i, 3 + j, d.npv, { fmt: FMT_NUM }));
  });
  let sr = 7 + sens.length + 1;
  setCell(wsSen, sr, 2, 'B. IRR terhadap perubahan satu variabel', { bold: true });
  setCell(wsSen, sr + 1, 2, 'Variabel');
  SENS_DELTAS.forEach((d, i) => setCell(wsSen, sr + 1, 3 + i, `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`));
  headRow(wsSen, sr + 1, 2, 2 + SENS_DELTAS.length);
  sens.forEach((row, i) => {
    setCell(wsSen, sr + 2 + i, 2, row.label);
    row.deltas.forEach((d, j) => setCell(wsSen, sr + 2 + i, 3 + j, d.irr === null ? 'n/a' : d.irr, { fmt: '0.0%' }));
  });
  sr += 2 + sens.length + 1;
  setCell(wsSen, sr, 2, 'C. Perbandingan skenario', { bold: true });
  ['Skenario', 'Total revenue', 'NPV', 'IRR', 'PI', 'Payback (thn ke-)', 'Hasil'].forEach((h, i) => setCell(wsSen, sr + 1, 2 + i, h));
  headRow(wsSen, sr + 1, 2, 8);
  scenarioComparison(sim).forEach((s, i) => {
    const rr = sr + 2 + i;
    setCell(wsSen, rr, 2, s.name);
    setCell(wsSen, rr, 3, s.revenue, { fmt: FMT_NUM });
    setCell(wsSen, rr, 4, s.npv, { fmt: FMT_NUM });
    setCell(wsSen, rr, 5, s.irr ?? 'n/a', { fmt: '0.0%' });
    setCell(wsSen, rr, 6, s.pi ?? 'n/a', { fmt: '0.00' });
    setCell(wsSen, rr, 7, s.payback ?? '> tenor');
    setCell(wsSen, rr, 8, s.result);
  });
  sr += 2 + sim.scenarios.length + 1;
  setCell(wsSen, sr, 2, 'D. Matriks NPV: harga (baris) × volume (kolom)', { bold: true });
  setCell(wsSen, sr + 1, 2, 'Harga \\ Volume');
  MATRIX_VOLUME.forEach((v, i) => setCell(wsSen, sr + 1, 3 + i, `${Math.round(v * 100)}%`));
  headRow(wsSen, sr + 1, 2, 2 + MATRIX_VOLUME.length);
  priceVolumeMatrix(sim).forEach((rowv, i) => {
    setCell(wsSen, sr + 2 + i, 2, `${Math.round(MATRIX_PRICE[i] * 100)}%`, { bold: true });
    rowv.forEach((v, j) => setCell(wsSen, sr + 2 + i, 3 + j, v, { fmt: FMT_NUM }));
  });

  // =========================================================
  // CATATAN
  // =========================================================
  title(wsNote, 'CATATAN & PANDUAN');
  wsNote.getColumn(2).width = 40;
  wsNote.getColumn(3).width = 34;
  wsNote.getColumn(4).width = 14;
  wsNote.getColumn(5).width = 70;
  setCell(wsNote, 4, 2, 'Deskripsi simulasi', { bold: true });
  setCell(wsNote, 5, 2, sim.description || '-', { wrap: true });
  wsNote.mergeCells(5, 2, 5, 5);
  wsNote.getRow(5).height = 48;
  setCell(wsNote, 7, 2, 'Ledger asumsi');
  setCell(wsNote, 7, 3, 'Nilai');
  setCell(wsNote, 7, 4, 'Status');
  setCell(wsNote, 7, 5, 'Sumber / catatan');
  headRow(wsNote, 7, 2, 5);
  sim.notes.forEach((n, i) => {
    setCell(wsNote, 8 + i, 2, n.param, { wrap: true });
    setCell(wsNote, 8 + i, 3, n.value, { wrap: true });
    setCell(wsNote, 8 + i, 4, n.status);
    setCell(wsNote, 8 + i, 5, n.source, { wrap: true });
  });
  const nr = 8 + sim.notes.length + 1;
  setCell(wsNote, nr, 2, 'Panduan sheet', { bold: true });
  const guide = [
    'Ex Summary — ringkasan indikator kelayakan.',
    'FIN Model — laba rugi, pendanaan, arus kas, NPV/IRR/payback.',
    'REVENUE & Trx Projections — proyeksi volume, take-up rate, harga per komponen.',
    'OPEX & Ref. OPEX — biaya operasional (manpower, infra, overhead, biaya langsung).',
    'CAPEX & Ref. CAPEX — belanja modal dan amortisasi.',
    'Asumsi — parameter umum, pendanaan, skenario harga, pengali what-if.',
    'Sensitivitas — snapshot dari aplikasi (statis).',
    'Struktur kolom tahun dibuat sesuai tenor saat ekspor; untuk mengubah tenor, ubah di aplikasi lalu ekspor ulang.',
    'Nilai sisa dan unamortized book value di luar tenor tidak dimodelkan sebagai arus kas selain nilai sisa (salvage) yang diinput.',
  ];
  guide.forEach((t, i) => setCell(wsNote, nr + 1 + i, 2, t));

  evaluateWorkbook(wb); // nilai cache untuk viewer tanpa mesin hitung

  return wb;
}

export async function exportXlsxBuffer(sim: Simulation, rateCard: RateCardRole[]): Promise<ArrayBuffer> {
  const wb = await buildWorkbook(sim, rateCard);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return addCharts(buf, compute(sim));
}
