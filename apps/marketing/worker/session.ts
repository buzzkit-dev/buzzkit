import { SESSION_COOKIE_NAMES } from '@buzzkit/auth/cookies';

export function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  return SESSION_COOKIE_NAMES.some((name) => cookie.includes(`${name}=`));
}

export function markSignedIn(response: Response): Response {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return response;
  return new HTMLRewriter()
    .on('html', {
      element(element) {
        element.setAttribute('data-signed-in', '');
      },
    })
    .transform(response);
}
