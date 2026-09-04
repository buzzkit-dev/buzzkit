import { data } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import designMarkdown from '../../../../../docs/design.md?raw';
import type { Route } from './+types/index';

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (env.ENVIRONMENT !== 'development') throw data(null, { status: 404 });

  return new Response(designMarkdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
