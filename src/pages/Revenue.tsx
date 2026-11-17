import type { Simulation } from '../types';
import { newComponent, newScenario } from '../defaults';
import { Badge, Btn, Card, Empty, Field, NumField, Select, TextField, YearRow, YearTable } from '../ui';
import { compute } from '../engine';
import { fmt, fmtUnit, UNIT_LABEL } from '../format';

type Upd = (fn: (s: Simulation) => void) => void;

export default function Revenue({ sim, update }: { sim: Simulation; update: Upd }) {
  const res = compute(sim);
  const N = res.N;
  const du = sim.general.displayUnit;
  return (
    <div className="stack">
      {sim.components.length > 0 && (
        <Card title="Rekap revenue" sub={`Ringkasan revenue skenario aktif per komponen, dalam ${UNIT_LABEL[du]} (volume dalam satuan masing-masing).`}>
          <YearTable
            firstLabel={`Revenue (${UNIT_LABEL[du]})`}
            years={res.calendar}
            totalLabel="Total periode"
            fmtNum={(n) => fmtUnit(n, du)}
            rows={[
              ...sim.components.map((c) => ({ label: `   ${c.name}`, values: res.comp[c.id]?.revenue ?? [] })),
              { label: 'TOTAL REVENUE', values: res.revenue, bold: true },
            ]}
          />
          <h4 className="mt">Volume terjual</h4>
          <YearTable
            firstLabel="Volume"
            years={res.calendar}
            totalLabel="Total periode"
            fmtNum={(n) => fmt(n)}
            rows={sim.components.map((c) => ({ label: `   ${c.name} (${c.unit})`, values: res.comp[c.id]?.qty ?? [] }))}
          />
          <h4 className="mt">Pertumbuhan & komposisi</h4>
          <YearTable
            firstLabel="Persentase"
            years={res.calendar}
            fmtNum={(n) => fmt(n * 100, 1) + '%'}
            rows={[
              { label: 'Pertumbuhan total revenue (YoY)', values: res.years.map((y) => (y >= 2 && res.revenue[y - 1] > 0 ? res.revenue[y] / res.revenue[y - 1] - 1 : null)) },
              ...sim.components.map((c) => ({ label: `   Porsi ${c.name}`, values: res.years.map((y) => (res.revenue[y] > 0 ? (res.comp[c.id]?.revenue[y] ?? 0) / res.revenue[y] : null)) })),
            ]}
          />
        </Card>
      )}

      <Card
        title="Komponen revenue"
        sub="Volume terjual = volume driver × take-up rate × faktor konversi. Revenue = volume × harga skenario aktif (naik sesuai eskalasi harga)."
        actions={<Btn kind="primary" onClick={() => update((s) => { const c = newComponent(s.drivers[0]?.id ?? null); s.components.push(c); for (const sc of s.scenarios) sc.prices[c.id] = c.price; })}>+ Tambah komponen</Btn>}
      >
        {sim.components.length === 0 && <Empty>Belum ada komponen revenue.</Empty>}
      </Card>

      {sim.components.map((c, ci) => {
        const drv = sim.drivers.find((d) => d.id === c.driverId);
        const cr = res.comp[c.id];
        return (
          <Card
            key={c.id}
            title={c.name || 'Komponen'}
            actions={
              <Btn
                kind="danger"
                onClick={() =>
                  update((s) => {
                    s.components.splice(ci, 1);
                    for (const sc of s.scenarios) delete sc.prices[c.id];
                    s.opex = s.opex.map((o) => (o.componentId === c.id ? { ...o, componentId: null } : o));
                  })
                }
              >
                Hapus
              </Btn>
            }
          >
            <div className="grid3">
              <Field label="Nama komponen">
                <TextField value={c.name} onChange={(v) => update((s) => (s.components[ci].name = v))} />
              </Field>
              <Field label="Satuan jual">
                <TextField value={c.unit} onChange={(v) => update((s) => (s.components[ci].unit = v))} width={140} />
              </Field>
              <Field label="Driver volume">
                <Select
                  value={c.driverId ?? ''}
                  onChange={(v) => update((s) => (s.components[ci].driverId = v || null))}
                  options={[{ value: '', label: '— tidak ada —' }, ...sim.drivers.map((d) => ({ value: d.id, label: d.name }))]}
                />
              </Field>
              <Field label={`Faktor konversi (${c.unit} per ${drv?.unit ?? 'unit driver'})`} hint="1 = jumlah penjualan sama dengan volume driver × take-up.">
                <NumField value={c.conversion} decimals={6} onChange={(v) => update((s) => (s.components[ci].conversion = v))} />
              </Field>
              <Field label={`Harga dasar (Rp/${c.unit})`} hint="Dipakai sebagai nilai awal harga di tiap skenario.">
                <NumField
                  value={c.price}
                  onChange={(v) =>
                    update((s) => {
                      const comp = s.components[ci];
                      for (const sc of s.scenarios) if (sc.prices[comp.id] === undefined || sc.prices[comp.id] === comp.price) sc.prices[comp.id] = v;
                      comp.price = v;
                    })
                  }
                  prefix="Rp"
                />
              </Field>
              <Field label="Kenaikan harga per tahun">
                <NumField value={Math.round(c.priceEscalation * 1e8) / 1e6} suffix="%" decimals={2} onChange={(v) => update((s) => (s.components[ci].priceEscalation = v / 100))} />
              </Field>
            </div>
            <YearRow
              label="Take-up rate per tahun (porsi dari volume driver yang menjadi penjualan)"
              values={c.takeUp}
              tenor={N}
              startYear={sim.general.startYear}
              pct
              onChange={(i, v) => update((s) => (s.components[ci].takeUp[i] = v))}
              onFill={() => update((s) => s.components[ci].takeUp.fill(s.components[ci].takeUp[0]))}
            />
            {cr && (
              <YearTable
                firstLabel="Hasil (skenario aktif)"
                years={res.calendar}
                fmtNum={(n) => fmt(n)}
                rows={[
                  { label: `Volume (${c.unit})`, values: cr.qty },
                  { label: 'Harga (Rp)', values: cr.price },
                  { label: `Revenue (${UNIT_LABEL[du]})`, values: cr.revenue, bold: true, fmt: (n) => fmtUnit(n, du) },
                ]}
              />
            )}
          </Card>
        );
      })}

      <Card
        title="Skenario harga & volume"
        sub="Setiap skenario memiliki harga per komponen dan pengali volume. Pilih skenario aktif untuk dihitung di seluruh model; bandingkan semua skenario di tab Hasil."
        actions={<Btn onClick={() => update((s) => s.scenarios.push(newScenario(s.components, { name: `Skenario ${s.scenarios.length + 1}` })))}>+ Tambah skenario</Btn>}
      >
        <div className="tablewrap">
          <table className="stable">
            <thead>
              <tr>
                <th>Aktif</th>
                <th>Nama skenario</th>
                <th>Pengali volume</th>
                {sim.components.map((c) => (
                  <th key={c.id}>
                    Harga {c.name}
                    <em>Rp/{c.unit}</em>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {sim.scenarios.map((sc, si) => (
                <tr key={sc.id} className={sc.id === sim.general.activeScenarioId ? 'active' : ''}>
                  <td>
                    <input type="radio" name="scn" checked={sc.id === sim.general.activeScenarioId} onChange={() => update((s) => (s.general.activeScenarioId = sc.id))} />
                  </td>
                  <td>
                    <TextField value={sc.name} onChange={(v) => update((s) => (s.scenarios[si].name = v))} />
                  </td>
                  <td>
                    <NumField value={sc.volumeMultiplier} decimals={2} suffix="×" width={110} onChange={(v) => update((s) => (s.scenarios[si].volumeMultiplier = v))} />
                  </td>
                  {sim.components.map((c) => (
                    <td key={c.id}>
                      <NumField value={sc.prices[c.id] ?? c.price} width={150} onChange={(v) => update((s) => (s.scenarios[si].prices[c.id] = v))} />
                    </td>
                  ))}
                  <td>
                    {sim.scenarios.length > 1 && (
                      <Btn
                        kind="ghost"
                        onClick={() =>
                          update((s) => {
                            s.scenarios.splice(si, 1);
                            if (!s.scenarios.some((x) => x.id === s.general.activeScenarioId)) s.general.activeScenarioId = s.scenarios[0].id;
                          })
                        }
                      >
                        Hapus
                      </Btn>
                    )}
                    {sc.id === sim.general.activeScenarioId && <Badge tone="info">aktif</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
