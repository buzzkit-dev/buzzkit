export const COOKIE_PREFIX = 'buzzkit';

export const SESSION_COOKIE_NAMES = [
  `__Secure-${COOKIE_PREFIX}.session_token`,
  `${COOKIE_PREFIX}.session_token`,
];

export function sharedCookieDomain(urlA: string, urlB: string): string | undefined {
  const a = new URL(urlA).hostname.split('.');
  const b = new URL(urlB).hostname.split('.');
  const shared: string[] = [];
  while (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1])
    shared.unshift(a.pop() as string);
  return shared.length >= 2 ? shared.join('.') : undefined;
}
