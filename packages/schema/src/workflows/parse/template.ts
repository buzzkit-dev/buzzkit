import { DATE_STYLES, DURATION_STYLES, TEMPLATE_FILTERS } from '../constants';
import type { TemplateFilter } from '../types';
import { isDuration } from './duration';

export type TemplateIssue = { placeholder: string; message: string };

export type TemplateOperand =
  | { kind: 'path'; path: string }
  | { kind: 'literal'; value: string | number | boolean | null };

export type TemplateFilterCall = { name: TemplateFilter; arguments: TemplateOperand[] };

export type TemplatePlaceholder = {
  source: string;
  test?: TemplateOperand;
  value: TemplateOperand;
  otherwise?: TemplateOperand;
  filters: TemplateFilterCall[];
};

export type TemplatePart =
  | { kind: 'text'; text: string }
  | { kind: 'placeholder'; placeholder: TemplatePlaceholder };

type ArgumentKind =
  | 'any'
  | 'text'
  | 'number'
  | 'integer'
  | 'decimals'
  | 'amount'
  | 'dateStyle'
  | 'durationStyle';

export type FilterSignature = { arguments: ArgumentKind[]; required: number; takes: string; example: string };

export const FILTER_SIGNATURES: Record<TemplateFilter, FilterSignature> = {
  default: {
    arguments: ['any'],
    required: 1,
    takes: 'the text to use when the value is empty',
    example: 'default: "there"',
  },
  upcase: { arguments: [], required: 0, takes: '', example: '' },
  downcase: { arguments: [], required: 0, takes: '', example: '' },
  capitalize: { arguments: [], required: 0, takes: '', example: '' },
  strip: { arguments: [], required: 0, takes: '', example: '' },
  truncate: {
    arguments: ['integer'],
    required: 1,
    takes: 'a whole number of characters',
    example: 'truncate: 40',
  },
  append: {
    arguments: ['text'],
    required: 1,
    takes: 'the text to add after the value',
    example: 'append: "!"',
  },
  prepend: {
    arguments: ['text'],
    required: 1,
    takes: 'the text to add before the value',
    example: 'prepend: "#"',
  },
  replace: {
    arguments: ['text', 'text'],
    required: 2,
    takes: 'the text to find and the text to put in its place',
    example: 'replace: "-", " "',
  },
  pluralize: {
    arguments: ['text', 'text'],
    required: 1,
    takes: 'the singular noun, and the plural when it is not the singular plus "s"',
    example: 'pluralize: "day"',
  },
  size: { arguments: [], required: 0, takes: '', example: '' },
  first: { arguments: [], required: 0, takes: '', example: '' },
  last: { arguments: [], required: 0, takes: '', example: '' },
  join: { arguments: ['text'], required: 0, takes: 'the separator', example: 'join: ", "' },
  url_encode: { arguments: [], required: 0, takes: '', example: '' },
  json: { arguments: [], required: 0, takes: '', example: '' },
  number: {
    arguments: ['decimals'],
    required: 0,
    takes: 'the number of decimals to show, from 0 to 20',
    example: 'number: 1',
  },
  round: {
    arguments: ['decimals'],
    required: 0,
    takes: 'the number of decimals to keep, from 0 to 20',
    example: 'round: 1',
  },
  ceil: { arguments: [], required: 0, takes: '', example: '' },
  floor: { arguments: [], required: 0, takes: '', example: '' },
  abs: { arguments: [], required: 0, takes: '', example: '' },
  plus: {
    arguments: ['amount'],
    required: 1,
    takes: 'a number, or a duration to add to a date',
    example: 'plus: "3d"',
  },
  minus: {
    arguments: ['amount'],
    required: 1,
    takes: 'a number, or a duration to take from a date',
    example: 'minus: "1h"',
  },
  times: { arguments: ['number'], required: 1, takes: 'a number', example: 'times: 2' },
  divided_by: { arguments: ['number'], required: 1, takes: 'a number', example: 'divided_by: 2' },
  modulo: { arguments: ['number'], required: 1, takes: 'a number', example: 'modulo: 2' },
  at_least: { arguments: ['number'], required: 1, takes: 'a number', example: 'at_least: 1' },
  at_most: { arguments: ['number'], required: 1, takes: 'a number', example: 'at_most: 100' },
  date: { arguments: ['dateStyle'], required: 0, takes: 'a style', example: '' },
  time: { arguments: ['dateStyle'], required: 0, takes: 'a style', example: '' },
  until: { arguments: ['durationStyle'], required: 0, takes: 'a style', example: '' },
  ago: { arguments: ['durationStyle'], required: 0, takes: 'a style', example: '' },
};

