import { data, Outlet, redirect } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { AccountMenu } from '@/app/components/layout/account-menu';
import { NavTabs } from '@/app/components/layout/navigation-tabs';
import { WorkspaceSwitcher } from '@/app/components/layout/workspace-switcher';
import { workspaceAction } from '@/app/lib/actions/workspace.server';
import {
  ApiError,
  getProfile,
  getWorkspace,
  listCredentials,
  listWorkspaces,
  type Profile,
  type Workspace,
} from '@/app/lib/api.server';
import { lastWorkspaceCookie, readLastWorkspace, requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/layout';

export type WorkspaceOutletContext = { workspace: Workspace; profile: Profile; apiUrl: string };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.workspace.name} · BuzzKit` : 'BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };

  try {
    const [workspace, workspaces, profile, credentials] = await Promise.all([
      getWorkspace(ctx, token, params.slug),
      listWorkspaces(ctx, token),
      getProfile(ctx, token),
      listCredentials(ctx, token, params.slug, 'default'),
    ]);
    if (credentials.length === 0) throw redirect(`/${params.slug}/onboarding`);

    const payload = { workspace, workspaces, profile, apiUrl: env.API_URL };

    if ((await readLastWorkspace(request)) !== params.slug) {
      return data(payload, { headers: { 'Set-Cookie': await lastWorkspaceCookie(env, params.slug) } });
    }
    return data(payload);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      throw data(null, { status: error.status });
    }
    throw error;
  }
}

export const action = workspaceAction;

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  const { workspace, workspaces, profile, apiUrl } = loaderData;
  return (
    <div className='flex h-svh flex-col'>
      <a
        href='#content'
        className='corner-superellipse/1.125 sr-only z-50 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4'
      >
        Skip to content
      </a>

      <header className='relative flex shrink-0 items-center justify-between px-5 pt-4 pb-3'>
        <WorkspaceSwitcher workspaces={workspaces} current={workspace} />

        <div className='-translate-x-1/2 absolute left-1/2 hidden sm:block'>
          <NavTabs slug={workspace.slug} />
        </div>

        <AccountMenu profile={profile} />
      </header>

      <div id='content' className='flex min-h-0 flex-1 overflow-x-clip px-5 pb-5'>
        <Outlet context={{ workspace, profile, apiUrl } satisfies WorkspaceOutletContext} />
      </div>
    </div>
  );
}
