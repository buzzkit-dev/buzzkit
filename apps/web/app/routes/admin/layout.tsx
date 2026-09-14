import { Button } from '@buzzkit/ui/components/button';
import { Sheet, SheetContent, SheetTitle } from '@buzzkit/ui/components/sheet';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useState } from 'react';
import { Link, Outlet, redirect, type ShouldRevalidateFunctionArgs, useLocation } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { AccountMenu } from '@/app/components/layout/account-menu';
import { ADMIN_NAVIGATION } from '@/app/components/layout/navigation';
import { SidebarNavigation } from '@/app/components/layout/sidebar';
import { workspaceAction } from '@/app/lib/actions/workspace.server';
import { ApiError, getProfile, listEveryWorkspace, type Profile } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/layout';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  try {
    const [, profile] = await Promise.all([
      listEveryWorkspace({ request, env }, token, { limit: 1 }),
      getProfile({ request, env }, token),
    ]);
    return { profile };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) throw redirect('/dashboard');
    throw error;
  }
}

export function shouldRevalidate({ formMethod }: ShouldRevalidateFunctionArgs) {
  return formMethod !== undefined && formMethod !== 'GET';
}

export const action = workspaceAction;

function BackToDashboard({ className }: { className?: string }) {
  return (
    <Button
      variant='ghost'
      className={cn('justify-start pl-2 text-fg-2', className)}
      icon='IconChevronLeftMedium'
      nativeButton={false}
      render={<Link to='/dashboard' />}
    >
      Back to dashboard
    </Button>
  );
}

function AdminSidebar({ profile, className }: { profile: Profile; className?: string }) {
  return (
    <aside className={cn('flex w-60 shrink-0 flex-col gap-0.5 px-3 pt-3 pb-2', className)}>
      <BackToDashboard className='mb-2.5 w-full' />

      <SidebarNavigation base='/admin' navigation={ADMIN_NAVIGATION} label='Admin' />

      <AccountMenu profile={profile} admin variant='row' />
    </aside>
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const { profile } = loaderData;
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    setNavigationOpen(false);
  }, [pathname]);

  return (
    <div className='flex h-svh bg-background-subtle'>
      <a
        href='#content'
        className='corner-superellipse/1.125 sr-only z-50 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4'
      >
        Skip to content
      </a>

      <AdminSidebar profile={profile} className='hidden lg:flex' />

      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='bg-background-subtle data-[side=left]:w-72 lg:hidden'
        >
          <SheetTitle className='sr-only'>Navigation</SheetTitle>
          <AdminSidebar profile={profile} className='h-full w-full' />
        </SheetContent>
      </Sheet>

      <main id='content' className='flex min-w-0 flex-1 flex-col gap-2 p-2 lg:pl-0'>
        <div className='flex h-10 shrink-0 items-center gap-1 lg:hidden'>
          <Button
            variant='ghost'
            size='icon'
            icon='IconSidebar'
            aria-label='Open navigation'
            className='shrink-0 text-fg-2'
            onClick={() => setNavigationOpen(true)}
          />
          <div className='flex min-w-0 flex-1'>
            <BackToDashboard />
          </div>
          <AccountMenu profile={profile} admin />
        </div>
        <div className='corner-superellipse/1.125 flex min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-card px-4 pt-5 shadow-sm sm:px-6 sm:pt-6 lg:px-8.5 lg:pt-7.5'>
          <div className='pb-5 lg:flex lg:flex-1 lg:flex-col lg:pb-7.5'>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
