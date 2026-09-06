import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useState } from 'react';
import {
  data,
  Link,
  Navigate,
  Outlet,
  type ShouldRevalidateFunctionArgs,
  useLocation,
  useMatches,
} from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { NoAccessNotice } from '@/app/components/errors/no-access';
import { NotFoundNotice } from '@/app/components/errors/not-found';
import { Sidebar } from '@/app/components/layout/sidebar';
import type { PageHandle } from '@/app/components/loading/handle';
import { KnownRoleProvider } from '@/app/hooks/use-known-role';
import { workspaceAction } from '@/app/lib/actions/workspace.server';
import {
  ApiError,
  getProfile,
  getWorkspace,
  listCredentials,
  listTenants,
  listWorkspaces,
  type Profile,
  type RequestContext,
  type Tenant,
  type Workspace,
} from '@/app/lib/api.server';
import { type Channel, connectedChannels } from '@/app/lib/channels';
import {
  lastWorkspaceCookie,
  readLastWorkspace,
  readRoleHint,
  requireSession,
  resolveTenant,
  roleHintCookie,
  tenantCookie,
} from '@/app/lib/session.server';
import { recallPage, rememberPage } from '@/app/lib/utils/stale';
import type { Route } from './+types/layout';

const TENANT_PAGES = [
  '',
  '/workflows',
  '/subscribers',
  '/segments',
  '/topics',
  '/messages',
  '/events',
  '/settings/channels',
];

export type WorkspaceOutletContext = {
  workspace: Workspace;
  tenantSlug: string;
  profile: Profile;
  apiUrl: string;
  connected: Channel[];
  tenant: Tenant;
  tenants: Tenant[];
};

type Chrome = {
  workspace: Workspace;
  workspaces: Workspace[];
  profile: Profile;
  connected: Channel[];
  tenant: Tenant;
  tenants: Tenant[];
  needsOnboarding: boolean;
};

type WorkspaceList = Awaited<ReturnType<typeof listWorkspaces>>;

type ChromeOutcome = { chrome: Chrome; failure: null } | { chrome: null; failure: 403 | 404 };

export function meta() {
  return [{ title: 'BuzzKit' }];
}

async function resolveChrome(
  ctx: RequestContext,
  token: string,
  slug: string,
  requested: string,
  listed: WorkspaceList | null
): Promise<ChromeOutcome> {
  try {
    const [workspace, workspaces, profile, tenants, requestedCredentials] = await Promise.all([
      getWorkspace(ctx, token, slug),
      listed ?? listWorkspaces(ctx, token),
      getProfile(ctx, token),
      listTenants(ctx, token, slug),
      listCredentials(ctx, token, slug, requested).catch((error: unknown) => {
        if (error instanceof ApiError) return null;
        throw error;
      }),
    ]);
    const tenant =
      tenants.find((entry) => entry.slug === requested) ??
      tenants.find((entry) => entry.isDefault) ??
      tenants[0]!;
    let credentials = tenant.slug === requested ? requestedCredentials : null;
    if (!credentials) credentials = await listCredentials(ctx, token, slug, tenant.slug);

    return {
      chrome: {
        workspace,
        workspaces,
        profile,
        connected: connectedChannels(credentials),
        tenant,
        tenants,
        needsOnboarding: tenant.isDefault && credentials.length === 0,
      },
      failure: null,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return { chrome: null, failure: error.status };
    }
    throw error;
  }
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const requested = await resolveTenant(request, params.slug);

  const responseHeaders = new Headers();
  if ((await readLastWorkspace(request)) !== params.slug) {
    responseHeaders.append('Set-Cookie', await lastWorkspaceCookie(env, params.slug));
  }
  const chosen = await tenantCookie(env, request, params.slug, requested);
  if (chosen) responseHeaders.append('Set-Cookie', chosen);

  let role = await readRoleHint(request, params.slug);
  let listed: WorkspaceList | null = null;
  if (role === null) {
    listed = await listWorkspaces({ request, env }, token);
    role = listed.find((entry) => entry.slug === params.slug)?.role ?? null;
    if (role) responseHeaders.append('Set-Cookie', await roleHintCookie(env, request, params.slug, role));
  }

  return data(
    {
      slug: params.slug,
      tenant: requested,
      role,
      apiUrl: env.API_URL,
      outcome: resolveChrome({ request, env }, token, params.slug, requested, listed),
    },
    { headers: responseHeaders }
  );
}

