import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/arc/button/button';
import { fmt, parseNum } from './format';
import { MAX_YEARS } from './types';

export function NumField(props: {
  value: number;
  onChange: (n: number) => void;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  width?: number | string;
  disabled?: boolean;
  title?: string;
  plain?: boolean; // tanpa pemisah ribuan (mis. tahun)
}) {
  const { value, onChange, decimals = 0, suffix, prefix, width, disabled, title, plain } = props;
  const [text, setText] = useState<string | null>(null);
  const maxDec = Math.max(decimals, 6);
  const shown = text ?? new Intl.NumberFormat('id-ID', { useGrouping: !plain, minimumFractionDigits: 0, maximumFractionDigits: Math.max(decimals, Number.isInteger(value) ? 0 : maxDec) }).format(value);
  return (
    <span className="numwrap" style={{ width }} title={title}>
      {prefix && <span className="affix">{prefix}</span>}
      <input
        className="num"
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onFocus={(e) => {
          setText(String(value).replace('.', ','));
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          if (n !== null) onChange(n);
        }}
        onBlur={() => setText(null)}
      />
      {suffix && <span className="affix">{suffix}</span>}
    </span>
  );
}

/** Nilai disimpan sebagai pecahan (0.1 = 10%), ditampilkan dalam persen. */
export function PctField(props: { value: number; onChange: (n: number) => void; decimals?: number; width?: number | string; disabled?: boolean }) {
  const r = (v: number) => Math.round(v * 1e8) / 1e8;
  return <NumField value={r(props.value * 100)} onChange={(n) => props.onChange(n / 100)} suffix="%" decimals={props.decimals ?? 2} width={props.width} disabled={props.disabled} />;
}

export function TextField(props: { value: string; onChange: (s: string) => void; placeholder?: string; width?: number | string; list?: string }) {
  return <input className="txt" style={{ width: props.width }} value={props.value} placeholder={props.placeholder} list={props.list} onChange={(e) => props.onChange(e.target.value)} />;
}

export function Select<T extends string>(props: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; width?: number | string }) {
  return (
    <select className="sel" style={{ width: props.width }} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="flabel">{props.label}</span>
      {props.children}
      {props.hint && <span className="hint">{props.hint}</span>}
    </label>
  );
}

export function Card(props: { title?: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="card-h">
          <div>
            {props.title && <h3>{props.title}</h3>}
            {props.sub && <p className="sub">{props.sub}</p>}
          </div>
          {props.actions && <div className="actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Btn(props: { onClick?: () => void; children: ReactNode; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; title?: string }) {
  return (
    <Button variant={props.kind ?? 'secondary'} size="sm" onClick={props.onClick} disabled={props.disabled} title={props.title} type="button">
      {props.children}
    </Button>
  );
}

/** Baris input per tahun (tahun ke-1..tenor). */
export function YearRow(props: {
  label: string;
  values: number[];
  tenor: number;
  startYear: number;
  onChange: (i: number, v: number) => void;
  pct?: boolean;
  decimals?: number;
  skipFirst?: boolean;
  onFill?: () => void;
}) {
  const cols = Math.min(props.tenor, MAX_YEARS);
  return (
    <div className="yearrow">
      <div className="yl">
        {props.label}
        {props.onFill && (
          <button type="button" className="mini" onClick={props.onFill} title="Salin nilai tahun pertama ke semua tahun">
            samakan
          </button>
        )}
      </div>
      <div className="ycells" style={{ gridTemplateColumns: `repeat(${cols}, minmax(86px, 1fr))` }}>
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="ycell">
            <span className="yh">
              Thn {i + 1} <em>{props.startYear + i}</em>
            </span>
            {props.skipFirst && i === 0 ? (
              <span className="yna">dasar</span>
            ) : props.pct ? (
              <PctField value={props.values[i] ?? 0} onChange={(v) => props.onChange(i, v)} decimals={props.decimals ?? 1} />
            ) : (
              <NumField value={props.values[i] ?? 0} onChange={(v) => props.onChange(i, v)} decimals={props.decimals ?? 0} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>;
}

export function Badge(props: { tone: 'ok' | 'warn' | 'muted' | 'info'; children: ReactNode }) {
  return <span className={`badge ${props.tone}`}>{props.children}</span>;
}

export { fmt };

/** Tabel ringkas per tahun untuk pratinjau hasil. */
export function YearTable(props: {
  rows: { label: string; values: (number | null)[]; bold?: boolean; fmt?: (n: number) => string }[];
  years: number[]; // tahun kalender
  fromYear?: number; // indeks tahun pertama yang ditampilkan (0 atau 1)
  fmtNum: (n: number) => string;
  firstLabel?: string;
  totalLabel?: string; // bila diisi, tambahkan kolom total di akhir periode
}) {
  const from = props.fromYear ?? 1;
  const idx = props.years.map((_, i) => i).filter((i) => i >= from);
  return (
    <div className="tablewrap">
      <table className="ytable">
        <thead>
          <tr>
            <th>{props.firstLabel ?? ''}</th>
            {idx.map((i) => (
              <th key={i}>
                {i === 0 ? 'Thn 0' : `Thn ${i}`}
                <em>{props.years[i]}</em>
              </th>
            ))}
            {props.totalLabel && <th className="totcol">{props.totalLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.label} className={r.bold ? 'b' : ''}>
              <td>{r.label}</td>
              {idx.map((i) => (
                <td key={i} className={(r.values[i] ?? 0) < 0 ? 'neg' : ''}>
                  {r.values[i] === null || r.values[i] === undefined ? '' : (r.fmt ?? props.fmtNum)(r.values[i] as number)}
                </td>
              ))}
              {props.totalLabel && (() => {
                const t = idx.reduce((a, i) => a + (r.values[i] ?? 0), 0);
                return <td className={`totcol b ${t < 0 ? 'neg' : ''}`}>{(r.fmt ?? props.fmtNum)(t)}</td>;
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pilih kategori dari daftar (default + yang sudah dipakai) atau ketik kategori baru. */
export function CategoryField(props: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(false);
  const opts = Array.from(new Set([...props.options, ...(props.value ? [props.value] : [])]));
  if (custom) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="txt"
          autoFocus
          placeholder="Nama kategori baru"
          defaultValue=""
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) props.onChange(v);
            setCustom(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setCustom(false);
          }}
        />
      </div>
    );
  }
  return (
    <select className="sel" value={props.value} onChange={(e) => (e.target.value === '__new__' ? setCustom(true) : props.onChange(e.target.value))}>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__new__">+ Kategori baru…</option>
    </select>
  );
}
