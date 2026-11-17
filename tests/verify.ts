// Verifikasi: hasil rumus Excel (dihitung ulang HyperFormula) == hasil engine aplikasi.
import { HyperFormula } from 'hyperformula';
import { buildWorkbook } from '../src/exportXlsx';
import { compute, irr } from '../src/engine';
import { exampleSimulation, blankSimulation, newOpex, newCapex, newScenario, fill } from '../src/defaults';
import { DEFAULT_RATE_CARD } from '../src/rateCard';
import type { Simulation } from '../src/types';

async function evalWorkbook(sim: Simulation) {
  const wb = await buildWorkbook(sim, DEFAULT_RATE_CARD);
  const sheets: Record<string, (string | number | boolean | null)[][]> = {};
  wb.eachSheet((ws) => {
    const rows: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const v = cell.value as any;
        let out: any = null;
        if (v && typeof v === 'object' && 'formula' in v) out = '=' + v.formula;
        else if (v && typeof v === 'object' && 'richText' in v) out = v.richText.map((t: any) => t.text).join('');
        else out = v;
        (rows[rn - 1] ||= [])[cn - 1] = out;
      });
    });
    for (let i = 0; i < rows.length; i++) rows[i] ||= [];
    sheets[ws.name] = rows;
  });
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3' });
  const get = (sheet: string, r: number, c: number) => hf.getCellValue({ sheet: hf.getSheetId(sheet)!, row: r - 1, col: c - 1 });
  // cari baris berdasarkan label kolom B
  const rowOf = (sheet: string, label: string) => {
    const rows = sheets[sheet];
    for (let i = 0; i < rows.length; i++) if (rows[i][1] === label) return i + 1;
    throw new Error(`label tidak ditemukan: ${sheet}/${label}`);
  };
  // error scan
  const errors: string[] = [];
  for (const name of Object.keys(sheets)) {
    const sid = hf.getSheetId(name)!;
    sheets[name].forEach((row, ri) => row.forEach((v, ci) => {
      if (typeof v === 'string' && v.startsWith('=')) {
        const val = hf.getCellValue({ sheet: sid, row: ri, col: ci });
        if (val && typeof val === 'object' && 'type' in (val as any)) errors.push(`${name}!R${ri + 1}C${ci + 1} ${v} -> ${JSON.stringify(val)}`);
      }
    }));
  }
  return { get, rowOf, errors };
}

let failed = 0;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

async function check(label: string, sim: Simulation) {
  const r = compute(sim);
  const N = r.N;
  const { get, rowOf, errors } = await evalWorkbook(sim);
  const bad: string[] = [];
  if (errors.length) bad.push(`error formula: ${errors.slice(0, 5).join(' | ')}`);
  const series = (lbl: string, arr: number[], from = 1) => {
    const row = rowOf('FIN Model', lbl);
    for (let y = from; y <= N; y++) {
      const v = get('FIN Model', row, 5 + y);
      if (typeof v !== 'number' || !close(v, arr[y])) bad.push(`${lbl} y${y}: excel=${v} app=${arr[y]}`);
    }
  };
  series('PENDAPATAN', r.revenue);
  series('Opex (tanpa asuransi)', r.opexItems);
  series('Asuransi aset (otomatis, % capex)', r.insurance);
  series('EBITDA', r.ebitda);
  series('Depresiasi / Amortisasi', r.amort);
  series('Bunga pinjaman', r.interest);
  series('LABA BERSIH', r.netIncome);
  series('Saldo akhir', r.debtClose, 0);
  series('ARUS KAS BERSIH (NCF)', r.ncf, 0);
  series('Arus kas kumulatif', r.cum, 0);
  const kpi = (lbl: string) => get('FIN Model', rowOf('FIN Model', lbl), 5);
  const m = r.metrics;
  const cmp = (name: string, ex: any, app: number | string | null) => {
    if (typeof app === 'number') { if (typeof ex !== 'number' || !close(ex, app)) bad.push(`${name}: excel=${ex} app=${app}`); }
    else if (app === null) { if (typeof ex === 'number') bad.push(`${name}: excel=${ex} app=null`); }
    else if (ex !== app) bad.push(`${name}: excel=${ex} app=${app}`);
  };
  cmp('NPV', kpi('NPV (pada discount rate)'), m.npv);
  // HyperFormula tidak punya IRR: cek bahwa IRR aplikasi adalah akar dari arus kas versi Excel.
  const ncfRow = rowOf('FIN Model', 'ARUS KAS BERSIH (NCF)');
  const exFlows = Array.from({ length: N + 1 }, (_, y) => get('FIN Model', ncfRow, 5 + y) as number);
  if (m.irr !== null) {
    const npvAtIrr = exFlows.reduce((s, c, t) => s + c / Math.pow(1 + m.irr!, t), 0);
    if (Math.abs(npvAtIrr) > 1) bad.push(`IRR bukan akar arus kas Excel: NPV@IRR=${npvAtIrr}`);
  }
  cmp('PI', kpi('Profitability Index (PV / investasi)'), m.pi);
  cmp('ROI', kpi('ROI (NPV / investasi)'), m.roi);
  cmp('Payback', kpi('Payback period (tahun ke-)'), m.payback ?? '> tenor');
  cmp('BEP', kpi('Break even point (tahun, interpolasi)'), m.bep ?? '> tenor');
  if (m.irr === null) cmp('HASIL', kpi('HASIL (NPV>0, IRR>WACC, PI>1)'), m.result);
  // nilai cache hasil evaluator internal harus sama dengan engine
  {
    const wbc = await buildWorkbook(sim, DEFAULT_RATE_CARD);
    const ws = wbc.getWorksheet('FIN Model')!;
    const cached = (lbl: string, y: number) => { const row = rowOf('FIN Model', lbl); const v = ws.getCell(row, 5 + y).value as any; return v && typeof v === 'object' ? (v.result ?? 0) : v; }; // ExcelJS menghilangkan result=0 pada getter (tetap tertulis <v>0</v> di file)
    const chk = (lbl: string, arr: number[], from = 1) => { for (let y = from; y <= N; y++) { const v = cached(lbl, y); if (typeof v !== 'number' || !close(v, arr[y])) bad.push(`cache ${lbl} y${y}: ${v} vs ${arr[y]}`); } };
    chk('PENDAPATAN', r.revenue); chk('LABA BERSIH', r.netIncome); chk('ARUS KAS BERSIH (NCF)', r.ncf, 0); chk('Arus kas kumulatif', r.cum, 0);
    const kv = (lbl: string) => cached(lbl, 0);
    if (!close(kv('NPV (pada discount rate)') as number, m.npv)) bad.push('cache NPV');
    const ci = kv('IRR'); if (m.irr === null ? ci !== 'n/a' : Math.abs((ci as number) - m.irr) > 1e-6) bad.push(`cache IRR ${ci} vs ${m.irr}`);
    if (kv('HASIL (NPV>0, IRR>WACC, PI>1)') !== m.result) bad.push('cache HASIL');
    const pb = kv('Payback period (tahun ke-)'); if (pb !== (m.payback ?? '> tenor')) bad.push(`cache payback ${pb}`);
  }
  if (bad.length) { failed++; console.log(`✗ ${label}\n   ` + bad.slice(0, 12).join('\n   ')); }
  else console.log(`✓ ${label}  (NPV ${Math.round(m.npv / 1e6)} jt, IRR ${m.irr === null ? 'n/a' : (m.irr * 100).toFixed(2) + '%'}, ${m.result})`);
}

