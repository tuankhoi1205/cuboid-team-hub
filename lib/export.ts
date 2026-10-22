const esc = (v: unknown) => String(v ?? "").replace(/[<>&"']/g, s => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[s]!));
export function csv(rows: unknown[][]) { return "\ufeff" + rows.map(r => r.map(v => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"').join(",")).join("\r\n"); }
function crc32(b: Uint8Array) { let c = -1; for (const n of b) { c ^= n; for (let j = 0; j < 8; j++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ -1) >>> 0; }
function zip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder(); const chunks: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const n = enc.encode(name), b = enc.encode(value), crc = crc32(b); const local = new Uint8Array(30 + n.length); const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint32(14, crc, true); v.setUint32(18, b.length, true); v.setUint32(22, b.length, true); v.setUint16(26, n.length, true); local.set(n, 30);
    const central = new Uint8Array(46 + n.length); const d = new DataView(central.buffer); d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true); d.setUint32(16, crc, true); d.setUint32(20, b.length, true); d.setUint32(24, b.length, true); d.setUint16(28, n.length, true); d.setUint32(42, offset, true); central.set(n, 46);
    chunks.push(local, b); directory.push(central); offset += local.length + b.length;
  }
  const size = directory.reduce((n, b) => n + b.length, 0); const end = new Uint8Array(22); const v = new DataView(end.buffer); v.setUint32(0, 0x06054b50, true); v.setUint16(8, directory.length, true); v.setUint16(10, directory.length, true); v.setUint32(12, size, true); v.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + end.length); let pos = 0; for (const b of [...chunks, ...directory, end]) { out.set(b, pos); pos += b.length; } return out;
}
export function xlsx(rows: unknown[][]) {
  const cell = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>' + rows.map((r, i) => `<row r="${i + 1}">` + r.map((v, j) => typeof v === "number" ? `<c r="${cell(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${cell(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("") + "</row>").join("") + '</sheetData></worksheet>';
  return zip({
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cuboid Team Hub" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
  });
}
