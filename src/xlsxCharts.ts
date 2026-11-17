import JSZip from 'jszip';
import type { Result } from './engine';

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHEET = "'Ex Summary'";

const colL = (n: number): string => {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

interface Ser {
  name: string;
  row: string; // nomor baris data di Ex Summary
  values: number[]; // berindeks tahun
  color: string;
}

/** Komponen arus kas tunai per tahun 0..N: kas keluar bernilai minus, tanpa amortisasi. Jumlahnya = NCF. */
export function cashFlowLines(res: Result) {
  const ys = res.years;
  return {
    rev: ys.map((y) => res.revenue[y]),
    opex: ys.map((y) => -res.opexTotal[y]),
    capex: ys.map((y) => -res.capexSpend[y]),
    taxInt: ys.map((y) => -(res.tax[y] + res.interest[y])),
    fin: ys.map((y) => res.debtDraw[y] - res.debtPrincipal[y] + res.salvage[y]),
  };
}

const numCache =(vals: number[]) =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;

function chartXml(title: string, N: number, bars: Ser[], lines: Ser[], stacked: boolean): string {
  const catRange = `${SHEET}!$E$28:$${colL(5 + N)}$28`;
  const cats = Array.from({ length: N + 1 }, (_, i) => i);
  let idx = 0;
  const ser = (s: Ser, kind: 'bar' | 'line') => {
    const ref = `${SHEET}!$E$${s.row}:$${colL(5 + N)}$${s.row}`;
    const sp =
      kind === 'bar'
        ? `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`
        : `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>`;
    const i = idx++;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${SHEET}!$B$${s.row}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${sp}<c:cat><c:numRef><c:f>${catRange}</c:f>${numCache(cats)}</c:numRef></c:cat><c:val><c:numRef><c:f>${ref}</c:f>${numCache(s.values)}</c:numRef></c:val>${kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  };
  const barXml = `<c:barChart><c:barDir val="col"/><c:grouping val="${stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${bars.map((s) => ser(s, 'bar')).join('')}<c:gapWidth val="60"/>${stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="111"/><c:axId val="222"/></c:barChart>`;
  const lineXml = lines.length
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines.map((s) => ser(s, 'line')).join('')}<c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>`
    : '';
  const plot = barXml + lineXml;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="id-ID" sz="1200" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="id-ID" sz="900" b="0"/><a:t>Tahun ke-</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="id-ID" sz="900" b="0"/><a:t>Rupiah</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function anchor(c1: number, r1: number, c2: number, r2: number, rid: string, id: number, name: string) {
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/**
 * Menyisipkan 2 grafik native ke sheet pertama ('Ex Summary').
 * Baris data: 31 Pendapatan, 32 EBITDA, 33 Laba bersih, 34 Arus kas bersih, 35 Kumulatif; header tahun di baris 28.
 */
export async function addCharts(buf: ArrayBuffer, res: Result): Promise<ArrayBuffer> {
  const N = res.N;
  const cf = cashFlowLines(res);
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetXml = await zip.file(sheetPath)!.async('string');
  if (sheetXml.includes('<drawing ') || zip.file('xl/worksheets/_rels/sheet1.xml.rels')) return buf; // jangan menimpa relasi yang sudah ada

  zip.file(
    'xl/charts/chart1.xml',
    chartXml(
      'Komponen arus kas (kas keluar bernilai minus) dan arus kas bersih',
      N,
      [
        { name: 'Pendapatan', row: '31', values: cf.rev, color: '2F6FB5' },
        { name: 'Opex tunai (−)', row: '32', values: cf.opex, color: 'D98C3B' },
        { name: 'Capex (−)', row: '33', values: cf.capex, color: 'C0392B' },
        { name: 'Pajak & bunga (−)', row: '34', values: cf.taxInt, color: '8E8E93' },
        { name: 'Pendanaan & nilai sisa', row: '35', values: cf.fin, color: '2A9D6A' },
      ],
      [{ name: 'Arus kas bersih', row: '36', values: res.ncf, color: '222222' }],
      false,
    ),
  );
  zip.file(
    'xl/charts/chart2.xml',
    chartXml(
      'Arus kas bersih',
      N,
      [{ name: 'Arus kas bersih', row: '36', values: res.ncf, color: '2F6FB5' }],
      [{ name: 'Arus kas kumulatif', row: '37', values: res.cum, color: 'ED7D31' }],
      false,
    ),
  );
  zip.file(
    'xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${anchor(1, 42, 5, 64, 'rId1', 2, 'Grafik 1')}${anchor(5, 42, 12, 64, 'rId2', 3, 'Grafik 2')}</xdr:wsDr>`,
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="${NS_R}/chart" Target="../charts/chart2.xml"/></Relationships>`,
  );
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
  );
  zip.file(sheetPath, sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'));
  const ctPath = '[Content_Types].xml';
  const ct = await zip.file(ctPath)!.async('string');
  zip.file(
    ctPath,
    ct.replace(
      '</Types>',
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  );
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
