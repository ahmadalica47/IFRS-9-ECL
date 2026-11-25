// Minimal .xlsx reader/writer with no dependencies.
const te = new TextEncoder();
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][]; widths?: number[] };

function zip(files: { name: string; data: Uint8Array }[]) {
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const u16 = (n: number) => [n & 255, (n >> 8) & 255]; const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const nm = te.encode(f.name); const crc = crc32(f.data);
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(nm.length), ...u16(0), ...nm]);
    parts.push(local, f.data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nm]));
    offset += local.length + f.data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(offset), 0, 0]);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function writeXlsx(sheets: Sheet[]): Blob {
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, s: string) => files.push({ name, data: te.encode(s) });
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((sh, si) => {
    const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const body = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = colName(ci) + (ri + 1);
      if (typeof v === 'number') return isFinite(v) ? `<c r="${ref}" s="2"><v>${v}</v></c>` : '';
      const pct = /^%:(.*)$/.exec(v);
      if (pct) { const x = parseFloat(pct[1]); return isFinite(x) ? `<c r="${ref}" s="3"><v>${x}</v></c>` : ''; }
      return `<c r="${ref}" t="inlineStr"${ri === 0 || /^\u200b/.test(v) ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v.replace(/^\u200b/, ''))}</t></is></c>`;
    }).join('')}</row>`).join('');
    add(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`);
  });
  return zip(files);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (window as any).DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const b = new Uint8Array(buf); const dv = new DataView(buf);
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a valid .xlsx file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const entries: Record<string, { method: number; csize: number; off: number }> = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    entries[new TextDecoder().decode(b.slice(p + 46, p + 46 + nl))] = { method, csize, off }; p += 46 + nl + el + cl;
  }
  const read = async (name: string) => {
    const en = entries[name]; if (!en) return null;
    const nl = dv.getUint16(en.off + 26, true), el = dv.getUint16(en.off + 28, true); const start = en.off + 30 + nl + el;
    const raw = b.slice(start, start + en.csize);
    const out = en.method === 0 ? raw : await inflate(raw); return new TextDecoder().decode(out);
  };
  const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
  const shared: string[] = []; const ss = await read('xl/sharedStrings.xml');
  if (ss) parse(ss).querySelectorAll('si').forEach(si => shared.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join('')));
  const sheetName = Object.keys(entries).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, c) => parseInt(a.replace(/\D/g, '')) - parseInt(c.replace(/\D/g, '')))[0];
  const sx = sheetName && await read(sheetName); if (!sx) throw new Error('No sheet found in the workbook');
  const rows: string[][] = [];
  parse(sx).querySelectorAll('sheetData > row').forEach(r => {
    const row: string[] = [];
    r.querySelectorAll('c').forEach(c => {
      const ref = c.getAttribute('r') || ''; const letters = ref.replace(/\d/g, ''); let ci = 0; for (const ch of letters) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--;
      const t = c.getAttribute('t'); let v = c.querySelector('v')?.textContent ?? '';
      if (t === 's') v = shared[+v] ?? ''; else if (t === 'inlineStr') v = Array.from(c.querySelectorAll('t')).map(x => x.textContent).join('');
      row[ci] = v;
    });
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    if (row.some(x => x !== '')) rows.push(row);
  });
  return rows;
}

// Text starting with = + - @ gets a leading ' so Excel does not run it as a formula (CSV injection). Numbers stay numbers.
export const toCSV = (rows: Cell[][]) => '\uFEFF' + rows.map(r => r.map(v => {
  let s = v === null || v === undefined ? '' : typeof v === 'number' ? (isFinite(v) ? String(v) : '') : /^%:/.test(v) ? String(parseFloat(v.slice(2))) : v.replace(/^\u200B/, '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(',')).join('\r\n');
export function download(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
