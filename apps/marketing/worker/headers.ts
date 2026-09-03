const LINK_HEADER = [
  '</sitemap-index.xml>; rel="sitemap"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</.well-known/ard.json>; rel="ard"; type="application/json"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
].join(', ');

const PLAIN_TEXT_PATHS = ['/.well-known/security.txt', '/llms.txt', '/llms-full.txt'];

export function decorate(response: Response, pathname: string): Response {
  const decorated = new Response(response.body, response);
  decorated.headers.set('Link', LINK_HEADER);
  decorated.headers.append('Vary', 'Accept');
  if ((decorated.headers.get('content-type') ?? '').includes('text/html')) {
    decorated.headers.append('Vary', 'Cookie');
    decorated.headers.set('Cache-Control', 'private, no-store');
    decorated.headers.delete('ETag');
  }
  if (pathname.endsWith('.md')) {
    decorated.headers.set('Content-Type', 'text/markdown; charset=utf-8');
  }
  if (pathname === '/.well-known/api-catalog') {
    decorated.headers.set(
      'Content-Type',
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
    );
  }
  if (PLAIN_TEXT_PATHS.includes(pathname)) {
    decorated.headers.set('Content-Type', 'text/plain; charset=utf-8');
  }
  return decorated;
}
