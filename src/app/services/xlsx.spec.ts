import { buildXlsx, columnName, sheetXml } from './xlsx';

describe('columnName', () => {
  it('maps zero-based indexes to spreadsheet columns', () => {
    expect([0, 3, 25, 26, 27].map(columnName)).toEqual(['A', 'D', 'Z', 'AA', 'AB']);
  });
});

describe('sheetXml', () => {
  it('writes numbers as numeric cells and strings as inline strings', () => {
    const xml = sheetXml([['cmmf', 'name', 'cantidad', 'valor'], ['5861030187', 'ASPA', 2, 47800]]);
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">cmmf</t></is></c>');
    // Quantity and value must stay numeric so Excel can sum the column.
    expect(xml).toContain('<c r="C2"><v>2</v></c>');
    expect(xml).toContain('<c r="D2"><v>47800</v></c>');
    // A CMMF is digits but arrives as a string, so it keeps its leading zeros.
    expect(xml).toContain('<c r="A2" t="inlineStr">');
  });

  it('escapes XML metacharacters and skips empty cells', () => {
    const xml = sheetXml([['a & b <c>', null, '']]);
    expect(xml).toContain('a &amp; b &lt;c&gt;');
    expect(xml).not.toContain('r="B1"');
    expect(xml).not.toContain('r="C1"');
  });
});

describe('buildXlsx', () => {
  it('produces a zip holding the five parts Excel requires', () => {
    const bytes = buildXlsx([['cmmf', 'name', 'cantidad', 'valor']], { sheetName: 'Repuestos' });
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    const text = new TextDecoder().decode(bytes);
    for (const entry of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(text).toContain(entry);
    }
    expect(text).toContain('name="Repuestos"');
  });
});
