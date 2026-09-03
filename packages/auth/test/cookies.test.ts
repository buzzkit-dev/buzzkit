import { describe, expect, it } from 'vitest';
import { sharedCookieDomain } from '../src/cookies';

describe('sharedCookieDomain', () => {
  it('spans the apex and a subdomain', () => {
    expect(sharedCookieDomain('https://api.buzzkit.dev/v1/auth', 'https://buzzkit.dev')).toBe('buzzkit.dev');
  });

  it('spans two sibling subdomains', () => {
    expect(sharedCookieDomain('https://api.buzzkit.dev', 'https://app.buzzkit.dev')).toBe('buzzkit.dev');
  });

  it('keeps a multi-label registrable suffix', () => {
    expect(sharedCookieDomain('https://api.example.co.uk', 'https://example.co.uk')).toBe('example.co.uk');
  });

  it('is undefined for the same host', () => {
    expect(sharedCookieDomain('http://localhost:8790', 'http://localhost:5180')).toBeUndefined();
  });

  it('is undefined when only the public suffix is shared', () => {
    expect(sharedCookieDomain('https://api.buzzkit.dev', 'https://other.dev')).toBeUndefined();
  });

  it('is undefined for unrelated hosts', () => {
    expect(sharedCookieDomain('https://api.buzzkit.dev', 'https://example.com')).toBeUndefined();
  });
});
