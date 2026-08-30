import { describe, expect, it } from 'vitest';
import {
  isTemplate,
  lintTemplate,
  parseTemplate,
  TEMPLATE_FILTERS,
  templatePaths,
} from '../../../src/workflows/index';

describe('parseTemplate', () => {
  it('splits text and placeholders, reading paths, literals, filters and the condition', () => {
    expect(parseTemplate('Hi {{ subscriber.attributes.name | default: "there" }}!')).toEqual([
      { kind: 'text', text: 'Hi ' },
      {
        kind: 'placeholder',
        placeholder: {
          source: ' subscriber.attributes.name | default: "there" ',
          value: { kind: 'path', path: 'subscriber.attributes.name' },
          filters: [{ name: 'default', arguments: [{ kind: 'literal', value: 'there' }] }],
        },
      },
      { kind: 'text', text: '!' },
    ]);
    const [part] = parseTemplate('{{ vars.cancel ? "bye" : trigger.data.name | upcase }}');
    expect(part?.kind === 'placeholder' && part.placeholder).toMatchObject({
      test: { kind: 'path', path: 'vars.cancel' },
      value: { kind: 'literal', value: 'bye' },
      otherwise: { kind: 'path', path: 'trigger.data.name' },
      filters: [{ name: 'upcase', arguments: [] }],
    });
    const [replaced] = parseTemplate('{{ trigger.data.slug | replace: "-", " " | plus: vars.extra }}');
    expect(replaced?.kind === 'placeholder' && replaced.placeholder.filters).toEqual([
      {
        name: 'replace',
        arguments: [
          { kind: 'literal', value: '-' },
          { kind: 'literal', value: ' ' },
        ],
      },
      { name: 'plus', arguments: [{ kind: 'path', path: 'vars.extra' }] },
    ]);
    expect(templatePaths('{{ a.b }} and {{ c.d }}')).toEqual(['a.b', 'c.d']);
    expect(templatePaths('{{ a.b ? c.d : "x" | default: e.f }}')).toEqual(['a.b', 'c.d', 'e.f']);
    expect(isTemplate('plain')).toBe(false);
    expect(isTemplate('{{ a.b }}')).toBe(true);
  });

  it('names what is wrong with a placeholder', () => {
    expect(lintTemplate('Hi {{ subscriber.attributes.name }}')).toEqual([]);
    expect(lintTemplate('{{ trigger.data.x | nope }}')).toEqual([
      {
        placeholder: 'trigger.data.x | nope',
        message: `"nope" is not a filter. Filters: ${TEMPLATE_FILTERS.map((filter) => `"${filter}"`).join(', ')}.`,
      },
    ]);
    expect(lintTemplate('{{ a.b ? "x" }}')).toEqual([
      { placeholder: 'a.b ? "x"', message: 'A condition is written as {{ path ? "yes" : "no" }}.' },
    ]);
    expect(lintTemplate('{{ a.b | default }}')[0]?.message).toBe(
      '"default" takes the text to use when the value is empty, such as default: "there".'
    );
    expect(lintTemplate('{{ a.b | truncate: "x" }}')[0]?.message).toBe(
      '"truncate" takes a whole number of characters, such as truncate: 40.'
    );
    expect(lintTemplate('{{ a.b | date: "tiny" }}')[0]?.message).toBe(
      '"date" takes a style: "full", "long", "medium", "short", "weekday".'
    );
    expect(lintTemplate('{{ a.b | until: "tiny" }}')[0]?.message).toBe(
      '"until" takes a style: "long", "short".'
    );
    expect(lintTemplate('{{ a.b | upcase: 1 }}')[0]?.message).toBe('"upcase" takes no argument.');
    expect(lintTemplate('{{ a.b | replace: "-" }}')[0]?.message).toBe(
      '"replace" takes the text to find and the text to put in its place, such as replace: "-", " ".'
    );
    expect(lintTemplate('{{ a.b | plus: "soon" }}')[0]?.message).toBe(
      '"plus" takes a number, or a duration to add to a date, such as plus: "3d".'
    );
    expect(lintTemplate('{{ a.b | plus: "3d" | plus: 2 | pluralize: "day", "days" }}')).toEqual([]);
    expect(lintTemplate('{{ now | plus: "3d" | date: "weekday" }}')).toEqual([]);
    expect(lintTemplate('{{ }}')[0]?.message).toBe(
      'A placeholder needs a path, such as {{ trigger.data.plan }}.'
    );
    expect(lintTemplate('{{ "open }}')[0]?.message).toBe('A quoted text is missing its closing quote.');
    expect(lintTemplate('{{ a.b # }}')[0]?.message).toBe('Unexpected "#".');
    expect(lintTemplate('{{ a.b c.d }}')[0]?.message).toBe('Unexpected text after the placeholder.');
  });
});

