import type { OpexItem, OpexKind, RateCardRole, Simulation } from '../types';
import { newOpex, OPEX_CATEGORIES, standardOverhead } from '../defaults';
import { Btn, Card, Empty, Field, NumField, PctField, Select, TextField, YearTable, CategoryField, Warn } from '../ui';
import { compute, opexBaseAnnual } from '../engine';
import { fmt, fmtUnit, UNIT_LABEL } from '../format';

type Upd = (fn: (s: Simulation) => void) => void;

const KIND_LABEL: Record<OpexKind, string> = {
  manpower: 'Manpower (rate card × mandays)',
  fixed: 'Biaya tetap (sewa, listrik, server, jaringan, dll.)',
  pctRevenue: '% dari revenue (overhead, pemeliharaan)',
  perUnit: 'Per satuan penjualan (biaya langsung)',
  perDriver: 'Per transaksi / driver (biaya variabel)',
};

export default function Opex({ sim, update, rateCard }: { sim: Simulation; update: Upd; rateCard: RateCardRole[] }) {
  const res = compute(sim);
  const du = sim.general.displayUnit;
  const cats = Array.from(new Set(sim.opex.map((o) => o.category)));
  const add = (k: OpexKind) => update((s) => s.opex.push(newOpex(k, { componentId: k === 'perUnit' ? s.components[0]?.id ?? null : null, driverId: k === 'perDriver' ? s.drivers[0]?.id ?? null : null })));

  const set = (i: number, p: Partial<OpexItem>) => update((s) => Object.assign(s.opex[i], p));

  return (
    <div className="stack">
      <Card
        title="Referensi Opex"
        sub="Biaya operasional: manpower, sewa bangunan, listrik, infrastruktur server & jaringan, overhead, dan biaya langsung per penjualan."
        actions={
          <>
            <Btn kind="primary" onClick={() => add('manpower')}>+ Manpower</Btn>
            <Btn onClick={() => add('fixed')}>+ Biaya tetap</Btn>
            <Btn onClick={() => add('pctRevenue')}>+ % Revenue</Btn>
            <Btn onClick={() => add('perUnit')}>+ Per satuan</Btn>
            <Btn onClick={() => add('perDriver')} title="Biaya = tarif × jumlah transaksi (driver) tiap tahun">+ Per transaksi</Btn>
            <Btn onClick={() => update((s) => s.opex.push(...standardOverhead(s.opex)))} title="Menambah pemeliharaan, kepegawaian, administrasi umum, dan pemasaran sebagai % revenue (nilai standar template KKF)">+ Overhead standar</Btn>
          </>
        }
      >
        {!sim.opex.some((o) => o.kind === 'pctRevenue') && sim.opex.length > 0 && (
          <Warn>Belum ada beban overhead (kepegawaian, administrasi umum, pemasaran) maupun pemeliharaan. Klik “+ Overhead standar” bila perlu.</Warn>
        )}
        {sim.opex.length === 0 ? (
          <Empty>Belum ada item opex.</Empty>
        ) : (
          <YearTable
            firstLabel={`Ringkasan per kategori (${UNIT_LABEL[du]})`}
            years={res.calendar}
            totalLabel="Total periode"
            fmtNum={(n) => fmtUnit(n, du)}
            rows={[
              ...cats.map((c) => ({
                label: c,
                values: res.years.map((y) => res.opexLines.filter((l) => l.category === c).reduce((a, l) => a + l.values[y], 0)),
              })),
              { label: 'Asuransi aset (otomatis, % capex)', values: res.insurance },
              { label: 'TOTAL OPEX (tunai)', values: res.opexTotal, bold: true },
              { label: 'Beban amortisasi (dari Capex)', values: res.amort },
              { label: 'TOTAL BEBAN OPERASIONAL (opex + amortisasi)', values: res.years.map((y) => res.opexTotal[y] + res.amort[y]), bold: true },
            ]}
          />
        )}
      </Card>

      <datalist id="opex-cats">
        {OPEX_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {sim.opex.map((it, i) => (
        <Card
          key={it.id}
          className="item"
          title={it.name || 'Item opex'}
          sub={KIND_LABEL[it.kind]}
          actions={
            <>
              {(it.kind === 'manpower' || it.kind === 'fixed') && <span className="base">Biaya dasar/tahun: <b>Rp {fmt(opexBaseAnnual(it))}</b></span>}
              <Btn kind="ghost" onClick={() => update((s) => s.opex.splice(i + 1, 0, { ...structuredClone(s.opex[i]), id: newOpex().id, name: `${s.opex[i].name} (salinan)` }))}>Duplikat</Btn>
              <Btn kind="danger" onClick={() => update((s) => s.opex.splice(i, 1))}>Hapus</Btn>
            </>
          }
        >
          <div className="grid4">
            <Field label="Nama item">
              <TextField value={it.name} onChange={(v) => set(i, { name: v })} />
            </Field>
            <Field label="Kategori">
              <CategoryField value={it.category} options={[...OPEX_CATEGORIES, ...sim.opex.map((x) => x.category)]} onChange={(v) => set(i, { category: v })} />
            </Field>

            {it.kind === 'manpower' && (
              <>
                <Field label="Peran (rate card)">
                  <Select
                    value={it.roleCode ?? ''}
                    onChange={(code) =>
                      update((s) => {
                        const role = rateCard.find((r) => r.code === code);
                        s.opex[i].roleCode = code || undefined;
                        if (role) s.opex[i].unitCost = role.daily;
                      })
                    }
                    options={[{ value: '', label: '— manual —' }, ...rateCard.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))]}
                  />
                </Field>
                <Field label="Jumlah orang">
                  <NumField value={it.qty} onChange={(v) => set(i, { qty: v })} />
                </Field>
                <Field label="Rate per mandays (Rp)">
                  <NumField value={it.unitCost} prefix="Rp" onChange={(v) => set(i, { unitCost: v })} />
                </Field>
                <Field label="Mandays per bulan">
                  <NumField value={it.daysPerMonth} onChange={(v) => set(i, { daysPerMonth: v })} />
                </Field>
                <Field label="Alat kerja & komunikasi / orang / bulan">
                  <NumField value={it.toolPerMonth} prefix="Rp" onChange={(v) => set(i, { toolPerMonth: v })} />
                </Field>
                <Field label="Margin vendor">
                  <PctField value={it.marginPct} onChange={(v) => set(i, { marginPct: v })} />
                </Field>
              </>
            )}

            {it.kind === 'fixed' && (
              <>
                <Field label="Jumlah unit">
                  <NumField value={it.qty} onChange={(v) => set(i, { qty: v })} />
                </Field>
                <Field label="Harga per unit per periode (Rp)">
                  <NumField value={it.unitCost} prefix="Rp" onChange={(v) => set(i, { unitCost: v })} />
                </Field>
                <Field label="Periode harga">
                  <Select value={it.period} onChange={(v) => set(i, { period: v })} options={[{ value: 'month', label: 'per bulan' }, { value: 'year', label: 'per tahun' }]} />
                </Field>
              </>
            )}

            {it.kind === 'pctRevenue' && (
              <Field label="Persentase dari total revenue" hint="Dihitung dari revenue tahun berjalan.">
                <PctField value={it.pct} onChange={(v) => set(i, { pct: v })} />
              </Field>
            )}

            {it.kind === 'perUnit' && (
              <>
                <Field label="Komponen revenue terkait">
                  <Select
                    value={it.componentId ?? ''}
                    onChange={(v) => set(i, { componentId: v || null })}
                    options={[{ value: '', label: '— pilih —' }, ...sim.components.map((c) => ({ value: c.id, label: `${c.name} (${c.unit})` }))]}
                  />
                </Field>
                <Field label="Biaya per satuan terjual (Rp)">
                  <NumField value={it.unitCost} prefix="Rp" onChange={(v) => set(i, { unitCost: v })} />
                </Field>
              </>
            )}

            {it.kind === 'perDriver' && (
              <>
                <Field label="Driver transaksi" hint="Volume driver pada Proyeksi Transaksi (sebelum take-up). Ikut pengali volume what-if & skenario.">
                  <Select
                    value={it.driverId ?? ''}
                    onChange={(v) => set(i, { driverId: v || null })}
                    options={[{ value: '', label: '— pilih —' }, ...sim.drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.unit})` }))]}
                  />
                </Field>
                <Field label="Biaya per transaksi (Rp)">
                  <NumField value={it.unitCost} prefix="Rp" onChange={(v) => set(i, { unitCost: v })} />
                </Field>
              </>
            )}

            {it.kind !== 'pctRevenue' && (
              <>
                <Field label="Eskalasi tahunan">
                  <Select
                    value={it.escMode}
                    onChange={(v) => set(i, { escMode: v })}
                    options={[{ value: 'inflation', label: `Ikut inflasi (${fmt(sim.general.inflation * 100, 1)}%)` }, { value: 'custom', label: 'Persentase khusus' }, { value: 'none', label: 'Tanpa eskalasi' }]}
                  />
                </Field>
                {it.escMode === 'custom' && (
                  <Field label="Eskalasi khusus">
                    <PctField value={it.esc} onChange={(v) => set(i, { esc: v })} />
                  </Field>
                )}
              </>
            )}
            <Field label="Mulai tahun ke-">
              <NumField value={it.startYear} onChange={(v) => set(i, { startYear: Math.max(1, Math.round(v)) })} />
            </Field>
            <Field label="Selesai tahun ke-" hint="Kosongkan (0) = sampai akhir tenor.">
              <NumField value={it.endYear ?? 0} onChange={(v) => set(i, { endYear: v >= 1 ? Math.round(v) : null })} />
            </Field>
          </div>
        </Card>
      ))}
    </div>
  );
}
