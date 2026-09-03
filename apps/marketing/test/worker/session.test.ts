import { SESSION_COOKIE_NAMES } from '@buzzkit/auth/cookies';
import { describe, expect, it } from 'vitest';
import { hasSession } from '../../worker/session';

function request(cookie?: string): Request {
  return new Request('https://buzzkit.dev/', { headers: cookie ? { cookie } : {} });
}

describe('hasSession', () => {
  it('is true when any shared session cookie is present', () => {
    for (const name of SESSION_COOKIE_NAMES) {
      expect(hasSession(request(`theme=light; ${name}=abc.def`))).toBe(true);
    }
  });

  it('is false without a cookie header or with unrelated cookies', () => {
    expect(hasSession(request())).toBe(false);
    expect(hasSession(request('theme=light; consent=1'))).toBe(false);
  });
});
