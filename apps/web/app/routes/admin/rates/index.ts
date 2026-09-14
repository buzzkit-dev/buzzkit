import { cloudflareContext } from '@/app/cloudflare';
import { getPlatformRates } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  return await getPlatformRates({ request, env }, token);
}
