import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { site } from '../../src/lib/site';

const DIST = join(process.cwd(), 'dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const DISCOVERY_RELS = [
  'rel="sitemap"',
  'rel="describedby"',
  'rel="ard"',
  'rel="api-catalog"',
  'rel="service-desc"',
];

type ElementHandler = { element(element: { setAttribute(name: string, value: string): void }): void };

class FakeHtmlRewriter {
  private handlers: Array<{ selector: string; handler: ElementHandler }> = [];

  on(selector: string, handler: ElementHandler): this {
    this.handlers.push({ selector, handler });
    return this;
  }

  transform(response: Response): Response {
    const attributes: string[] = [];
    for (const { selector, handler } of this.handlers) {
      if (selector !== 'html') continue;
      handler.element({
        setAttribute: (name, value) => attributes.push(value ? `${name}="${value}"` : name),
      });
    }
    const rewrite = async () => {
      const html = await response.text();
      return html.replace(/<html\b/, `<html ${attributes.join(' ')}`);
    };
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(await rewrite()));
          controller.close();
        },
      }),
      { status: response.status, headers: response.headers }
    );
  }
}

function assetFile(pathname: string): string | null {
  const candidates =
    pathname === '/' ? ['/index.html'] : [pathname, `${pathname}.html`, `${pathname}/index.html`];
  for (const candidate of candidates) {
    const file = join(DIST, candidate);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function serveAsset(request: Request): Response {
  const file = assetFile(new URL(request.url).pathname);
  if (!file) {
    return new Response(readFileSync(join(DIST, '404.html')), {
      status: 404,
      headers: { 'content-type': CONTENT_TYPES['.html']! },
    });
  }
  return new Response(readFileSync(file), {
    status: 200,
    headers: { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', etag: '"x"' },
  });
}

const env = {
  ASSETS: { fetch: (request: Request) => Promise.resolve(serveAsset(request)) },
} as unknown as Env;

let worker: { fetch(request: Request, env: Env): Promise<Response> };

async function fetchSite(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return await worker.fetch(new Request(`${site.url}${path}`, { headers }), env);
}

beforeAll(async () => {
  Object.assign(globalThis, { HTMLRewriter: FakeHtmlRewriter });
  worker = (await import('../../worker/index')).default;
});

describe('the marketing worker', () => {
  it('serves the markdown twin to Accept: text/markdown with Content-Location', async () => {
    const response = await fetchSite('/features/topics', { accept: 'text/markdown' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('content-location')).toBe('/features/topics.md');
    expect((await response.text()).startsWith('---\n')).toBe(true);
  });

  it('serves markdown to AI crawlers by user agent', async () => {
    for (const agent of [
      'GPTBot/1.0',
      'ClaudeBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'OAI-SearchBot',
    ]) {
      const response = await fetchSite('/', { 'user-agent': `Mozilla/5.0 (compatible; ${agent})` });
      expect(response.headers.get('content-location'), agent).toBe('/index.md');
      expect(response.headers.get('content-type'), agent).toBe('text/markdown; charset=utf-8');
    }
  });

  it('serves html to browsers', async () => {
    const response = await fetchSite('/', { accept: 'text/html,application/xhtml+xml' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-location')).toBeNull();
    expect((await response.text()).startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('serves llms.txt for ?mode=agent on any page', async () => {
    const response = await fetchSite('/pricing?mode=agent', { accept: 'text/html' });
    expect(response.headers.get('content-location')).toBe('/llms.txt');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect((await response.text()).startsWith('# BuzzKit')).toBe(true);
  });

  it('redirects the docs paths to the docs site, keeping path and query', async () => {
    for (const [path, target] of [
      ['/docs', `${site.docsUrl}/`],
      ['/docs.md', `${site.docsUrl}/`],
      ['/docs/api/messages?x=1', `${site.docsUrl}/api/messages?x=1`],
      ['/api', `${site.docsUrl}/`],
      ['/api/reference', `${site.docsUrl}/reference`],
    ]) {
      const response = await fetchSite(path!);
      expect(response.status, path).toBe(301);
      expect(response.headers.get('location'), path).toBe(target);
    }
  });

  it('serves the ARD catalog at the legacy ai-catalog path', async () => {
    const response = await fetchSite('/.well-known/ai-catalog.json');
    expect(response.status).toBe(200);
    expect((JSON.parse(await response.text()) as { specVersion: string }).specVersion).toBe('1.0');
  });

  it('answers unknown paths with the html 404 for browsers and 404.md for everything else', async () => {
    const browser = await fetchSite('/nope', { accept: 'text/html' });
    expect(browser.status).toBe(404);
    expect(await browser.text()).toContain('<!DOCTYPE html>');

    const agent = await fetchSite('/nope');
    expect(agent.status).toBe(404);
    expect(agent.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect((await agent.text()).startsWith('# Page not found')).toBe(true);

    const crawler = await fetchSite('/nope', { accept: 'text/html', 'user-agent': 'ClaudeBot' });
    expect(crawler.status).toBe(404);
    expect(crawler.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  });

  it('stamps discovery headers on every response', async () => {
    for (const path of ['/', '/pricing', '/llms.txt', '/openapi.json', '/features/topics.md', '/nope']) {
      const response = await fetchSite(path, { accept: 'text/html' });
      const link = response.headers.get('link') ?? '';
      for (const rel of DISCOVERY_RELS) expect(link, `${path} ${rel}`).toContain(rel);
      expect(response.headers.get('vary'), path).toContain('Accept');
    }
  });

  it('keeps html private and varying on the cookie, never cached with an etag', async () => {
    const response = await fetchSite('/', { accept: 'text/html' });
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('etag')).toBeNull();
    const markdown = await fetchSite('/index.md');
    expect(markdown.headers.get('vary')).not.toContain('Cookie');
  });

  it('types the agent files correctly', async () => {
    expect((await fetchSite('/.well-known/api-catalog')).headers.get('content-type')).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
    );
    for (const path of ['/.well-known/security.txt', '/llms.txt', '/llms-full.txt']) {
      expect((await fetchSite(path)).headers.get('content-type'), path).toBe('text/plain; charset=utf-8');
    }
    expect((await fetchSite('/auth.md')).headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  });

  it('stamps the signed-in hint only on html and only with the session cookie', async () => {
    const signedIn = await fetchSite('/', { accept: 'text/html', cookie: 'buzzkit.session_token=abc' });
    expect(await signedIn.text()).toMatch(/<html[^>]*data-signed-in/);

    const anonymous = await fetchSite('/', { accept: 'text/html' });
    expect(await anonymous.text()).not.toContain('data-signed-in');

    const markdown = await fetchSite('/', { accept: 'text/markdown', cookie: 'buzzkit.session_token=abc' });
    expect(await markdown.text()).not.toContain('data-signed-in');
  });
});
