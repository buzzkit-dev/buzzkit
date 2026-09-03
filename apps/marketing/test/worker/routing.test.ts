import { describe, expect, it } from 'vitest';
import { site } from '../../src/lib/site';
import {
  resolveAssetPath,
  resolveAssetRequest,
  resolveDocsRedirect,
  rewriteRequest,
} from '../../worker/routing';

describe('resolveDocsRedirect', () => {
  it('sends the docs paths to the documentation site, keeping the rest of the path', () => {
    expect(resolveDocsRedirect('/docs')).toBe(site.docsUrl);
    expect(resolveDocsRedirect('/docs.md')).toBe(site.docsUrl);
    expect(resolveDocsRedirect('/docs/api/messages')).toBe(`${site.docsUrl}/api/messages`);
    expect(resolveDocsRedirect('/api')).toBe(site.docsUrl);
    expect(resolveDocsRedirect('/api/v1/messages')).toBe(`${site.docsUrl}/v1/messages`);
  });

  it('leaves every other path alone', () => {
    expect(resolveDocsRedirect('/')).toBeNull();
    expect(resolveDocsRedirect('/pricing')).toBeNull();
    expect(resolveDocsRedirect('/documentation')).toBeNull();
    expect(resolveDocsRedirect('/api-catalog')).toBeNull();
    expect(resolveDocsRedirect('/.well-known/api-catalog')).toBeNull();
  });
});

describe('resolveAssetPath', () => {
  it('serves the legacy ai-catalog path from ard.json', () => {
    expect(resolveAssetPath('/.well-known/ai-catalog.json')).toBe('/.well-known/ard.json');
    expect(resolveAssetPath('/.well-known/ard.json')).toBe('/.well-known/ard.json');
    expect(resolveAssetPath('/pricing')).toBe('/pricing');
  });
});

describe('rewriteRequest', () => {
  it('points the request at another path on the same origin and keeps the headers', () => {
    const request = new Request('https://buzzkit.dev/pricing?mode=agent', {
      headers: { accept: 'text/markdown', 'user-agent': 'ClaudeBot' },
    });
    const rewritten = rewriteRequest(request, '/llms.txt');
    expect(rewritten.url).toBe('https://buzzkit.dev/llms.txt');
    expect(rewritten.headers.get('accept')).toBe('text/markdown');
    expect(rewritten.headers.get('user-agent')).toBe('ClaudeBot');
  });
});

describe('resolveAssetRequest', () => {
  it('returns the original request when the asset path is the request path', () => {
    const request = new Request('https://buzzkit.dev/pricing');
    expect(resolveAssetRequest(request, '/pricing', '/pricing')).toBe(request);
  });

  it('rewrites the request when the asset lives somewhere else', () => {
    const request = new Request('https://buzzkit.dev/.well-known/ai-catalog.json');
    const rewritten = resolveAssetRequest(request, '/.well-known/ai-catalog.json', '/.well-known/ard.json');
    expect(rewritten).not.toBe(request);
    expect(rewritten.url).toBe('https://buzzkit.dev/.well-known/ard.json');
  });
});
