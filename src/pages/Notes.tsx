import type { Note, Simulation } from '../types';
import { uid } from '../defaults';
import { Btn, Card, Empty, Select, TextField } from '../ui';

type Upd = (fn: (s: Simulation) => void) => void;
const STATUS = (['DATA', 'ANALIS', 'KEPUTUSAN', 'TEMPLATE'] as const).map((v) => ({ value: v, label: v }));

export default function Notes({ sim, update }: { sim: Simulation; update: Upd }) {
  return (
    <Card
      title="Catatan asumsi"
      sub="Dokumentasikan sumber tiap asumsi. DATA = sumber terdokumentasi · ANALIS = asumsi analis, belum divalidasi · KEPUTUSAN = ditetapkan pengambil keputusan · TEMPLATE = dari template baku. Ikut diekspor ke sheet Catatan."
      actions={<Btn kind="primary" onClick={() => update((s) => s.notes.push({ id: uid('nt'), param: '', value: '', status: 'ANALIS', source: '' } as Note))}>+ Tambah catatan</Btn>}
    >
      {sim.notes.length === 0 ? (
        <Empty>Belum ada catatan.</Empty>
      ) : (
        <div className="tablewrap">
          <table className="stable">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Nilai</th>
                <th>Status</th>
                <th>Sumber / catatan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sim.notes.map((n, i) => (
                <tr key={n.id}>
                  <td><TextField value={n.param} onChange={(v) => update((s) => (s.notes[i].param = v))} /></td>
                  <td><TextField value={n.value} onChange={(v) => update((s) => (s.notes[i].value = v))} /></td>
                  <td><Select value={n.status} onChange={(v) => update((s) => (s.notes[i].status = v))} options={STATUS} width={130} /></td>
                  <td><TextField value={n.source} onChange={(v) => update((s) => (s.notes[i].source = v))} width={360} /></td>
                  <td><Btn kind="ghost" onClick={() => update((s) => s.notes.splice(i, 1))}>Hapus</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