type Token =
  | { kind: 'word'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'pipe' }
  | { kind: 'question' }
  | { kind: 'colon' }
  | { kind: 'comma' };

const PLACEHOLDER_PATTERN = /\{\{([\s\S]*?)\}\}/g;

const PLACEHOLDER_TEST = /\{\{[\s\S]*?\}\}/;

const WORD_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$.-]*/;

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?/;

const PATH_PATTERN = /^[a-z$][A-Za-z0-9_$-]*(?:\.[A-Za-z0-9_$-]+)*$/;

const KEYWORDS: Record<string, string | number | boolean | null> = { true: true, false: false, null: null };

const PUNCTUATION: Record<string, Token> = {
  '|': { kind: 'pipe' },
  '?': { kind: 'question' },
  ':': { kind: 'colon' },
  ',': { kind: 'comma' },
};

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly placeholder: string
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source.trim();
  while (rest.length > 0) {
    const first = rest[0] as string;
    if (/\s/.test(first)) {
      rest = rest.trimStart();
      continue;
    }
    const punctuation = PUNCTUATION[first];
    if (punctuation) {
      tokens.push(punctuation);
      rest = rest.slice(1);
      continue;
    }
    if (first === '"' || first === "'") {
      let index = 1;
      let value = '';
      while (index < rest.length && rest[index] !== first) {
        if (rest[index] === '\\' && index + 1 < rest.length) index += 1;
        value += rest[index];
        index += 1;
      }
      if (index >= rest.length)
        throw new TemplateError('A quoted text is missing its closing quote.', source);
      tokens.push({ kind: 'string', value });
      rest = rest.slice(index + 1);
      continue;
    }
    const number = NUMBER_PATTERN.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]) });
      rest = rest.slice(number[0].length);
      continue;
    }
    const word = WORD_PATTERN.exec(rest);
    if (word) {
      tokens.push({ kind: 'word', value: word[0] });
      rest = rest.slice(word[0].length);
      continue;
    }
    throw new TemplateError(`Unexpected "${first}".`, source);
  }
  return tokens;
}

const quoteAll = (values: readonly string[]) => values.map((value) => `"${value}"`).join(', ');

function literalFits(kind: ArgumentKind, value: string | number | boolean | null): boolean {
  switch (kind) {
    case 'any':
      return true;
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) && value >= 1;
    case 'decimals':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 20;
    case 'amount':
      return typeof value === 'number' || isDuration(value);
    case 'dateStyle':
      return (DATE_STYLES as readonly unknown[]).includes(value);
    case 'durationStyle':
      return (DURATION_STYLES as readonly unknown[]).includes(value);
  }
}

function checkFilter(filter: TemplateFilterCall, source: string): void {
  const signature = FILTER_SIGNATURES[filter.name];
  const given = filter.arguments;
  if (signature.arguments.length === 0) {
    if (given.length > 0) throw new TemplateError(`"${filter.name}" takes no argument.`, source);
    return;
  }
  const styles =
    signature.arguments[0] === 'dateStyle'
      ? DATE_STYLES
      : signature.arguments[0] === 'durationStyle'
        ? DURATION_STYLES
        : null;
  const problem = styles
    ? `"${filter.name}" takes a style: ${quoteAll(styles)}.`
    : `"${filter.name}" takes ${signature.takes}, such as ${signature.example}.`;
  if (given.length < signature.required || given.length > signature.arguments.length) {
    throw new TemplateError(problem, source);
  }
  for (const [index, argument] of given.entries()) {
    const kind = signature.arguments[index] as ArgumentKind;
    if (argument.kind === 'literal' && !literalFits(kind, argument.value))
      throw new TemplateError(problem, source);
  }
}

