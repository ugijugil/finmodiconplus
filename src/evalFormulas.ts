import type ExcelJS from 'exceljs';
import { irr } from './engine';

/**
 * Evaluator rumus mini: hanya fungsi yang dipakai exporter
 * (SUM, IF, AND, MIN, MAX, INDEX, MATCH, SUMIF, VLOOKUP, IRR, IFERROR, ISNUMBER).
 * Dipakai untuk menanam nilai cache di xlsx agar viewer tanpa mesin hitung tetap menampilkan angka.
 */
type Scalar = number | string | boolean | null;
type Val = Scalar | Scalar[][];

class FormulaError extends Error {}

const colNum = (s: string) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

export function evaluateWorkbook(wb: ExcelJS.Workbook): void {
  const cache = new Map<string, Scalar>();
  const busy = new Set<string>();

  const rawCell = (sheet: string, r: number, c: number): { f?: string; v: Scalar } => {
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new FormulaError('sheet?');
    const v = ws.getCell(r, c).value as unknown;
    if (v && typeof v === 'object' && 'formula' in (v as object)) return { f: (v as { formula: string }).formula, v: null };
    if (v && typeof v === 'object') return { v: null };
    return { v: (v as Scalar) ?? null };
  };

  const cellValue = (sheet: string, r: number, c: number): Scalar => {
    const key = `${sheet}|${r}|${c}`;
    if (cache.has(key)) return cache.get(key)!;
    const raw = rawCell(sheet, r, c);
    if (raw.f === undefined) {
      cache.set(key, raw.v);
      return raw.v;
    }
    if (busy.has(key)) throw new FormulaError('circular');
    busy.add(key);
    try {
      const out = scalar(new Parser(raw.f, sheet).parse());
      cache.set(key, out);
      return out;
    } finally {
      busy.delete(key);
    }
  };

  const scalar = (v: Val): Scalar => (Array.isArray(v) ? (v[0]?.[0] ?? null) : v);
  const num = (v: Val): number => {
    const s = scalar(v);
    if (typeof s === 'number') return s;
    if (s === null || s === '') return 0;
    if (typeof s === 'boolean') return s ? 1 : 0;
    const n = Number(s);
    if (isNaN(n)) throw new FormulaError('#VALUE!');
    return n;
  };
  const flat = (v: Val): Scalar[] => (Array.isArray(v) ? v.flat() : [v]);

  class Parser {
    private i = 0;
    private toks: string[];
    constructor(src: string, private sheet: string) {
      this.toks = src.match(/'[^']+'![$A-Z0-9:]+|[A-Za-z_][A-Za-z0-9_.]*![$A-Z0-9:]+|"[^"]*"|\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|[A-Z][A-Z0-9.]*(?=\()|\d+\.?\d*(?:[eE][+-]?\d+)?|<>|<=|>=|[-+*/^(),=<>&:]/g) ?? [];
    }
    parse(): Val {
      const v = this.cmp();
      return v;
    }
    private peek() {
      return this.toks[this.i];
    }
    private cmp(): Val {
      let l = this.add();
      while (['=', '<>', '<', '>', '<=', '>='].includes(this.peek())) {
        const op = this.toks[this.i++];
        const r = this.add();
        const a = scalar(l);
        const b = scalar(r);
        const both = typeof a === 'number' && typeof b === 'number';
        const x = both ? a : typeof a === 'string' || typeof b === 'string' ? String(a ?? '') : num(a);
        const y = both ? b : typeof a === 'string' || typeof b === 'string' ? String(b ?? '') : num(b);
        l = op === '=' ? x === y : op === '<>' ? x !== y : op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
      }
      return l;
    }
    private add(): Val {
      let l = this.mul();
      while (this.peek() === '+' || this.peek() === '-') {
        const op = this.toks[this.i++];
        const r = this.mul();
        l = op === '+' ? num(l) + num(r) : num(l) - num(r);
      }
      return l;
    }
    private mul(): Val {
      let l = this.pow();
      while (this.peek() === '*' || this.peek() === '/') {
        const op = this.toks[this.i++];
        const r = this.pow();
        if (op === '*') l = num(l) * num(r);
        else {
          const d = num(r);
          if (d === 0) throw new FormulaError('#DIV/0!');
          l = num(l) / d;
        }
      }
      return l;
    }
    private pow(): Val {
      let l = this.unary();
      while (this.peek() === '^') {
        this.i++;
        l = Math.pow(num(l), num(this.unary()));
      }
      return l;
    }
    private unary(): Val {
      if (this.peek() === '-') {
        this.i++;
        return -num(this.unary());
      }
      if (this.peek() === '+') {
        this.i++;
        return this.unary();
      }
      return this.atom();
    }
    private atom(): Val {
      const t = this.toks[this.i++];
      if (t === undefined) throw new FormulaError('parse');
      if (t === '(') {
        const v = this.cmp();
        this.i++; // ')'
        return v;
      }
      if (t.startsWith('"')) return t.slice(1, -1);
      if (/^\d/.test(t)) return Number(t);
      if (this.peek() === '(' && /^[A-Z][A-Z0-9.]*$/.test(t)) {
        this.i++;
        const args: (() => Val)[] = [];
        if (this.peek() !== ')') {
          for (;;) {
            const start = this.i;
            args.push(() => {
              const save = this.i;
              this.i = start;
              const v = this.cmp();
              this.i = save;
              return v;
            });
            // lewati token argumen tanpa mengevaluasi (evaluasi malas)
            let depth = 0;
            while (this.i < this.toks.length) {
              const tk = this.toks[this.i];
              if (tk === '(') depth++;
              else if (tk === ')') {
                if (depth === 0) break;
                depth--;
              } else if (tk === ',' && depth === 0) break;
              this.i++;
            }
            if (this.peek() === ',') {
              this.i++;
              continue;
            }
            break;
          }
        }
        this.i++; // ')'
        return this.call(t, args);
      }
      return this.ref(t);
    }
    private ref(t: string): Val {
      let sheet = this.sheet;
      let body = t;
      const bang = t.lastIndexOf('!');
      if (bang >= 0) {
        sheet = t.slice(0, bang).replace(/^'|'$/g, '');
        body = t.slice(bang + 1);
      }
      const m = body.replace(/\$/g, '').match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      if (!m) throw new FormulaError('ref');
      const c1 = colNum(m[1]);
      const r1 = Number(m[2]);
      if (!m[3]) return cellValue(sheet, r1, c1);
      const c2 = colNum(m[3]);
      const r2 = Number(m[4]);
      const out: Scalar[][] = [];
      for (let r = r1; r <= r2; r++) {
        const row: Scalar[] = [];
        for (let c = c1; c <= c2; c++) row.push(cellValue(sheet, r, c));
        out.push(row);
      }
      return out;
    }
    private call(name: string, a: (() => Val)[]): Val {
      switch (name) {
        case 'IF': {
          const c = scalar(a[0]());
          const truthy = typeof c === 'boolean' ? c : num(c) !== 0;
          return truthy ? a[1]() : a[2] ? a[2]() : false;
        }
        case 'IFERROR':
          try {
            const v = a[0]();
            return v;
          } catch (e) {
            if (e instanceof FormulaError) return a[1]();
            throw e;
          }
        case 'AND':
          return a.every((f) => flat(f()).every((x) => (typeof x === 'boolean' ? x : num(x) !== 0)));
        case 'ISNUMBER':
          return typeof scalar(a[0]()) === 'number';
        case 'SUM':
          return a.reduce((s, f) => s + flat(f()).reduce<number>((t, x) => t + (typeof x === 'number' ? x : 0), 0), 0);
        case 'MIN':
          return Math.min(...a.flatMap((f) => flat(f()).filter((x): x is number => typeof x === 'number')));
        case 'MAX':
          return Math.max(...a.flatMap((f) => flat(f()).filter((x): x is number => typeof x === 'number')));
        case 'INDEX': {
          const arr = a[0]() as Scalar[][];
          const r = num(a[1]());
          const c = a[2] ? num(a[2]()) : 0;
          let row: number;
          let col: number;
          if (a[2]) {
            row = r;
            col = c;
          } else if (arr.length === 1) {
            row = 1;
            col = r;
          } else {
            row = r;
            col = 1;
          }
          const v = arr[row - 1]?.[col - 1];
          if (v === undefined) throw new FormulaError('#REF!');
          return v;
        }
        case 'MATCH': {
          const key = scalar(a[0]());
          const hit = flat(a[1]()).findIndex((x) => x === key);
          if (hit < 0) throw new FormulaError('#N/A');
          return hit + 1;
        }
        case 'SUMIF': {
          const crit = flat(a[0]());
          const key = scalar(a[1]());
          const sums = flat(a[2]());
          return crit.reduce<number>((s, x, k) => (x === key && typeof sums[k] === 'number' ? s + (sums[k] as number) : s), 0);
        }
        case 'VLOOKUP': {
          const key = scalar(a[0]());
          const tbl = a[1]() as Scalar[][];
          const col = num(a[2]());
          const row = tbl.find((r) => r[0] === key);
          if (!row) throw new FormulaError('#N/A');
          return row[col - 1] ?? null;
        }
        case 'IRR': {
          const flows = flat(a[0]()).filter((x): x is number => typeof x === 'number');
          const v = irr(flows);
          if (v === null) throw new FormulaError('#NUM!');
          return v;
        }
        default:
          throw new FormulaError(`fungsi ${name}`);
      }
    }
  }

  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const v = cell.value as unknown;
        if (v && typeof v === 'object' && 'formula' in (v as object)) {
          try {
            const res = cellValue(ws.name, r, c);
            if (res !== null && res !== undefined) cell.value = { formula: (v as { formula: string }).formula, result: res } as ExcelJS.CellFormulaValue;
          } catch {
            /* biarkan tanpa cache; Excel akan menghitung sendiri */
          }
        }
      });
    });
  });
}
