import { describe, expect, it } from 'vitest';
import { acceptsHtml, prefersMarkdown, resolveMarkdownPath } from '../../worker/negotiation';

function request(headers: Record<string, string>): Request {
  return new Request('https://buzzkit.dev/pricing', { headers });
}

describe('acceptsHtml', () => {
  it('is true only when the Accept header names text/html', () => {
    expect(acceptsHtml(request({ accept: 'text/html,application/xhtml+xml' }))).toBe(true);
    expect(acceptsHtml(request({ accept: '*/*' }))).toBe(false);
    expect(acceptsHtml(request({}))).toBe(false);
  });
});

describe('prefersMarkdown', () => {
  it('honors an Accept header that names text/markdown', () => {
    expect(prefersMarkdown(request({ accept: 'text/markdown' }))).toBe(true);
    expect(prefersMarkdown(request({ accept: 'text/html, text/markdown;q=0.9' }))).toBe(true);
  });

  it('treats the AI crawlers as markdown readers', () => {
    for (const agent of [
      'GPTBot/1.0',
      'Mozilla/5.0 ClaudeBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'OAI-SearchBot',
    ]) {
      expect(prefersMarkdown(request({ 'user-agent': agent }))).toBe(true);
    }
  });

  it('leaves browsers and other agents on HTML', () => {
    expect(prefersMarkdown(request({ accept: 'text/html', 'user-agent': 'Mozilla/5.0 Safari' }))).toBe(false);
    expect(prefersMarkdown(request({ 'user-agent': 'Googlebot' }))).toBe(false);
    expect(prefersMarkdown(request({}))).toBe(false);
  });
});

describe('resolveMarkdownPath', () => {
  it('maps the homepage and every extensionless page to its twin', () => {
    expect(resolveMarkdownPath('/')).toBe('/index.md');
    expect(resolveMarkdownPath('/pricing')).toBe('/pricing.md');
    expect(resolveMarkdownPath('/features/workflows')).toBe('/features/workflows.md');
    expect(resolveMarkdownPath('/compare/onesignal')).toBe('/compare/onesignal.md');
  });

  it('has no twin for files', () => {
    expect(resolveMarkdownPath('/openapi.json')).toBeNull();
    expect(resolveMarkdownPath('/pricing.md')).toBeNull();
    expect(resolveMarkdownPath('/.well-known/ard.json')).toBeNull();
    expect(resolveMarkdownPath('/llms.txt')).toBeNull();
  });
});