describe('filter signatures', () => {
  const valid = [
    '{{ a.b | default: "there" }}',
    '{{ a.b | upcase }}',
    '{{ a.b | downcase }}',
    '{{ a.b | capitalize }}',
    '{{ a.b | strip }}',
    '{{ a.b | truncate: 40 }}',
    '{{ a.b | append: "!" }}',
    '{{ a.b | prepend: "#" }}',
    '{{ a.b | replace: "-", " " }}',
    '{{ a.b | pluralize: "day" }}',
    '{{ a.b | pluralize: "day", "days" }}',
    '{{ a.b | size }}',
    '{{ a.b | first }}',
    '{{ a.b | last }}',
    '{{ a.b | join }}',
    '{{ a.b | join: ", " }}',
    '{{ a.b | url_encode }}',
    '{{ a.b | json }}',
    '{{ a.b | number }}',
    '{{ a.b | number: 2 }}',
    '{{ a.b | round }}',
    '{{ a.b | round: 1 }}',
    '{{ a.b | ceil }}',
    '{{ a.b | floor }}',
    '{{ a.b | abs }}',
    '{{ a.b | plus: 1 }}',
    '{{ a.b | plus: "3d" }}',
    '{{ a.b | minus: "2h" }}',
    '{{ a.b | times: 2 }}',
    '{{ a.b | divided_by: 2 }}',
    '{{ a.b | modulo: 2 }}',
    '{{ a.b | at_least: 1 }}',
    '{{ a.b | at_most: 100 }}',
    '{{ a.b | date }}',
    '{{ a.b | date: "weekday" }}',
    '{{ a.b | time: "short" }}',
    '{{ a.b | until }}',
    '{{ a.b | ago: "short" }}',
    '{{ a.b | plus: c.d }}',
  ];
  const invalid = [
    [
      '{{ a.b | number: "x" }}',
      '"number" takes the number of decimals to show, from 0 to 20, such as number: 1.',
    ],
    [
      '{{ a.b | round: 30 }}',
      '"round" takes the number of decimals to keep, from 0 to 20, such as round: 1.',
    ],
    ['{{ a.b | truncate: 0 }}', '"truncate" takes a whole number of characters, such as truncate: 40.'],
    [
      '{{ a.b | pluralize: 1 }}',
      '"pluralize" takes the singular noun, and the plural when it is not the singular plus "s", such as pluralize: "day".',
    ],
    ['{{ a.b | join: 2 }}', '"join" takes the separator, such as join: ", ".'],
    ['{{ a.b | times: "x" }}', '"times" takes a number, such as times: 2.'],
    ['{{ a.b | date: 1 }}', '"date" takes a style: "full", "long", "medium", "short", "weekday".'],
    ['{{ a.b | append }}', '"append" takes the text to add after the value, such as append: "!".'],
    [
      '{{ a.b | replace: "a", "b", "c" }}',
      '"replace" takes the text to find and the text to put in its place, such as replace: "-", " ".',
    ],
    ['{{ a.b | url_encode: 1 }}', '"url_encode" takes no argument.'],
    [
      '{{ a.b | minus: "1w" }}',
      '"minus" takes a number, or a duration to take from a date, such as minus: "1h".',
    ],
  ] as const;

  it('accepts every filter with its documented arguments', () => {
    for (const text of valid) expect(lintTemplate(text), text).toEqual([]);
    expect(new Set(valid.map((text) => /\| (\w+)/.exec(text)?.[1])).size).toBe(TEMPLATE_FILTERS.length);
  });

  it('names the argument a filter needs', () => {
    for (const [text, message] of invalid) expect(lintTemplate(text)[0]?.message, text).toBe(message);
  });

  it('lists now as a path', () => {
    expect(templatePaths('{{ now | plus: "1d" }} and {{ a.b }}')).toEqual(['now', 'a.b']);
  });
});
