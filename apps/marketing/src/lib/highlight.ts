import { codeToHtml, createCssVariablesTheme } from 'shiki';

export type CodeLanguage = 'bash' | 'json' | 'jsonc' | 'http' | 'swift';

const theme = createCssVariablesTheme({
  name: 'tokens',
  variablePrefix: '--code-',
  variableDefaults: {},
  fontStyle: false,
});

theme.tokenColors?.push(
  { scope: ['string.unquoted.argument'], settings: { foreground: 'var(--code-foreground)' } },
  { scope: ['constant.other.option'], settings: { foreground: 'var(--code-token-parameter)' } }
);

const CURL_BODY = /^([\s\S]*?-d ')([\s\S]*?)('\s*)$/;

function detectLanguage(code: string): CodeLanguage {
  const first = code.trimStart();
  if (/^(GET|POST|PATCH|PUT|DELETE) \//.test(first)) return 'http';
  if (first.startsWith('{') || first.startsWith('[')) return code.includes('//') ? 'jsonc' : 'json';
  if (/^(BuzzKit|import |let |try |func )/.test(first) || /\nBuzzKit\./.test(code)) return 'swift';
  if (first.startsWith('//')) return 'jsonc';
  return 'bash';
}

async function render(code: string, lang: CodeLanguage): Promise<string> {
  return await codeToHtml(code, { lang, theme, structure: 'inline' });
}

function quote(): string {
  return `<span style="color:var(--code-token-punctuation)">'</span>`;
}

export async function highlight(code: string, lang: CodeLanguage = detectLanguage(code)): Promise<string> {
  const body = lang === 'bash' ? CURL_BODY.exec(code) : null;
  if (!body) return await render(code, lang);

  const [, command, json, closing] = body;
  const head = await render(command!.slice(0, -1), 'bash');
  const payload = await render(json!, 'json');
  return `${head}${quote()}${payload}${quote()}${closing!.slice(1)}`;
}
