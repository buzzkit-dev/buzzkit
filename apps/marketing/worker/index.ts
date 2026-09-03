import { decorate } from './headers';
import { acceptsHtml, prefersMarkdown, resolveMarkdownPath } from './negotiation';
import { resolveAssetPath, resolveAssetRequest, resolveDocsRedirect, rewriteRequest } from './routing';
import { hasSession, markSignedIn } from './session';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const docsTarget = resolveDocsRedirect(url.pathname);
    if (docsTarget) return Response.redirect(`${docsTarget}${url.search}`, 301);

    const agentMode = url.searchParams.get('mode') === 'agent';
    const markdownPath = agentMode ? '/llms.txt' : resolveMarkdownPath(url.pathname);

    if (markdownPath && (agentMode || prefersMarkdown(request))) {
      const markdown = await env.ASSETS.fetch(rewriteRequest(request, markdownPath));
      if (markdown.ok) {
        const response = decorate(markdown, markdownPath);
        response.headers.set('Content-Location', markdownPath);
        return response;
      }
    }

    const assetPath = resolveAssetPath(url.pathname);
    const response = await env.ASSETS.fetch(resolveAssetRequest(request, url.pathname, assetPath));
    if (response.status === 404 && (prefersMarkdown(request) || !acceptsHtml(request))) {
      const missing = await env.ASSETS.fetch(new Request(new URL('/404.md', url.origin)));
      return decorate(new Response(missing.body, { status: 404, headers: missing.headers }), '/404.md');
    }
    const decorated = decorate(response, assetPath);
    return hasSession(request) ? markSignedIn(decorated) : decorated;
  },
};
