import { Badge } from '@buzzkit/ui/components/badge';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { Kbd, KbdGroup } from '@buzzkit/ui/components/kbd';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { useHoverCapable } from '@buzzkit/ui/hooks/use-hover-capable';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AccountMenu } from '@/app/components/layout/account-menu';
import { NAVIGATION, type NavigationPage, type NavigationSection } from '@/app/components/layout/navigation';
import { WorkspaceAvatar, WorkspaceSwitcher } from '@/app/components/layout/workspace-switcher';
import { useCommandKey } from '@/app/hooks/use-commands';
import type { Profile, Tenant, Workspace } from '@/app/lib/api.server';

const QUICKSTART_ICON: IconName = 'IconRocketFilled';

const unfold = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const fold = { type: 'spring', duration: 0.2, bounce: 0 } as const;

export function SwitcherPlaceholder({ slug }: { slug: string }) {
  return (
    <div aria-hidden className='flex h-8 w-full items-center gap-2 rounded-xl pr-2.5 pl-1.25 text-sm'>
      <WorkspaceAvatar slug={slug} />
      <Skeleton className='h-3.5 w-24' />
      <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
    </div>
  );
}

export function AccountPlaceholder() {
  return (
    <div aria-hidden className='flex h-8 w-full items-center gap-2 rounded-xl pr-2.5 pl-1.25 text-sm'>
      <Skeleton className='size-6 rounded-full' />
      <Skeleton className='h-3.5 w-20' />
      <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
    </div>
  );
}

export function SidebarNavigation({
  base,
  navigation,
  label,
  quickstart = false,
  onSearch,
}: {
  base: string;
  navigation: NavigationSection[];
  label: string;
  quickstart?: boolean;
  onSearch?: () => void;
}) {
  const { pathname } = useLocation();
  const hoverable = useHoverCapable();
  const commandKey = useCommandKey();
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

  const hover = (key: string | null) => {
    if (hoverable) setHovered(key);
  };

  const release = (event: React.MouseEvent<HTMLElement>) => event.currentTarget.blur();

  return (
    <nav
      ref={rootRef}
      aria-label={label}
      className='relative isolate flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-2.5'
      onPointerLeave={() => hover(null)}
    >
      <div
        ref={indicatorRef}
        aria-hidden
        className='corner-superellipse/1.125 pointer-events-none absolute top-0 left-0 -z-10 rounded-xl bg-bg-a2/70 opacity-0'
        style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
      />
      {navigation.map((section, sectionIndex) => (
        <div key={section.label ?? 'top'} className='flex flex-col gap-0.5'>
          {sectionIndex === 0 && onSearch && (
            <button
              type='button'
              data-highlighted={hovered === 'search' ? '' : undefined}
              onPointerEnter={() => hover('search')}
              onClick={(event) => {
                event.currentTarget.blur();
                hover(null);
                onSearch();
              }}
              className={cn(
                'corner-superellipse/1.125 mb-2.5 flex h-8 cursor-pointer items-center gap-2 rounded-xl pr-2 pl-2 font-medium text-fg-2 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-2 data-indicator-here:text-fg-4',
                '[&>svg:first-child]:transition-opacity [&>svg:first-child]:duration-200 [&[data-indicator-here]>svg:first-child]:opacity-85'
              )}
            >
              <Icon name='IconMagnifyingGlass' className='size-4.5' />
              <span className='truncate'>Search</span>
              <KbdGroup className='ml-auto'>
                <Kbd>{commandKey}</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </button>
          )}
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
            const pageLabel = (
              <>
                {page.icon && (
                  <Icon
                    name={page.path === '' && quickstart ? QUICKSTART_ICON : page.icon}
                    className={cn('size-4.5', active && 'opacity-85')}
                  />
                )}
                <span className='truncate'>{page.path === '' && quickstart ? 'Quickstart' : page.label}</span>
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
                    onPointerEnter={() => hover(key)}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      setOpened((current) => ({ ...current, [page.path]: !open }));
                    }}
                    className={cn(rowClass, 'cursor-pointer pr-2')}
                  >
                    {pageLabel}
                    <Icon
                      name='IconChevronRightMedium'
                      className={cn('ml-auto size-4 transition-transform duration-150', open && 'rotate-90')}
                    />
                  </button>
                ) : page.soon ? (
                  <div aria-disabled className={rowClass}>
                    {pageLabel}
                  </div>
                ) : (
                  <Link
                    to={`${base}${page.path}`}
                    prefetch='intent'
                    onClick={release}
                    aria-current={active ? 'page' : undefined}
                    data-highlighted={highlighted ? '' : undefined}
                    onPointerEnter={() => hover(key)}
                    className={rowClass}
                  >
                    {pageLabel}
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
                                onClick={release}
                                aria-current={isCurrent(page, child) ? 'page' : undefined}
                                data-highlighted={childHighlighted ? '' : undefined}
                                onPointerEnter={() => hover(child.path)}
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
  );
}

export function Sidebar({
  slug,
  workspace,
  workspaces,
  profile,
  admin,
  supporting,
  tenant,
  tenants,
  quickstart = false,
  onSearch,
  className,
}: {
  slug: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  profile: Profile | null;
  admin: boolean;
  supporting: boolean;
  tenant: Tenant | null;
  tenants: Tenant[];
  quickstart?: boolean;
  onSearch?: () => void;
  className?: string;
}) {
  return (
    <aside className={cn('flex w-60 shrink-0 flex-col gap-0.5 px-3 pt-3 pb-2', className)}>
      {workspace ? (
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={workspace}
          tenant={tenant}
          tenants={tenants}
          supporting={supporting}
        />
      ) : (
        <SwitcherPlaceholder slug={slug} />
      )}

      <SidebarNavigation
        base={`/${slug}`}
        navigation={NAVIGATION}
        label='Workspace'
        quickstart={quickstart}
        onSearch={onSearch}
      />

      {profile ? <AccountMenu profile={profile} admin={admin} variant='row' /> : <AccountPlaceholder />}
    </aside>
  );
}
