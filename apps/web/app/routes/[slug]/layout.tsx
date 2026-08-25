import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { data, Link, Outlet, redirect, useLocation } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { Sidebar } from '@/app/components/layout/sidebar';
import { workspaceAction } from '@/app/lib/actions/workspace.server';
import {
  ApiError,
  getProfile,
  getWorkspace,
  listCredentials,
  listTenants,
  listWorkspaces,
  type Profile,
  type Tenant,
  type Workspace,
} from '@/app/lib/api.server';
import { type Channel, connectedChannels } from '@/app/lib/channels';
import {
  lastWorkspaceCookie,
  readLastWorkspace,
  requireSession,
  resolveTenant,
  tenantCookie,
} from '@/app/lib/session.server';
import type { Route } from './+types/layout';

export type WorkspaceOutletContext = {
  workspace: Workspace;
  profile: Profile;
  apiUrl: string;
  connected: Channel[];
  tenant: Tenant;
  tenants: Tenant[];
};

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.workspace.name} · BuzzKit` : 'BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };

  try {
    const requested = await resolveTenant(request, params.slug);
    const [workspace, workspaces, profile, tenants] = await Promise.all([
      getWorkspace(ctx, token, params.slug),
      listWorkspaces(ctx, token),
      getProfile(ctx, token),
      listTenants(ctx, token, params.slug),
    ]);
    const tenant =
      tenants.find((entry) => entry.slug === requested) ??
      tenants.find((entry) => entry.isDefault) ??
      tenants[0]!;
    const credentials = await listCredentials(ctx, token, params.slug, tenant.slug);
    if (tenant.isDefault && credentials.length === 0) throw redirect(`/${params.slug}/onboarding`);

    const payload = {
      workspace,
      workspaces,
      profile,
      apiUrl: env.API_URL,
      connected: connectedChannels(credentials),
      tenant,
      tenants,
    };

    const headers = new Headers();
    if ((await readLastWorkspace(request)) !== params.slug) {
      headers.append('Set-Cookie', await lastWorkspaceCookie(env, params.slug));
    }
    const chosen = await tenantCookie(env, request, params.slug, tenant.slug);
    if (chosen) headers.append('Set-Cookie', chosen);
    return data(payload, { headers });
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

const TENANT_PAGES = [
  '',
  '/campaigns',
  '/workflows',
  '/subscribers',
  '/segments',
  '/topics',
  '/messages',
  '/settings/channels',
];

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  const { workspace, workspaces, profile, apiUrl, connected, tenant, tenants } = loaderData;
  const { pathname } = useLocation();
  const base = `/${workspace.slug}`;
  const tenantPage = TENANT_PAGES.some(
    (page) => pathname === `${base}${page}` || (page !== '' && pathname.startsWith(`${base}${page}/`))
  );
  const viewingTenant = !tenant.isDefault && tenantPage;
  return (
    <div className='flex h-svh bg-background-subtle'>
      <a
        href='#content'
        className='corner-superellipse/1.125 sr-only z-50 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4'
      >
        Skip to content
      </a>

      <Sidebar
        workspace={workspace}
        workspaces={workspaces}
        profile={profile}
        tenant={tenant}
        tenants={tenants}
      />

      <main
        id='content'
        className={cn('flex min-w-0 flex-1 flex-col gap-2 p-2 pl-0', viewingTenant && 'pt-3')}
      >
        {viewingTenant && (
          <div className='corner-superellipse/1.125 flex h-8 shrink-0 items-center gap-2 rounded-xl bg-amber-4/10 pr-1 pl-3 text-amber-4 text-sm'>
            <Icon name='IconBuildingsFilled' className='size-4 shrink-0 opacity-90' />
            <span className='min-w-0 flex-1 truncate'>
              Viewing tenant <span className='font-medium'>{tenant.name}</span>. Its subscribers, topics,
              messages and credentials are isolated from every other tenant.
            </span>
            <Button
              variant='ghost'
              size='xs'
              className='text-amber-4 not-disabled:hover:text-amber-4 not-disabled:hover:before:bg-amber-4/15 not-disabled:active:text-amber-4 not-disabled:active:before:bg-amber-4/20'
              nativeButton={false}
              render={<Link to='?tenant=default' />}
            >
              Back to default
            </Button>
          </div>
        )}
        <div className='corner-superellipse/1.125 flex min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-card px-8.5 py-7.5 shadow-sm'>
          <Outlet
            context={
              { workspace, profile, apiUrl, connected, tenant, tenants } satisfies WorkspaceOutletContext
            }
          />
        </div>
      </main>
    </div>
  );
}
