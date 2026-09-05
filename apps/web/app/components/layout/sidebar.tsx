import { Badge } from '@buzzkit/ui/components/badge';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon } from '@buzzkit/ui/components/icon';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AccountMenu } from '@/app/components/layout/account-menu';
import { NAVIGATION, type NavigationPage } from '@/app/components/layout/navigation';
import { WorkspaceAvatar, WorkspaceSwitcher } from '@/app/components/layout/workspace-switcher';
import type { Profile, Tenant, Workspace } from '@/app/lib/api.server';

const unfold = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const fold = { type: 'spring', duration: 0.2, bounce: 0 } as const;

function SwitcherPlaceholder({ slug }: { slug: string }) {
  return (
    <div aria-hidden className='flex h-8 w-full items-center gap-2 rounded-xl pr-2.5 pl-1.25 text-sm'>
      <WorkspaceAvatar slug={slug} />
      <Skeleton className='h-3.5 w-24' />
      <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
    </div>
  );
}

function AccountPlaceholder() {
  return (
    <div aria-hidden className='flex h-8 w-full items-center gap-2 rounded-xl pr-2.5 pl-1.25 text-sm'>
      <Skeleton className='size-6 rounded-full' />
      <Skeleton className='h-3.5 w-20' />
      <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
    </div>
  );
}

export function Sidebar({
  slug,
  workspace,
  workspaces,
  profile,
  tenant,
  tenants,
}: {
  slug: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  profile: Profile | null;
  tenant: Tenant | null;
  tenants: Tenant[];
}) {
  const { pathname } = useLocation();
  const base = `/${slug}`;
  const [hovered, setHovered] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLElement>(null);
  const indicatorRef = useAnimatedIndicator(rootRef);

  const isExact = (page: NavigationPage) => pathname === `${base}${page.path}`;
  const isActive = (page: NavigationPage) =>
    page.path === '' ? pathname === base : isExact(page) || pathname.startsWith(`${base}${page.path}/`);
  const isCurrent = (page: NavigationPage, child: NavigationPage) =>
    isExact(child) ||
    (child.path !== page.path && isActive(child)) ||
    (child.path === page.path &&
      isActive(page) &&
      !page.children?.some((entry) => entry.path !== page.path && isActive(entry)) &&
      !page.children?.some(isExact));

  return (
    <aside className='flex w-60 shrink-0 flex-col gap-3 px-3 pt-3 pb-2'>
      {workspace ? (
        <WorkspaceSwitcher workspaces={workspaces} current={workspace} tenant={tenant} tenants={tenants} />
      ) : (
        <SwitcherPlaceholder slug={slug} />
      )}

      <nav
        ref={rootRef}
        aria-label='Workspace'
        className='relative isolate flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto'
        onPointerLeave={() => setHovered(null)}
      >
        <div
          ref={indicatorRef}
          aria-hidden
          className='corner-superellipse/1.125 pointer-events-none absolute top-0 left-0 -z-10 rounded-xl bg-bg-a2/70 opacity-0'
          style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
        />
        {NAVIGATION.map((section) => (
          <div key={section.label ?? 'top'} className='flex flex-col gap-0.5'>
            {section.label && (
              <span className='px-2.5 pb-1 font-medium text-fg-2 text-xs'>{section.label}</span>
            )}
            {section.pages.map((page) => {
              const open = opened[page.path] ?? (isActive(page) || (page.children?.some(isActive) ?? false));
              const key = page.children ? `group:${page.path}` : page.path;
              const active = !page.children && isActive(page);
              const highlighted = hovered !== null ? hovered === key : active;
              const rowClass = cn(
                'corner-superellipse/1.125 flex h-8 items-center gap-2 rounded-xl pr-2.5 pl-2 font-medium text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-2 data-indicator-here:text-fg-4',
                '[&>svg:first-child]:transition-opacity [&>svg:first-child]:duration-200 [&[data-indicator-here]>svg:first-child]:opacity-85',
                active ? 'text-fg-4' : 'text-fg-2',
                page.soon && 'cursor-default text-fg-1'
              );
              const label = (
                <>
                  {page.icon && <Icon name={page.icon} className={cn('size-4.5', active && 'opacity-85')} />}
                  <span className='truncate'>{page.label}</span>
                  {page.soon && <Badge className='ml-auto'>Soon</Badge>}
                </>
              );
              return (
                <div key={page.path} className='flex flex-col gap-0.5'>
                  {page.children ? (
                    <button
                      type='button'
                      aria-expanded={open}
                      data-highlighted={highlighted ? '' : undefined}
                      onPointerEnter={() => setHovered(key)}
                      onClick={() => setOpened((current) => ({ ...current, [page.path]: !open }))}
                      className={cn(rowClass, 'cursor-pointer pr-2')}
                    >
                      {label}
                      <Icon
                        name='IconChevronRightMedium'
                        className={cn(
                          'ml-auto size-4 transition-transform duration-150',
                          open && 'rotate-90'
                        )}
                      />
                    </button>
                  ) : page.soon ? (
                    <div aria-disabled className={rowClass}>
                      {label}
                    </div>
                  ) : (
                    <Link
                      to={`${base}${page.path}`}
                      prefetch='intent'
                      aria-current={active ? 'page' : undefined}
                      data-highlighted={highlighted ? '' : undefined}
                      onPointerEnter={() => setHovered(key)}
                      className={rowClass}
                    >
                      {label}
                    </Link>
                  )}
                  {page.children && (
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key='children'
                          className='overflow-hidden'
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0, transition: fold }}
                          transition={unfold}
                        >
                          <div className='ml-4.75 flex flex-col gap-0.5 border-bg-3 border-l pl-1.5'>
                            {page.children.map((child) => {
                              const childHighlighted =
                                hovered !== null ? hovered === child.path : isCurrent(page, child);
                              const childClass = cn(
                                'corner-superellipse/1.125 flex h-7.5 items-center gap-2 rounded-[10px] px-2.5 font-medium text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-2 data-indicator-here:text-fg-4',
                                isCurrent(page, child) ? 'text-fg-4' : 'text-fg-2',
                                child.soon && 'cursor-default text-fg-1'
                              );
                              return child.soon ? (
                                <div key={child.path} aria-disabled className={childClass}>
                                  <span className='truncate'>{child.label}</span>
                                  <Badge className='ml-auto'>Soon</Badge>
                                </div>
                              ) : (
                                <Link
                                  key={child.path}
                                  to={`${base}${child.path}`}
                                  prefetch='intent'
                                  aria-current={isCurrent(page, child) ? 'page' : undefined}
                                  data-highlighted={childHighlighted ? '' : undefined}
                                  onPointerEnter={() => setHovered(child.path)}
                                  className={childClass}
                                >
                                  <span className='truncate'>{child.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {profile ? <AccountMenu profile={profile} variant='row' /> : <AccountPlaceholder />}
    </aside>
  );
}
