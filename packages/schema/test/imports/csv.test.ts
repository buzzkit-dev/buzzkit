import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseCsv } from '../../src/imports/index';

describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes, embedded newlines and CRLF rows', () => {
    const text = '﻿id,"Tags",note\r\n1,"{""plan"":""pro""}","a, b"\r\n2,"",line\nbreak\r\n';
    const parsed = parseCsv(text);

    expect(parsed.headers).toEqual(['id', 'tags', 'note']);
    expect(parsed.records).toEqual([
      { id: '1', tags: '{"plan":"pro"}', note: 'a, b' },
      { id: '2', tags: '', note: 'line' },
      { id: 'break', tags: '', note: '' },
    ]);
  });

  it('keeps a file with only a header row as zero records and drops blank lines', () => {
    expect(parseCsv('a,b\n\n\n')).toEqual({ headers: ['a', 'b'], records: [] });
    expect(parseCsv('a,b\n1,2\n\n3,4')).toMatchObject({
      records: [
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ],
    });
  });

  it('normalizes headers to lowercase and trims cells', () => {
    expect(normalizeHeader('  External User Id ')).toBe('external user id');
    expect(parseCsv(' Identifier , Device_Type \n abc , 0 ').records).toEqual([
      { identifier: 'abc', device_type: '0' },
    ]);
  });
});
