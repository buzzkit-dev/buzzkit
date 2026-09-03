import { site } from '../src/lib/site';

const DOCS_REDIRECTS = /^\/(?:docs(?:\.md)?|api)(\/.*)?$/;

export function resolveDocsRedirect(pathname: string): string | null {
  const match = DOCS_REDIRECTS.exec(pathname);
  if (!match) return null;
  return `${site.docsUrl}${match[1] ?? ''}`;
}

export function resolveAssetPath(pathname: string): string {
  if (pathname === '/.well-known/ai-catalog.json') return '/.well-known/ard.json';
  return pathname;
}

export function rewriteRequest(request: Request, pathname: string): Request {
  return new Request(new URL(pathname, request.url), { headers: request.headers });
}

export function resolveAssetRequest(request: Request, pathname: string, assetPath: string): Request {
  if (assetPath === pathname) return request;
  return rewriteRequest(request, assetPath);
}
