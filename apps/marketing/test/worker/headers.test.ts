import { describe, expect, it } from 'vitest';
import { decorate } from '../../worker/headers';

function response(type: string, extra: Record<string, string> = {}): Response {
  return new Response('body', { headers: { 'content-type': type, ...extra } });
}

describe('decorate', () => {
  it('stamps the discovery Link header and Vary: Accept on every response', () => {
    const decorated = decorate(response('application/json'), '/openapi.json');
    const link = decorated.headers.get('Link') ?? '';
    expect(link).toContain('</sitemap-index.xml>; rel="sitemap"');
    expect(link).toContain('</llms.txt>; rel="describedby"');
    expect(link).toContain('</.well-known/ard.json>; rel="ard"');
    expect(link).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(link).toContain('</openapi.json>; rel="service-desc"');
    expect(decorated.headers.get('Vary')).toBe('Accept');
    expect(decorated.headers.get('Content-Type')).toBe('application/json');
  });

  it('makes HTML private and vary on the cookie, and drops its ETag', () => {
    const decorated = decorate(response('text/html; charset=utf-8', { etag: '"abc"' }), '/pricing');
    expect(decorated.headers.get('Vary')).toBe('Accept, Cookie');
    expect(decorated.headers.get('Cache-Control')).toBe('private, no-store');
    expect(decorated.headers.get('ETag')).toBeNull();
  });

  it('types markdown twins as text/markdown', () => {
    const decorated = decorate(response('text/plain'), '/features/workflows.md');
    expect(decorated.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
  });

  it('types the api-catalog as an RFC 9727 linkset', () => {
    const decorated = decorate(response('application/json'), '/.well-known/api-catalog');
    expect(decorated.headers.get('Content-Type')).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
    );
  });

  it('types llms.txt, llms-full.txt and security.txt as plain text', () => {
    for (const pathname of ['/llms.txt', '/llms-full.txt', '/.well-known/security.txt']) {
      expect(decorate(response('application/octet-stream'), pathname).headers.get('Content-Type')).toBe(
        'text/plain; charset=utf-8'
      );
    }
  });

  it('keeps the status and body', async () => {
    const missing = new Response('gone', { status: 404, headers: { 'content-type': 'text/markdown' } });
    const decorated = decorate(missing, '/404.md');
    expect(decorated.status).toBe(404);
    expect(await decorated.text()).toBe('gone');
  });
});
