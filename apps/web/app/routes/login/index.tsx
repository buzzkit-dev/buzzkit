import { cloudflareContext } from '@/app/cloudflare';
import type { AuthHandle } from '@/app/components/auth/shell';
import { requireAnonymous, safeRedirect } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Sign in · BuzzKit' }];
}

export const handle: AuthHandle = {
  auth: {
    mode: 'login',
    title: 'Sign in to BuzzKit',
    description: 'Push, email and more, from one code-first API.',
    footer: { text: 'New to BuzzKit?', label: 'Create an account', to: '/signup' },
  },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  requireAnonymous(request);
  const url = new URL(request.url);
  return {
    apiUrl: env.API_URL,
    providers: { github: Boolean(env.GITHUB_CLIENT_ID) },
    redirectTo: safeRedirect(url.searchParams.get('redirect'), '/'),
    error: url.searchParams.get('error') === 'github' ? ('github' as const) : null,
  };
}

export default function LoginRoute() {
  return null;
}
