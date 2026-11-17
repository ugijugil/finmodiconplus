# Kajian Finansial

Aplikasi web (tanpa server) untuk memodelkan kajian finansial sebuah bisnis dan mengekspornya ke xlsx berformula hidup, strukturnya mengikuti template KKF.

## Menjalankan
```bash
npm install
npm run dev        # pengembangan, http://localhost:5173
npm run build      # menghasilkan dist/index.html (SATU file, siap dibagikan ke tim)
npm run verify     # uji paritas: rumus Excel hasil ekspor == hitungan aplikasi (lihat catatan)
```
`dist/index.html` bisa dibuka langsung (klik dua kali) atau diunggah ke hosting statis / SharePoint. Data simulasi tersimpan di browser pengguna (localStorage); pindah/bagikan simulasi lewat Ekspor/Impor JSON.

## Alur model
Proyeksi Transaksi (driver volume + pertumbuhan) → Revenue (volume × take-up × konversi × harga skenario) → Opex (manpower dari rate card, biaya tetap, % revenue, per satuan) → Capex (mandays/lumpsum, amortisasi) → FIN Model (laba rugi, utang, arus kas, NPV/IRR/PI/payback/BEP) → Sensitivitas.

## Struktur kode
- `src/engine.ts` — mesin kalkulasi murni (sumber kebenaran angka di aplikasi).
- `src/exportXlsx.ts` — penulis xlsx; rumus dibuat mencerminkan engine.
- `src/pages/*` — layar input & hasil. `src/rateCard.ts` — master tarif bawaan (REF KHS VENDOR).
- `tests/verify.ts` — membangun xlsx lalu menghitung ulang rumusnya dengan HyperFormula dan membandingkan dengan engine.

## Batasan yang diketahui
- Kolom tahun pada xlsx dibuat sesuai tenor saat ekspor; mengubah tenor dilakukan di aplikasi lalu ekspor ulang.
- Sheet Sensitivitas di xlsx adalah snapshot (statis); what-if live tersedia lewat pengali di `Asumsi!D22:D25`.
- Grafik di xlsx: 2 grafik native di sheet Ex Summary (disisipkan lewat `src/xlsxCharts.ts`); grafik lain hanya ada di aplikasi.
- Nilai cache rumus ditanam oleh evaluator internal (`src/evalFormulas.ts`), jadi viewer tanpa mesin hitung tetap menampilkan angka; Excel tetap menghitung ulang saat dibuka.
- `npm run verify` tidak mengecek IRR di sisi Excel (HyperFormula tidak punya fungsi IRR); IRR diperiksa sebagai akar dari arus kas versi Excel.
