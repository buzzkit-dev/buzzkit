import type { ImportRecord, ParsedCsv } from './types';

function parseFields(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

export function parseCsv(text: string): ParsedCsv {
  const [headerRow, ...body] = parseFields(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const headers = (headerRow ?? []).map(normalizeHeader);

  const records = body.map((fields) => {
    const record: ImportRecord = {};
    headers.forEach((header, column) => {
      if (header) record[header] = (fields[column] ?? '').trim();
    });
    return record;
  });

  return { headers: headers.filter((header) => header.length > 0), records };
}
