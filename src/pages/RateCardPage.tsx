import type { RateCardRole } from '../types';
import { DEFAULT_RATE_CARD } from '../rateCard';
import { Btn, Card, NumField, TextField } from '../ui';

export default function RateCardPage({ rateCard, setRateCard }: { rateCard: RateCardRole[]; setRateCard: (r: RateCardRole[]) => void }) {
  const upd = (i: number, p: Partial<RateCardRole>) => setRateCard(rateCard.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <Card
      title="Master tarif tenaga kerja (rate card)"
      sub="Referensi harga satuan per mandays yang dipakai di Opex manpower dan Capex mandays. Berlaku untuk semua simulasi; mengubah tarif di sini tidak mengubah item yang sudah dipilih (pilih ulang perannya untuk menerapkan tarif baru)."
      actions={
        <>
          <Btn onClick={() => setRateCard([...rateCard, { code: 'BARU', name: 'Peran baru', daily: 0, monthly: 0 }])}>+ Tambah peran</Btn>
          <Btn kind="ghost" onClick={() => confirm('Kembalikan master tarif ke data bawaan?') && setRateCard(structuredClone(DEFAULT_RATE_CARD))}>Reset ke bawaan</Btn>
        </>
      }
    >
      <div className="tablewrap">
        <table className="stable">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Spesifikasi</th>
              <th>Harga per mandays (Rp)</th>
              <th>Harga per bulan (Rp)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rateCard.map((r, i) => (
              <tr key={i}>
                <td><TextField value={r.code} width={110} onChange={(v) => upd(i, { code: v })} /></td>
                <td><TextField value={r.name} width={300} onChange={(v) => upd(i, { name: v })} /></td>
                <td><NumField value={r.daily} prefix="Rp" width={170} onChange={(v) => upd(i, { daily: v })} /></td>
                <td><NumField value={r.monthly} prefix="Rp" width={170} onChange={(v) => upd(i, { monthly: v })} /></td>
                <td><Btn kind="ghost" onClick={() => setRateCard(rateCard.filter((_, k) => k !== i))}>Hapus</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
