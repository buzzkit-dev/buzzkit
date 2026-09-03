export const COOKIE_PREFIX = 'buzzkit';

export const SESSION_COOKIE_NAMES = [
  `__Secure-${COOKIE_PREFIX}.session_token`,
  `${COOKIE_PREFIX}.session_token`,
];

export function sharedCookieDomain(urlA: string, urlB: string): string | undefined {
  const a = new URL(urlA).hostname.split('.');
  const b = new URL(urlB).hostname.split('.');
  const shared: string[] = [];
  while (a.length > 0 && b.length > 0 && a.at(-1) === b.at(-1)) {
    shared.unshift(a.pop() as string);
    b.pop();
  }
  return shared.length >= 2 ? shared.join('.') : undefined;
}
