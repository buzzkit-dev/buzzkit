import { createRequestHandler, RouterContextProvider } from 'react-router';
import { cloudflareContext } from '../app/cloudflare';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE
);

const MARKETING_HOST = 'buzzkit.dev';
const MARKETING_PATHS = new Set(['/', '/api', '/buzz']);

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === MARKETING_HOST && MARKETING_PATHS.has(url.pathname))
      return env.MARKETING.fetch(request);

    const routerContext = new RouterContextProvider();
    routerContext.set(cloudflareContext, { env, ctx });
    return requestHandler(request, routerContext);
  },
} satisfies ExportedHandler<Env>;