function parsePlaceholder(source: string): TemplatePlaceholder {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const operand = (role: string): TemplateOperand => {
    const token = next();
    if (!token) throw new TemplateError(`Expected ${role}.`, source);
    if (token.kind === 'string' || token.kind === 'number') return { kind: 'literal', value: token.value };
    if (token.kind === 'word') {
      if (token.value in KEYWORDS) return { kind: 'literal', value: KEYWORDS[token.value] as boolean | null };
      if (!PATH_PATTERN.test(token.value)) {
        throw new TemplateError(
          `"${token.value}" is not a path such as "subscriber.attributes.name".`,
          source
        );
      }
      return { kind: 'path', path: token.value };
    }
    throw new TemplateError(`Expected ${role}.`, source);
  };
  if (tokens.length === 0) {
    throw new TemplateError('A placeholder needs a path, such as {{ trigger.data.plan }}.', source);
  }
  const first = operand('a path or a value');
  const placeholder: TemplatePlaceholder = { source, value: first, filters: [] };
  if (peek()?.kind === 'question') {
    next();
    placeholder.test = first;
    placeholder.value = operand('the value when the condition holds');
    if (next()?.kind !== 'colon') {
      throw new TemplateError('A condition is written as {{ path ? "yes" : "no" }}.', source);
    }
    placeholder.otherwise = operand('the value when the condition does not hold');
  }
  while (peek()?.kind === 'pipe') {
    next();
    const name = next();
    if (name?.kind !== 'word' || !(TEMPLATE_FILTERS as readonly string[]).includes(name.value)) {
      const got = name?.kind === 'word' ? `"${name.value}"` : 'nothing';
      throw new TemplateError(`${got} is not a filter. Filters: ${quoteAll(TEMPLATE_FILTERS)}.`, source);
    }
    const filter: TemplateFilterCall = { name: name.value as TemplateFilter, arguments: [] };
    if (peek()?.kind === 'colon') {
      next();
      filter.arguments.push(operand(`the argument of "${filter.name}"`));
      while (peek()?.kind === 'comma') {
        next();
        filter.arguments.push(operand(`the next argument of "${filter.name}"`));
      }
    }
    checkFilter(filter, source);
    placeholder.filters.push(filter);
  }
  if (position < tokens.length) throw new TemplateError('Unexpected text after the placeholder.', source);

  return placeholder;
}

export function parseTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) });
    parts.push({ kind: 'placeholder', placeholder: parsePlaceholder(match[1] as string) });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });

  return parts;
}

export function templatePaths(text: string): string[] {
  const paths: string[] = [];
  const collect = (operand: TemplateOperand | undefined) => {
    if (operand?.kind === 'path') paths.push(operand.path);
  };
  for (const part of parseTemplate(text)) {
    if (part.kind !== 'placeholder') continue;
    collect(part.placeholder.test);
    collect(part.placeholder.value);
    collect(part.placeholder.otherwise);
    for (const filter of part.placeholder.filters) filter.arguments.forEach(collect);
  }
  return paths;
}

export function lintTemplate(text: string): TemplateIssue[] {
  try {
    parseTemplate(text);
    return [];
  } catch (caught) {
    if (caught instanceof TemplateError) {
      return [{ placeholder: caught.placeholder.trim(), message: caught.message }];
    }
    throw caught;
  }
}

export function isTemplate(text: string): boolean {
  return PLACEHOLDER_TEST.test(text);
}
