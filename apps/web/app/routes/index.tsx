import { redirect } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { listWorkspaces } from '@/app/lib/api.server';
import { readLastWorkspace, requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const workspaces = await listWorkspaces({ request, env }, token);

  if (workspaces.length === 0) throw redirect('/onboarding');

  const lastWorkspace = await readLastWorkspace(request);
  const target = workspaces.find((workspace) => workspace.slug === lastWorkspace) ?? workspaces[0]!;
  throw redirect(`/${target.slug}`);
}

export default function Home() {
  return null;
}
