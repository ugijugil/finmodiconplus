import type { CapexItem, CapexKind, RateCardRole, Simulation } from '../types';
import { newCapex, CAPEX_CATEGORIES } from '../defaults';
import { Btn, Card, Empty, Field, NumField, Select, TextField, YearTable, CategoryField, Warn } from '../ui';
import { capexAmount, compute } from '../engine';
import { fmt, fmtUnit, UNIT_LABEL } from '../format';

type Upd = (fn: (s: Simulation) => void) => void;

export default function Capex({ sim, update, rateCard }: { sim: Simulation; update: Upd; rateCard: RateCardRole[] }) {
  const res = compute(sim);
  const du = sim.general.displayUnit;
  const N = res.N;
  const add = (k: CapexKind) => update((s) => s.capex.push(newCapex(k)));
  const set = (i: number, p: Partial<CapexItem>) => update((s) => Object.assign(s.capex[i], p));
  const yearOptions = Array.from({ length: N + 1 }, (_, y) => ({ value: String(y), label: y === 0 ? 'Tahun ke-0 (persiapan)' : `Tahun ke-${y}` }));
  const total = sim.capex.reduce((a, c) => a + capexAmount(c), 0);

  return (
    <div className="stack">
      <Card
        title="Referensi Capex"
        sub="Belanja modal: biaya pembangunan platform (mandays), pembelian infrastruktur, perangkat, lisensi. Amortisasi garis lurus mulai tahun setelah belanja."
        actions={
          <>
            <Btn kind="primary" onClick={() => add('manday')}>+ Mandays</Btn>
            <Btn onClick={() => add('lump')}>+ Lumpsum</Btn>
          </>
        }
      >
        {sim.capex.length === 0 ? (
          <Empty>Belum ada item capex.</Empty>
        ) : (
          <>
            {sim.capex.some((c) => c.year > N) && (
              <Warn>Ada item capex dengan tahun belanja di luar tenor ({N} tahun); item tersebut tidak dihitung. Ubah tahun belanjanya atau perpanjang tenor.</Warn>
            )}
            <div className="kpi-line">
              Total capex (sebelum pengali): <b>Rp {fmt(total)}</b> · setelah pengali what-if: <b>Rp {fmt(res.metrics.totalCapex)}</b>
            </div>
            <YearTable
              firstLabel={`Belanja & amortisasi (${UNIT_LABEL[du]})`}
              years={res.calendar}
              fromYear={0}
              totalLabel="Total periode"
              fmtNum={(n) => fmtUnit(n, du)}
              rows={[
                ...res.capexLines.map((l) => ({ label: `   ${l.name}`, values: l.spend })),
                { label: 'TOTAL BELANJA CAPEX', values: res.capexSpend, bold: true },
                ...res.capexLines.map((l) => ({ label: `   Amortisasi – ${l.name}`, values: l.amort })),
                { label: 'TOTAL BEBAN AMORTISASI', values: res.amort, bold: true },
              ]}
            />
          </>
        )}
      </Card>

      <datalist id="capex-cats">
        {CAPEX_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {sim.capex.map((it, i) => (
        <Card
          key={it.id}
          className="item"
          title={it.name || 'Item capex'}
          sub={it.kind === 'manday' ? 'Mandays: orang × mandays × (rate + alat kerja)' : 'Lumpsum'}
          actions={
            <>
              <span className="base">Total: <b>Rp {fmt(capexAmount(it))}</b></span>
              <Btn kind="ghost" onClick={() => update((s) => s.capex.splice(i + 1, 0, { ...structuredClone(s.capex[i]), id: newCapex().id, name: `${s.capex[i].name} (salinan)` }))}>Duplikat</Btn>
              <Btn kind="danger" onClick={() => update((s) => s.capex.splice(i, 1))}>Hapus</Btn>
            </>
          }
        >
          <div className="grid4">
            <Field label="Nama item">
              <TextField value={it.name} onChange={(v) => set(i, { name: v })} />
            </Field>
            <Field label="Kategori">
              <CategoryField value={it.category} options={[...CAPEX_CATEGORIES, ...sim.capex.map((x) => x.category)]} onChange={(v) => set(i, { category: v })} />
            </Field>
            {it.kind === 'manday' ? (
              <>
                <Field label="Peran (rate card)">
                  <Select
                    value={it.roleCode ?? ''}
                    onChange={(code) =>
                      update((s) => {
                        const role = rateCard.find((r) => r.code === code);
                        s.capex[i].roleCode = code || undefined;
                        if (role) s.capex[i].rate = role.daily;
                      })
                    }
                    options={[{ value: '', label: '— manual —' }, ...rateCard.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))]}
                  />
                </Field>
                <Field label="Jumlah orang">
                  <NumField value={it.qty} onChange={(v) => set(i, { qty: v })} />
                </Field>
                <Field label="Mandays per orang">
                  <NumField value={it.mandays} onChange={(v) => set(i, { mandays: v })} />
                </Field>
                <Field label="Rate per mandays (Rp)">
                  <NumField value={it.rate} prefix="Rp" onChange={(v) => set(i, { rate: v })} />
                </Field>
                <Field label="Alat kerja per mandays (Rp)">
                  <NumField value={it.toolPerDay} prefix="Rp" onChange={(v) => set(i, { toolPerDay: v })} />
                </Field>
              </>
            ) : (
              <Field label="Nilai (Rp)">
                <NumField value={it.amount} prefix="Rp" onChange={(v) => set(i, { amount: v })} />
              </Field>
            )}
            <Field label="Tahun belanja">
              <Select value={String(Math.min(it.year, N))} onChange={(v) => set(i, { year: Number(v) })} options={yearOptions} />
            </Field>
            <Field label="Umur amortisasi (tahun)" hint="0 = sama dengan tenor model.">
              <NumField value={it.lifeYears ?? 0} onChange={(v) => set(i, { lifeYears: v >= 1 ? Math.round(v) : null })} />
            </Field>
          </div>
        </Card>
      ))}
    </div>
  );
}
