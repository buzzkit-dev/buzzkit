import { cloudflareContext } from '@/app/cloudflare';
import { requireAnonymous, safeRedirect } from '@/app/lib/session.server';
import type { AuthHandle } from '@/app/routes/(auth)/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Create account · BuzzKit' }];
}

export const handle: AuthHandle = {
  auth: {
    mode: 'signup',
    title: 'Create your account',
    description: 'Push, email and more, from one code-first API.',
    footer: { text: 'Already have an account?', label: 'Sign in', to: '/login' },
  },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAnonymous(request, env);
  const url = new URL(request.url);
  return {
    apiUrl: env.API_URL,
    providers: { github: Boolean(env.GITHUB_CLIENT_ID) },
    redirectTo: safeRedirect(url.searchParams.get('redirect'), '/onboarding'),
    error: url.searchParams.get('error') === 'github' ? ('github' as const) : null,
  };
}

export default function SignupRoute() {
  return null;
}
