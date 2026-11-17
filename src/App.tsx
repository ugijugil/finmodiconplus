import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RateCardRole, Simulation } from './types';
import { blankSimulation, sporaSimulation, uid } from './defaults';
import { compute } from './engine';
import { download, loadRateCard, loadSims, safeName, saveRateCard, saveSims } from './storage';
import { exportXlsxBuffer } from './exportXlsx';
import { fmtPct, fmtUnit, UNIT_LABEL } from './format';
import { Badge, Btn } from './ui';
import { Tabs, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import General from './pages/General';
import Transactions from './pages/Transactions';
import Revenue from './pages/Revenue';
import Opex from './pages/Opex';
import Capex from './pages/Capex';
import Results from './pages/Results';
import Notes from './pages/Notes';
import RateCardPage from './pages/RateCardPage';

type Tab = 'umum' | 'transaksi' | 'revenue' | 'opex' | 'capex' | 'catatan' | 'hasil';
const TABS: { id: Tab; label: string; step: string }[] = [
  { id: 'umum', label: 'Asumsi Umum', step: '1' },
  { id: 'transaksi', label: 'Proyeksi Transaksi', step: '2' },
  { id: 'revenue', label: 'Revenue & Harga', step: '3' },
  { id: 'opex', label: 'Opex', step: '4' },
  { id: 'capex', label: 'Capex', step: '5' },
  { id: 'hasil', label: 'Hasil & Sensitivitas', step: '▶' },
  { id: 'catatan', label: 'Catatan', step: '✎' },
];

export default function App() {
  const [sims, setSims] = useState<Simulation[]>(() => loadSims());
  const [rateCard, setRateCardState] = useState<RateCardRole[]>(() => loadRateCard());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [view, setView] = useState<'sims' | 'rates'>('sims');
  const [tab, setTab] = useState<Tab>('umum');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => saveSims(sims), 300);
    return () => clearTimeout(t);
  }, [sims]);
  const setRateCard = (r: RateCardRole[]) => {
    setRateCardState(r);
    saveRateCard(r);
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  const current = sims.find((s) => s.id === currentId) ?? null;

  const update = useCallback(
    (fn: (s: Simulation) => void) => {
      setSims((all) =>
        all.map((s) => {
          if (s.id !== currentId) return s;
          const d = structuredClone(s);
          fn(d);
          d.updatedAt = new Date().toISOString();
          return d;
        }),
      );
    },
    [currentId],
  );

  const open = (id: string) => {
    setCurrentId(id);
    setTab('umum');
    setView('sims');
    window.scrollTo(0, 0);
  };
  const create = (kind: 'blank' | 'example') => {
    const s = kind === 'blank' ? blankSimulation() : sporaSimulation();
    setSims((a) => [s, ...a]);
    open(s.id);
  };
  const duplicate = (s: Simulation) => {
    const d = structuredClone(s);
    d.id = uid('sim');
    d.name = `${s.name} (salinan)`;
    d.createdAt = d.updatedAt = new Date().toISOString();
    setSims((a) => [d, ...a]);
  };
  const remove = (s: Simulation) => {
    if (!confirm(`Hapus simulasi "${s.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setSims((a) => a.filter((x) => x.id !== s.id));
    if (currentId === s.id) setCurrentId(null);
  };

  const exportXlsx = async (s: Simulation) => {
    setBusy(true);
    try {
      const buf = await exportXlsxBuffer(s, rateCard);
      download(`Kajian_Finansial_${safeName(s.name)}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      flash('File xlsx berhasil dibuat.');
    } catch (e) {
      console.error(e);
      flash('Gagal membuat xlsx: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const exportJson = (s: Simulation) => download(`Simulasi_${safeName(s.name)}.json`, JSON.stringify(s, null, 2), 'application/json');
  const importJson = async (file: File) => {
    try {
      const obj = JSON.parse(await file.text()) as Simulation;
      if (!obj || !obj.general || !Array.isArray(obj.drivers) || !Array.isArray(obj.components) || !Array.isArray(obj.opex) || !Array.isArray(obj.capex) || !Array.isArray(obj.scenarios)) throw new Error('format tidak dikenali');
      obj.id = uid('sim');
      obj.notes ||= [];
      obj.flex ||= { price: 1, volume: 1, opex: 1, capex: 1 };
      compute(obj); // validasi: pastikan model bisa dihitung
      setSims((a) => [obj, ...a]);
      flash(`Simulasi "${obj.name}" diimpor.`);
    } catch (e) {
      flash('Impor gagal: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const nav = (
    <header className="top">
      <div className="brand" onClick={() => { setCurrentId(null); setView('sims'); }}>
        <span className="logo">KF</span> Kajian Finansial
      </div>
      <Tabs value={view} onValueChange={(v) => { setView(v as 'sims' | 'rates'); if (v === 'rates') setCurrentId(null); }}>
        <TabsList aria-label="Navigasi">
          <TabsTrigger value="sims">Simulasi</TabsTrigger>
          <TabsTrigger value="rates">Master Tarif</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>
  );

  return (
    <div className="app">
      {nav}
      <main>
        {view === 'rates' ? (
          <RateCardPage rateCard={rateCard} setRateCard={setRateCard} />
        ) : current ? (
          <Editor sim={current} update={update} rateCard={rateCard} tab={tab} setTab={setTab} onExport={() => exportXlsx(current)} onJson={() => exportJson(current)} busy={busy} onBack={() => setCurrentId(null)} />
        ) : (
          <Home sims={sims} onOpen={open} onCreate={create} onDuplicate={duplicate} onDelete={remove} onExport={exportXlsx} onImport={() => fileRef.current?.click()} />
        )}
      </main>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Home(props: {
  sims: Simulation[];
  onOpen: (id: string) => void;
  onCreate: (k: 'blank' | 'example') => void;
  onDuplicate: (s: Simulation) => void;
  onDelete: (s: Simulation) => void;
  onExport: (s: Simulation) => void;
  onImport: () => void;
}) {
  const rows = useMemo(() => props.sims.map((s) => ({ s, m: compute(s).metrics })), [props.sims]);
  return (
    <div className="stack">
      <div className="hero">
        <div>
          <h1>Simulasi kajian finansial</h1>
          <p>Susun asumsi opex, capex, proyeksi transaksi, dan harga revenue; lihat NPV/IRR/payback langsung; lalu ekspor lengkap ke xlsx berformula.</p>
        </div>
        <div className="actions">
          <Btn kind="primary" onClick={() => props.onCreate('blank')}>+ Simulasi baru</Btn>
          <Btn onClick={() => props.onCreate('example')}>Dari contoh terisi</Btn>
          <Btn kind="ghost" onClick={props.onImport}>Impor JSON</Btn>
        </div>
      </div>
      <div className="cards">
        {rows.map(({ s, m }) => (
          <div className="simcard" key={s.id}>
            <div className="sc-top" onClick={() => props.onOpen(s.id)}>
              <h3>{s.name}</h3>
              <Badge tone={m.ok ? 'ok' : 'warn'}>{m.result}</Badge>
            </div>
            <p className="sc-desc" onClick={() => props.onOpen(s.id)}>{s.description || 'Tanpa deskripsi.'}</p>
            <dl className="sc-kpi" onClick={() => props.onOpen(s.id)}>
              <div><dt>NPV ({UNIT_LABEL[s.general.displayUnit]})</dt><dd className={m.npv < 0 ? 'neg' : ''}>{fmtUnit(m.npv, s.general.displayUnit)}</dd></div>
              <div><dt>IRR</dt><dd>{fmtPct(m.irr, 1)}</dd></div>
              <div><dt>Payback</dt><dd>{m.payback === null ? '> tenor' : `Thn ${m.payback}`}</dd></div>
            </dl>
            <div className="sc-foot">
              <span>Diubah {new Date(s.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="sc-actions">
                <Btn kind="primary" onClick={() => props.onOpen(s.id)}>Buka</Btn>
                <Btn onClick={() => props.onExport(s)}>Ekspor xlsx</Btn>
                <Btn kind="ghost" onClick={() => props.onDuplicate(s)}>Duplikat</Btn>
                <Btn kind="ghost" onClick={() => props.onDelete(s)}>Hapus</Btn>
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="note">Data tersimpan di browser ini saja. Gunakan “Impor/Ekspor JSON” untuk memindahkan atau membagikan simulasi ke rekan.</p>
    </div>
  );
}

function Editor(props: { sim: Simulation; update: (fn: (s: Simulation) => void) => void; rateCard: RateCardRole[]; tab: Tab; setTab: (t: Tab) => void; onExport: () => void; onJson: () => void; busy: boolean; onBack: () => void }) {
  const { sim, update, rateCard, tab, setTab } = props;
  const m = useMemo(() => compute(sim).metrics, [sim]);
  return (
    <div className="stack">
      <div className="ed-head">
        <div className="ed-title">
          <button className="link" onClick={props.onBack}>← Semua simulasi</button>
          <h2>{sim.name}</h2>
        </div>
        <div className="ed-mini">
          <span>NPV <b className={m.npv < 0 ? 'neg' : ''}>{fmtUnit(m.npv, sim.general.displayUnit)}</b> <em>{UNIT_LABEL[sim.general.displayUnit]}</em></span>
          <span>IRR <b>{fmtPct(m.irr, 1)}</b></span>
          <Badge tone={m.ok ? 'ok' : 'warn'}>{m.result}</Badge>
        </div>
        <div className="actions">
          <Btn kind="ghost" onClick={props.onJson}>Ekspor JSON</Btn>
          <Btn kind="primary" onClick={props.onExport} disabled={props.busy}>{props.busy ? 'Membuat…' : 'Ekspor xlsx'}</Btn>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label="Langkah kajian">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{/^\d/.test(t.step) ? `${t.step}. ` : `${t.step} `}{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'umum' && <General sim={sim} update={update} />}
      {tab === 'transaksi' && <Transactions sim={sim} update={update} />}
      {tab === 'revenue' && <Revenue sim={sim} update={update} />}
      {tab === 'opex' && <Opex sim={sim} update={update} rateCard={rateCard} />}
      {tab === 'capex' && <Capex sim={sim} update={update} rateCard={rateCard} />}
      {tab === 'hasil' && <Results sim={sim} />}
      {tab === 'catatan' && <Notes sim={sim} update={update} />}
    </div>
  );
}