export function shouldRevalidate({
  currentParams,
  currentUrl,
  nextParams,
  nextUrl,
  formMethod,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod !== undefined && formMethod !== 'GET') return true;
  if (currentParams.slug !== nextParams.slug) return true;
  const requested = nextUrl.searchParams.get('tenant');
  if (requested === null) return false;
  return requested !== currentUrl.searchParams.get('tenant');
}

export const action = workspaceAction;

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

function resolveSidebar(slug: string, chrome: Chrome | null, last: Chrome | null) {
  if (chrome) {
    return {
      workspace: chrome.workspace,
      workspaces: chrome.workspaces,
      profile: chrome.profile,
      tenant: chrome.tenant,
      tenants: chrome.tenants,
    };
  }
  return {
    workspace: last?.workspaces.find((entry) => entry.slug === slug) ?? null,
    workspaces: last?.workspaces ?? [],
    profile: last?.profile ?? null,
    tenant: null,
    tenants: [],
  };
}

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const route = useMatches().at(-1)?.handle as PageHandle | undefined;
  const { slug, tenant: requested, role, apiUrl, outcome } = loaderData;
  const [settled, setSettled] = useState<{ outcome: Promise<ChromeOutcome>; value: ChromeOutcome } | null>(
    null
  );
  const live = settled?.outcome === outcome ? settled.value : null;
  const cached = recallPage<Chrome>(`layout:${slug}`) ?? null;
  const last = recallPage<Chrome>('layout:last') ?? null;
  const chrome = live?.chrome ?? cached;
  const sidebar = resolveSidebar(slug, chrome, last);
  const base = `/${slug}`;
  const tenantPage = TENANT_PAGES.some(
    (page) => pathname === `${base}${page}` || (page !== '' && pathname.startsWith(`${base}${page}/`))
  );
  const viewingTenant = requested !== 'default' && tenantPage;
  const tenantName = chrome && chrome.tenant.slug === requested ? chrome.tenant.name : null;

  useEffect(() => {
    let active = true;
    void outcome.then((value) => {
      if (active) setSettled({ outcome, value });
    });
    return () => {
      active = false;
    };
  }, [outcome]);

  useEffect(() => {
    if (!live?.chrome) return;
    rememberPage(`layout:${slug}`, live.chrome);
    rememberPage('layout:last', live.chrome);
  }, [live, slug]);

  if (live?.chrome?.needsOnboarding) return <Navigate to={`${base}/onboarding`} replace />;

  return (
    <div className='flex h-svh bg-background-subtle'>
      <a
        href='#content'
        className='corner-superellipse/1.125 sr-only z-50 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4'
      >
        Skip to content
      </a>

      <Sidebar slug={slug} {...sidebar} />

      <main
        id='content'
        className={cn('flex min-w-0 flex-1 flex-col gap-2 p-2 pl-0', viewingTenant && 'pt-3')}
      >
        {viewingTenant && (
          <div className='corner-superellipse/1.125 flex h-8 shrink-0 items-center gap-2 rounded-xl bg-amber-4/10 pr-1 pl-3 text-amber-4 text-sm'>
            <Icon name='IconBuildingsFilled' className='size-4 shrink-0 opacity-90' />
            <span className='min-w-0 flex-1 truncate'>
              Viewing tenant{' '}
              {tenantName ? (
                <span className='font-medium'>{tenantName}</span>
              ) : (
                <Skeleton className='inline-block h-3.5 w-16 bg-amber-4/20 align-middle' />
              )}
              . Its subscribers, topics, messages and credentials are isolated from every other tenant.
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
        <div className='corner-superellipse/1.125 flex min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-card px-8.5 pt-7.5 shadow-sm'>
          <div className='flex flex-1 flex-col pb-7.5'>
            {chrome ? (
              <Outlet
                context={
                  {
                    workspace: chrome.workspace,
                    tenantSlug: requested,
                    profile: chrome.profile,
                    apiUrl,
                    connected: chrome.connected,
                    tenant: chrome.tenant,
                    tenants: chrome.tenants,
                  } satisfies WorkspaceOutletContext
                }
              />
            ) : live?.failure === 404 ? (
              <NotFoundNotice />
            ) : live?.failure === 403 ? (
              <NoAccessNotice />
            ) : (
              <KnownRoleProvider role={sidebar.workspace?.role ?? role}>{route?.skeleton}</KnownRoleProvider>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
