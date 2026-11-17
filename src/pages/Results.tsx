import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Simulation } from '../types';
import { Badge, Card, YearTable, Warn } from '../ui';
import { compute, MATRIX_PRICE, MATRIX_VOLUME, priceVolumeMatrix, SENS_DELTAS, scenarioComparison, sensitivity } from '../engine';
import { cashFlowLines } from '../xlsxCharts';
import { fmt, fmtPct, fmtUnit, UNIT_DIV, UNIT_LABEL } from '../format';

export default function Results({ sim }: { sim: Simulation }) {
  const res = compute(sim);
  const m = res.metrics;
  const du = sim.general.displayUnit;
  const div = UNIT_DIV[du];
  const f = (n: number) => fmtUnit(n, du);
  const cfl = cashFlowLines(res);
  const chart = res.years.map((y) => ({
    name: y === 0 ? 'Thn 0' : `Thn ${y}`,
    Pendapatan: cfl.rev[y] / div,
    'Opex tunai (−)': cfl.opex[y] / div,
    'Capex (−)': cfl.capex[y] / div,
    'Pajak & bunga (−)': cfl.taxInt[y] / div,
    'Pendanaan & nilai sisa': cfl.fin[y] / div,
    'Arus kas bersih': res.ncf[y] / div,
    'Arus kas kumulatif': res.cum[y] / div,
  }));
  const sens = sensitivity(sim);
  const scn = scenarioComparison(sim);
  const matrix = priceVolumeMatrix(sim);
  const maxAbs = Math.max(1, ...matrix.flat().map((v) => Math.abs(v)));
  const cell = (v: number) => {
    const a = Math.min(1, Math.abs(v) / maxAbs) * 0.45;
    return { background: v >= 0 ? `rgba(34,139,84,${a})` : `rgba(200,60,60,${a})` };
  };
  const cats = Array.from(new Set(sim.opex.map((o) => o.category)));
  const tick = (v: number) => fmt(v, du === 'miliar' ? 1 : 0);

  return (
    <div className="stack">
      <Card className="verdict-card">
        <div className="verdict">
          <div>
            <div className="vl">Hasil kajian</div>
            <div className={`vbig ${m.ok ? 'ok' : 'warn'}`}>{m.result}</div>
            <div className="vsub">
              {m.ok ? 'NPV positif, IRR di atas WACC, dan PI > 1.' : 'Belum memenuhi seluruh kriteria (NPV > 0, IRR > WACC, PI > 1) — konsultasikan ke BOD.'}
            </div>
          </div>
          <div className="kpis">
            <Kpi label={`NPV (${UNIT_LABEL[du]})`} value={f(m.npv)} neg={m.npv < 0} />
            <Kpi label="IRR" value={fmtPct(m.irr, 2)} sub={`WACC ${fmtPct(sim.general.wacc, 2)}`} neg={m.irr !== null && m.irr < sim.general.wacc} />
            <Kpi label="Profitability Index" value={m.pi === null ? 'n/a' : fmt(m.pi, 2)} sub="PV / investasi" neg={m.pi !== null && m.pi < 1} />
            <Kpi label="ROI (NPV/investasi)" value={fmtPct(m.roi, 1)} neg={m.roi !== null && m.roi < 0} />
            <Kpi label="Payback" value={m.payback === null ? '> tenor' : `Thn ke-${m.payback}`} sub={m.bep === null ? undefined : `BEP ${fmt(m.bep, 2)} thn`} />
            <Kpi label={`Total revenue (${UNIT_LABEL[du]})`} value={f(m.totalRevenue)} />
            <Kpi label={`Total capex (${UNIT_LABEL[du]})`} value={f(m.totalCapex)} />
            <Kpi label={`Total opex (${UNIT_LABEL[du]})`} value={f(m.totalOpex)} />
          </div>
        </div>
      </Card>

      {m.investment <= 0 && (
        <Warn>
          Tidak ada kas keluar di tahun ke-0 (belum ada item capex di tahun ke-0), sehingga IRR, Profitability Index, dan ROI tidak dapat dihitung. Tambahkan item capex di tab Capex.
        </Warn>
      )}
      {m.investment > 0 && m.irr === null && (
        <Warn>IRR tidak dapat dihitung karena arus kas tidak pernah berganti tanda (tidak pernah positif atau tidak pernah negatif).</Warn>
      )}

      <Card title="Grafik arus kas" sub={`Dalam ${UNIT_LABEL[du]} · kas keluar bernilai minus, capex di tahun ke-0, tanpa amortisasi (non-tunai)`}>
        <div className="chart">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="name" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" tickFormatter={tick} width={70} />
              <Tooltip formatter={(v: number) => fmt(v, 2)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey="Pendapatan" fill="#2f6fb5" />
              <Bar dataKey="Opex tunai (−)" fill="#d98c3b" />
              <Bar dataKey="Capex (−)" fill="#c0392b" />
              <Bar dataKey="Pajak & bunga (−)" fill="#8e8e93" />
              <Bar dataKey="Pendanaan & nilai sisa" fill="#2a9d6a" />
              <Line type="monotone" dataKey="Arus kas bersih" stroke="#222" strokeWidth={2} dot />
              <Line type="monotone" dataKey="Arus kas kumulatif" stroke="#ed7d31" strokeWidth={3} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Laba rugi" sub={`Dalam ${UNIT_LABEL[du]}`}>
        <YearTable
          years={res.calendar}
          fmtNum={f}
          rows={[
            ...sim.components.map((c) => ({ label: `   ${c.name}`, values: res.comp[c.id].revenue })),
            { label: 'Pendapatan', values: res.revenue, bold: true },
            ...cats.map((c) => ({ label: `   ${c}`, values: res.years.map((y) => -res.opexLines.filter((l) => l.category === c).reduce((a, l) => a + l.values[y], 0)) })),
            { label: '   Asuransi aset (otomatis, % capex)', values: res.insurance.map((v) => -v) },
            { label: 'EBITDA', values: res.ebitda, bold: true },
            { label: 'Amortisasi', values: res.amort.map((v) => -v) },
            { label: 'EBIT', values: res.ebit, bold: true },
            { label: 'Bunga', values: res.interest.map((v) => -v) },
            { label: 'Pajak', values: res.tax.map((v) => -v) },
            { label: 'Laba bersih', values: res.netIncome, bold: true },
          ]}
        />
      </Card>

      <Card title="Arus kas" sub={`Dalam ${UNIT_LABEL[du]}`}>
        <YearTable
          years={res.calendar}
          fromYear={0}
          fmtNum={f}
          rows={[
            { label: 'Belanja capex', values: res.capexSpend.map((v) => -v) },
            { label: 'Angsuran pokok', values: res.debtPrincipal.map((v) => -v) },
            { label: 'Laba bersih', values: res.netIncome.map((v, y) => (y === 0 ? 0 : v)) },
            { label: 'Amortisasi', values: res.amort },
            { label: 'Penarikan utang', values: res.debtDraw },
            { label: 'Nilai sisa aset', values: res.salvage },
            { label: 'Arus kas bersih', values: res.ncf, bold: true },
            { label: 'Kumulatif', values: res.cum, bold: true },
          ]}
        />
      </Card>

      <Card title="Perbandingan skenario" sub="Semua skenario dihitung dengan asumsi lain yang sama.">
        <div className="tablewrap">
          <table className="stable">
            <thead>
              <tr>
                <th>Skenario</th>
                <th>Total revenue</th>
                <th>NPV</th>
                <th>IRR</th>
                <th>PI</th>
                <th>Payback</th>
                <th>Hasil</th>
              </tr>
            </thead>
            <tbody>
              {scn.map((s) => (
                <tr key={s.id} className={s.id === sim.general.activeScenarioId ? 'active' : ''}>
                  <td>{s.name}</td>
                  <td className="r">{f(s.revenue)}</td>
                  <td className={`r ${s.npv < 0 ? 'neg' : ''}`}>{f(s.npv)}</td>
                  <td className="r">{fmtPct(s.irr, 1)}</td>
                  <td className="r">{s.pi === null ? 'n/a' : fmt(s.pi, 2)}</td>
                  <td className="r">{s.payback === null ? '> tenor' : `Thn ${s.payback}`}</td>
                  <td>
                    <Badge tone={s.result === 'OK' ? 'ok' : 'warn'}>{s.result}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Sensitivitas" sub={`NPV (${UNIT_LABEL[du]}) bila satu variabel berubah, variabel lain tetap.`}>
        <div className="tablewrap">
          <table className="stable ctr">
            <thead>
              <tr>
                <th>Variabel</th>
                {SENS_DELTAS.map((d) => (
                  <th key={d}>{d > 0 ? '+' : ''}{Math.round(d * 100)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sens.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {row.deltas.map((d) => (
                    <td key={d.delta} className={`r ${d.npv < 0 ? 'neg' : ''}`} title={`IRR ${fmtPct(d.irr, 1)}`}>{f(d.npv)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="mt">Matriks NPV: harga × volume</h4>
        <div className="tablewrap">
          <table className="stable matrix ctr">
            <thead>
              <tr>
                <th>Harga ↓ / Volume →</th>
                {MATRIX_VOLUME.map((v) => (
                  <th key={v}>{Math.round(v * 100)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i}>
                  <th>{Math.round(MATRIX_PRICE[i] * 100)}%</th>
                  {row.map((v, j) => (
                    <td key={j} className="r" style={cell(v)}>{f(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, neg }: { label: string; value: string; sub?: string; neg?: boolean }) {
  return (
    <div className="kpi">
      <div className="kl">{label}</div>
      <div className={`kv ${neg ? 'neg' : ''}`}>{value}</div>
      {sub && <div className="ks">{sub}</div>}
    </div>
  );
}
