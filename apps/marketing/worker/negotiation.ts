const MARKDOWN_AGENT_PATTERN = /GPTBot|ClaudeBot|Claude-User|PerplexityBot|Perplexity-User|OAI-SearchBot/i;

export function acceptsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html');
}

export function prefersMarkdown(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/markdown')) return true;
  const userAgent = request.headers.get('user-agent') ?? '';
  return MARKDOWN_AGENT_PATTERN.test(userAgent);
}

export function resolveMarkdownPath(pathname: string): string | null {
  if (pathname === '/') return '/index.md';
  if (pathname.includes('.')) return null;
  return `${pathname}.md`;
}
