import type { Simulation } from '../types';
import { newDriver } from '../defaults';
import { Btn, Card, Empty, Field, NumField, Select, TextField, YearRow, YearTable } from '../ui';
import { MAX_YEARS } from '../types';
import { compute } from '../engine';
import { fmt } from '../format';

type Upd = (fn: (s: Simulation) => void) => void;

export default function Transactions({ sim, update }: { sim: Simulation; update: Upd }) {
  const res = compute(sim);
  const N = res.N;
  return (
    <div className="stack">
      {sim.drivers.length > 0 && (
        <Card title="Referensi transaksi" sub="Rekap volume transaksi per driver, penjualan setelah take-up dan konversi per komponen revenue (skenario aktif), serta pertumbuhannya.">
          <YearTable
            firstLabel="Volume driver"
            years={res.calendar}
            totalLabel="Total periode"
            fmtNum={(n) => fmt(n)}
            rows={sim.drivers.map((d) => ({ label: `${d.name} (${d.unit})`, values: res.driverVolume[d.id] ?? [], bold: true }))}
          />
          <h4 className="mt">Pertumbuhan volume driver</h4>
          <YearTable
            firstLabel="Persentase"
            years={res.calendar}
            fmtNum={(n) => fmt(n * 100, 1) + '%'}
            rows={sim.drivers.map((d) => ({
              label: d.name,
              values: res.years.map((y) => {
                const v = res.driverVolume[d.id] ?? [];
                return y >= 2 && v[y - 1] > 0 ? v[y] / v[y - 1] - 1 : null;
              }),
            }))}
          />
          {sim.components.length > 0 && (
            <>
              <h4 className="mt">Volume terjual per komponen (setelah take-up & konversi)</h4>
              <YearTable
                firstLabel="Volume terjual"
                years={res.calendar}
                totalLabel="Total periode"
                fmtNum={(n) => fmt(n)}
                rows={sim.components.map((c) => ({ label: `${c.name} (${c.unit})`, values: res.comp[c.id]?.qty ?? [] }))}
              />
            </>
          )}
        </Card>
      )}
      <Card
        title="Proyeksi transaksi"
        sub="Driver volume dasar bisnis (mis. jumlah transaksi, kWh, pengguna). Volume tahun ke-1 diisi, tahun berikutnya tumbuh sesuai persentase per tahun. Take-up rate diatur per komponen revenue."
        actions={<Btn kind="primary" onClick={() => update((s) => s.drivers.push(newDriver()))}>+ Tambah driver</Btn>}
      >
        {sim.drivers.length === 0 && <Empty>Belum ada driver transaksi. Tambahkan minimal satu agar komponen revenue punya volume dasar.</Empty>}
      </Card>
      {sim.drivers.map((d, di) => {
        const manual = d.mode === 'manual';
        return (
        <Card
          key={d.id}
          title={d.name || 'Driver'}
          actions={
            <Btn
              kind="danger"
              onClick={() =>
                update((s) => {
                  s.drivers.splice(di, 1);
                  for (const c of s.components) if (c.driverId === d.id) c.driverId = s.drivers[0]?.id ?? null;
                })
              }
            >
              Hapus
            </Btn>
          }
        >
          <div className="grid3">
            <Field label="Nama driver">
              <TextField value={d.name} onChange={(v) => update((s) => (s.drivers[di].name = v))} />
            </Field>
            <Field label="Satuan">
              <TextField value={d.unit} onChange={(v) => update((s) => (s.drivers[di].unit = v))} width={140} />
            </Field>
            <Field label="Cara proyeksi" hint={manual ? 'Isi volume setiap tahun langsung, tanpa persentase pertumbuhan.' : 'Volume tahun ke-1 + persentase pertumbuhan per tahun.'}>
              <Select<'growth' | 'manual'>
                value={manual ? 'manual' : 'growth'}
                onChange={(v) =>
                  update((s) => {
                    const dr = s.drivers[di];
                    if (v === 'manual' && dr.mode !== 'manual') {
                      const cur = res.driverVolume[dr.id] ?? [];
                      dr.manual = Array.from({ length: MAX_YEARS }, (_, i) => Math.round(cur[i + 1] ?? 0));
                    }
                    if (v === 'growth' && dr.mode === 'manual') dr.baseVolume = dr.manual?.[0] ?? dr.baseVolume;
                    dr.mode = v;
                  })
                }
                options={[
                  { value: 'growth', label: 'Pertumbuhan % per tahun' },
                  { value: 'manual', label: 'Input manual per tahun' },
                ]}
              />
            </Field>
          </div>
          {manual ? (
            <YearRow
              label={`Volume per tahun (${d.unit})`}
              values={d.manual ?? []}
              tenor={N}
              startYear={sim.general.startYear}
              onChange={(i, v) =>
                update((s) => {
                  const dr = s.drivers[di];
                  dr.manual = dr.manual ?? new Array<number>(MAX_YEARS).fill(0);
                  dr.manual[i] = v;
                })
              }
              onFill={() => update((s) => { const dr = s.drivers[di]; dr.manual = new Array<number>(MAX_YEARS).fill(dr.manual?.[0] ?? 0); })}
            />
          ) : (
            <>
              <div className="grid3">
                <Field label={`Volume tahun ke-1 (${d.unit})`}>
                  <NumField value={d.baseVolume} onChange={(v) => update((s) => (s.drivers[di].baseVolume = v))} />
                </Field>
              </div>
              <YearRow
                label="Pertumbuhan volume per tahun"
                values={d.growth}
                tenor={N}
                startYear={sim.general.startYear}
                pct
                skipFirst
                onChange={(i, v) => update((s) => (s.drivers[di].growth[i] = v))}
                onFill={() => update((s) => s.drivers[di].growth.fill(s.drivers[di].growth[1]))}
              />
            </>
          )}
          <YearTable
            firstLabel="Hasil"
            years={res.calendar}
            fmtNum={(n) => fmt(n)}
            rows={[
              { label: `Volume (${d.unit})`, values: res.driverVolume[d.id] ?? [], bold: true },
              ...(manual
                ? [{ label: 'Pertumbuhan thd tahun sebelumnya', values: res.years.map((y) => { const v = res.driverVolume[d.id] ?? []; return y >= 2 && v[y - 1] > 0 ? v[y] / v[y - 1] - 1 : null; }), fmt: (n: number) => fmt(n * 100, 1) + '%' }]
                : []),
            ]}
          />
        </Card>
        );
      })}
    </div>
  );
}
