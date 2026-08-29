type JsonLocation = { line: number; column: number };

type JsonParseResult =
  | { ok: true; value: unknown; locations: Map<string, JsonLocation> }
  | { ok: false; message: string; line: number; column: number };

function pointerOf(path: Array<string | number>): string {
  return path.map((part) => `/${String(part).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

export function parseJson(text: string): JsonParseResult {
  const locations = new Map<string, JsonLocation>();
  let index = 0;
  let line = 1;
  let column = 1;

  const fail = (message: string): never => {
    throw { message, line, column };
  };
  const peek = () => text[index];
  const advance = () => {
    const character = text[index++];
    if (character === '\n') {
      line += 1;
      column = 1;
    } else column += 1;
    return character;
  };
  const skip = () => {
    for (;;) {
      const character = peek();
      if (character !== undefined && WHITESPACE.has(character)) {
        advance();
        continue;
      }
      if (character === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
        fail('Comments are not allowed in JSON. Remove the // or /* … */ part.');
      }
      return;
    }
  };
  const expect = (character: string, hint: string) => {
    if (peek() !== character) fail(hint);
    advance();
  };
  const parseString = (context: string): string => {
    if (peek() === "'") fail(`${context} must use double quotes, not single quotes.`);
    expect('"', `Expected ${context} in double quotes.`);
    let result = '';
    for (;;) {
      const character = advance();
      if (character === undefined)
        return fail('The text ends inside a string. Close it with a double quote.');
      if (character === '"') return result;
      if (character === '\\') {
        const escaped = advance();
        const simple: Record<string, string> = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (escaped !== undefined && escaped in simple) result += simple[escaped];
        else if (escaped === 'u') {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape in string.');
          for (let step = 0; step < 4; step += 1) advance();
          result += String.fromCharCode(Number.parseInt(hex, 16));
        } else fail(`Invalid escape "\\${escaped ?? ''}" in string.`);
        continue;
      }
      if (character === '\n') fail('Strings cannot span lines. Close the string before the line break.');
      result += character;
    }
  };
  const parseValue = (path: Array<string | number>): unknown => {
    skip();
    locations.set(pointerOf(path), { line, column });
    const character = peek();
    if (character === undefined) return fail('The text ends where a value was expected.');
    if (character === '{') return parseObject(path);
    if (character === '[') return parseArray(path);
    if (character === '"' || character === "'") return parseString('a string');
    if (character === '-' || (character >= '0' && character <= '9')) {
      const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(index));
      if (!match) fail('Invalid number.');
      for (let step = 0; step < match![0].length; step += 1) advance();
      return Number(match![0]);
    }
    for (const [word, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (text.startsWith(word, index)) {
        for (let step = 0; step < word.length; step += 1) advance();
        return value;
      }
    }
    if (/[A-Za-z_$]/.test(character)) {
      const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(index))![0];
      fail(`Unexpected "${word}". Strings must be in double quotes; only true, false and null stand alone.`);
    }
    return fail(`Unexpected character "${character}".`);
  };
  const parseObject = (path: Array<string | number>): Record<string, unknown> => {
    expect('{', 'Expected {.');
    const result: Record<string, unknown> = {};
    skip();
    if (peek() === '}') {
      advance();
      return result;
    }
    for (;;) {
      skip();
      if (peek() === '}') fail('Remove the trailing comma before }.');
      if (peek() !== '"' && peek() !== "'") {
        const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(index));
        if (word) fail(`Keys must be in double quotes: "${word[0]}".`);
        fail('Expected a key in double quotes.');
      }
      const key = parseString('a key');
      skip();
      expect(':', `Expected : after the key "${key}".`);
      result[key] = parseValue([...path, key]);
      skip();
      if (peek() === ',') {
        advance();
        continue;
      }
      if (peek() === '}') {
        advance();
        return result;
      }
      if (peek() === undefined) fail('The text ends inside an object. Close it with }.');
      fail(`Expected , or } after the value of "${key}".`);
    }
  };
  const parseArray = (path: Array<string | number>): unknown[] => {
    expect('[', 'Expected [.');
    const result: unknown[] = [];
    skip();
    if (peek() === ']') {
      advance();
      return result;
    }
    for (;;) {
      skip();
      if (peek() === ']') fail('Remove the trailing comma before ].');
      result.push(parseValue([...path, result.length]));
      skip();
      if (peek() === ',') {
        advance();
        continue;
      }
      if (peek() === ']') {
        advance();
        return result;
      }
      if (peek() === undefined) fail('The text ends inside a list. Close it with ].');
      fail('Expected , or ] after a list item.');
    }
  };

  try {
    const value = parseValue([]);
    skip();
    if (index < text.length) fail(`Unexpected "${peek()}" after the end of the expression.`);
    return { ok: true, value, locations };
  } catch (error) {
    const {
      message,
      line: atLine,
      column: atColumn,
    } = error as { message: string; line: number; column: number };
    return { ok: false, message, line: atLine, column: atColumn };
  }
}

export function lineOf(locations: Map<string, JsonLocation>, path: Array<string | number>): number | null {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const location = locations.get(pointerOf(path.slice(0, depth)));
    if (location) return location.line;
  }
  return null;
}
