/**
 * Minimal, dependency-free `.xlsx` writer.
 *
 * An xlsx file is a ZIP of OOXML parts. We only ever *write* a single flat
 * sheet, so instead of pulling in SheetJS (last npm release carries two
 * unpatched advisories) or ExcelJS (drags a vulnerable `uuid`, ~1 MB), we emit
 * the five parts Excel needs and store them uncompressed.
 *
 * Strings are written as inline strings, which avoids the shared-string table.
 */

export type CellValue = string | number | null;

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_OFF_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  // Control characters are illegal in XML 1.0 and Excel rejects the file.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>&"']/g, (c) => ESCAPES[c]!);
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function cellXml(value: CellValue, ref: string): string {
  if (value === null || value === '') {
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

/** Builds the worksheet XML. Exported so the column/row mapping stays testable. */
export function sheetXml(rows: readonly (readonly CellValue[])[], widths: readonly number[] = []): string {
  const cols = widths.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const body = rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, `${columnName(c)}${r + 1}`)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `${XML_DECL}<worksheet xmlns="${NS_MAIN}">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

// ---------------------------------------------------------------- zip (store)

const CRC_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushBytes(out: number[], bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i]!);
  }
}

interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/** ZIP archive with every entry stored uncompressed. Enough for a few KB of XML. */
export function zipStore(entries: readonly ZipEntry[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = local.length;

    pushU32(local, 0x04034b50);
    pushU16(local, 20); // version needed
    pushU16(local, 0); // flags
    pushU16(local, 0); // method: store
    pushU16(local, time);
    pushU16(local, date);
    pushU32(local, crc);
    pushU32(local, entry.data.length);
    pushU32(local, entry.data.length);
    pushU16(local, name.length);
    pushU16(local, 0); // extra length
    pushBytes(local, name);
    pushBytes(local, entry.data);

    pushU32(central, 0x02014b50);
    pushU16(central, 20); // version made by
    pushU16(central, 20); // version needed
    pushU16(central, 0); // flags
    pushU16(central, 0); // method: store
    pushU16(central, time);
    pushU16(central, date);
    pushU32(central, crc);
    pushU32(central, entry.data.length);
    pushU32(central, entry.data.length);
    pushU16(central, name.length);
    pushU16(central, 0); // extra
    pushU16(central, 0); // comment
    pushU16(central, 0); // disk number
    pushU16(central, 0); // internal attrs
    pushU32(central, 0); // external attrs
    pushU32(central, offset);
    pushBytes(central, name);
  }

  const centralOffset = local.length;
  pushBytes(local, new Uint8Array(central));
  pushU32(local, 0x06054b50);
  pushU16(local, 0); // this disk
  pushU16(local, 0); // disk with central directory
  pushU16(local, entries.length);
  pushU16(local, entries.length);
  pushU32(local, central.length);
  pushU32(local, centralOffset);
  pushU16(local, 0); // comment length
  return new Uint8Array(local);
}

// --------------------------------------------------------------------- xlsx

/** Builds a one-sheet workbook. `rows[0]` is treated as the header row. */
export function buildXlsx(
  rows: readonly (readonly CellValue[])[],
  { sheetName = 'Hoja1', widths = [] as readonly number[] } = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const file = (name: string, xml: string): ZipEntry => ({ name, data: encoder.encode(xml) });
  return zipStore([
    file(
      '[Content_Types].xml',
      `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    ),
    file(
      '_rels/.rels',
      `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_OFF_REL}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    file(
      'xl/workbook.xml',
      `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_OFF_REL}">` +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    ),
    file(
      'xl/_rels/workbook.xml.rels',
      `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_OFF_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    ),
    file('xl/worksheets/sheet1.xml', sheetXml(rows, widths)),
  ]);
}

/** Builds the workbook and hands it to the browser as a download. */
export function downloadXlsx(
  filename: string,
  rows: readonly (readonly CellValue[])[],
  options?: { sheetName?: string; widths?: readonly number[] },
): void {
  const blob = new Blob([buildXlsx(rows, options) as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Firefox only fires the download for an anchor that is in the document, and
  // revoking the URL in the same tick can cancel a download already in flight.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