(async () => {
  const ex = exampleSimulation();
  await check('Contoh bawaan', ex);

  const b = blankSimulation('kosong');
  await check('Simulasi kosong (default)', b);

  const v = exampleSimulation();
  v.general.tenor = 7;
  v.general.salvagePct = 0.1;
  v.general.insurancePct = 0.01;
  v.funding = { debtPct: 0.6, interestRate: 0.1, repaymentYears: 4 };
  v.flex = { price: 1.1, volume: 0.9, opex: 1.05, capex: 1.2 };
  v.general.activeScenarioId = v.scenarios[1].id;
  v.opex.push(newOpex('fixed', { name: 'Biaya start thn 3', qty: 2, unitCost: 5_000_000, period: 'month', startYear: 3, endYear: 5, escMode: 'custom', esc: 0.07 }));
  v.opex.push(newOpex('perUnit', { name: 'Per unit custom', componentId: v.components[1].id, unitCost: 1000, escMode: 'custom', esc: 0.05 }));
  v.capex.push(newCapex('lump', { name: 'Ekspansi thn 2', amount: 800_000_000, year: 2, lifeYears: 3 }));
  v.capex.push(newCapex('manday', { name: 'Manual rate', qty: 2, mandays: 30, rate: 1_234_567, toolPerDay: 10_000, year: 1, lifeYears: 4 }));
  v.drivers[0].mode = 'manual';
  v.drivers[0].manual = [300e6, 310e6, 500e6, 450e6, 600e6, 700e6, 650e6, 0, 0, 0];
  await check('Varian: tenor 7, utang, salvage, flex, item custom, driver manual', v);

  const w = blankSimulation('rugi');
  w.components[0].price = 10; // revenue kecil -> rugi
  w.opex.push(newOpex('fixed', { name: 'x', qty: 1, unitCost: 50_000_000, period: 'month' }));
  w.capex.push(newCapex('lump', { name: 'c', amount: 1_000_000_000 }));
  w.scenarios.push(newScenario(w.components, { name: 'dua', volumeMultiplier: 2 }));
  await check('Varian: tidak layak (IRR n/a, payback > tenor)', w);

  const big = blankSimulation('irr besar');
  big.drivers[0].baseVolume = 100_000_000; big.components[0].price = 50_000; // revenue besar vs capex kecil -> IRR ribuan persen
  big.capex.push(newCapex('lump', { name: 'c', amount: 2_500_000_000 }));
  await check('Varian: IRR sangat besar (>1000%)', big);
  if ((compute(big).metrics.irr ?? 0) < 10) { failed++; console.log('✗ IRR besar tidak ditemukan'); }

  const t1 = exampleSimulation();
  t1.general.tenor = 1;
  await check('Varian: tenor 1', t1);
  void fill;
  if (failed) { console.log(`\n${failed} skenario GAGAL`); process.exit(1); }
  // IRR dengan arus kas yang berganti tanda dua kali (tahun terakhir negatif), data dari laporan pengguna
  {
    const flows = [-1500, 1731.9525, 1611.65922, 1441.2915888, 1221.8968785, 977.604551, 926.01109077, 808.17378821, 601.93519542, 279.39377453, -309.24351765];
    const r = irr(flows);
    const npv = r === null ? NaN : flows.reduce((a, c, t) => a + c / Math.pow(1 + r, t), 0);
    if (r === null || Math.abs(npv) > 1e-6) { console.error('✗ IRR dua pergantian tanda gagal', r, npv); process.exit(1); }
    console.log(`✓ IRR arus kas dengan tahun terakhir negatif  (IRR ${(r * 100).toFixed(2)}%)`);
  }
  console.log('\nSemua skenario cocok antara aplikasi dan Excel.');
})();
