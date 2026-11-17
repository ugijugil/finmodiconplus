import type { Simulation, DisplayUnit } from '../types';
import { Card, Field, NumField, PctField, Select, TextField } from '../ui';
import { fmtPct } from '../format';

type Upd = (fn: (s: Simulation) => void) => void;

export default function General({ sim, update }: { sim: Simulation; update: Upd }) {
  const g = sim.general;
  return (
    <div className="stack">
      <Card title="Identitas simulasi">
        <div className="grid2">
          <Field label="Nama simulasi">
            <TextField value={sim.name} onChange={(v) => update((s) => (s.name = v))} />
          </Field>
          <Field label="Satuan tampilan angka hasil" hint="Hanya memengaruhi tampilan di aplikasi; ekspor xlsx selalu dalam Rupiah penuh.">
            <Select<DisplayUnit>
              value={g.displayUnit}
              onChange={(v) => update((s) => (s.general.displayUnit = v))}
              options={[
                { value: 'Rp', label: 'Rupiah' },
                { value: 'ribu', label: 'Ribuan' },
                { value: 'juta', label: 'Jutaan' },
                { value: 'miliar', label: 'Miliar' },
              ]}
            />
          </Field>
        </div>
        <Field label="Deskripsi / tujuan kajian">
          <textarea className="txt area" value={sim.description} onChange={(e) => update((s) => (s.description = e.target.value))} rows={3} />
        </Field>
      </Card>

      <Card title="Horizon & biaya modal" sub="Tahun ke-0 adalah masa persiapan/pembangunan; operasional dimulai tahun ke-1.">
        <div className="grid3">
          <Field label="Tahun kalender tahun ke-1">
            <NumField plain value={g.startYear} onChange={(v) => update((s) => (s.general.startYear = Math.round(v)))} />
          </Field>
          <Field label="Tenor model (tahun)" hint="Maksimum 10 tahun.">
            <NumField value={g.tenor} onChange={(v) => update((s) => (s.general.tenor = Math.max(1, Math.min(10, Math.round(v)))))} />
          </Field>
          <Field label="Inflasi per tahun" hint="Dipakai sebagai eskalasi default biaya.">
            <PctField value={g.inflation} onChange={(v) => update((s) => (s.general.inflation = v))} />
          </Field>
          <Field label="Cost of Fund (CoF)">
            <PctField value={g.cof} onChange={(v) => update((s) => (s.general.cof = v))} />
          </Field>
          <Field label="Risk premium">
            <PctField value={g.riskPremium} onChange={(v) => update((s) => (s.general.riskPremium = v))} />
          </Field>
          <Field label="Discount rate (CoF + risk premium)" hint="Dipakai untuk menghitung NPV.">
            <div className="readonly">{fmtPct(g.cof + g.riskPremium, 2)}</div>
          </Field>
          <Field label="WACC (batas kelayakan IRR)" hint="Layak bila NPV > 0, IRR > WACC, dan PI > 1; selain itu ASK BOD.">
            <PctField value={g.wacc} onChange={(v) => update((s) => (s.general.wacc = v))} />
          </Field>
          <Field label="Pajak badan">
            <PctField value={g.taxRate} onChange={(v) => update((s) => (s.general.taxRate = v))} />
          </Field>
          <Field label="Nilai sisa (salvage) dari total capex" hint="Diterima sebagai arus kas masuk di tahun terakhir; mengurangi basis amortisasi.">
            <PctField value={g.salvagePct} onChange={(v) => update((s) => (s.general.salvagePct = v))} />
          </Field>
          <Field label="Asuransi aset per tahun" hint="% dari capex terpasang, mulai tahun setelah belanja.">
            <PctField value={g.insurancePct} onChange={(v) => update((s) => (s.general.insurancePct = v))} />
          </Field>
        </div>
      </Card>

      <Card title="Pendanaan (opsional)" sub="Default 0% = pendanaan penuh ekuitas. Utang hanya membiayai capex tahun ke-0, angsuran pokok sama rata mulai tahun ke-1.">
        <div className="grid3">
          <Field label="Porsi utang dari capex tahun ke-0">
            <PctField value={sim.funding.debtPct} onChange={(v) => update((s) => (s.funding.debtPct = Math.max(0, Math.min(1, v))))} />
          </Field>
          <Field label="Bunga pinjaman per tahun">
            <PctField value={sim.funding.interestRate} onChange={(v) => update((s) => (s.funding.interestRate = v))} />
          </Field>
          <Field label="Tenor angsuran (tahun)">
            <NumField value={sim.funding.repaymentYears} onChange={(v) => update((s) => (s.funding.repaymentYears = Math.max(1, Math.round(v))))} />
          </Field>
        </div>
      </Card>

      <Card title="Pengali what-if" sub="Uji cepat tanpa mengubah asumsi dasar. 1,00 = tidak berubah. Ikut terbawa ke file xlsx (Asumsi!D22:D25).">
        <div className="grid4">
          {(
            [
              ['price', 'Harga jual'],
              ['volume', 'Volume penjualan'],
              ['opex', 'Opex'],
              ['capex', 'Capex'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <NumField value={sim.flex[k]} decimals={2} suffix="×" onChange={(v) => update((s) => (s.flex[k] = Math.max(0, v)))} />
            </Field>
          ))}
        </div>
      </Card>
    </div>
  );
}
