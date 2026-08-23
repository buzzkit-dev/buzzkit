import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

type NavItem = { label: string; slug: string; icon: IconName };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [{ label: 'General', slug: '', icon: 'IconSettingsSliderHorFilled' }],
  },
];

export function SettingsNav({ workspaceSlug }: { workspaceSlug: string }) {
  const { pathname } = useLocation();
  const base = `/${workspaceSlug}/settings`;
  const [hovered, setHovered] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const indicatorRef = useAnimatedIndicator(rootRef);

  return (
    <nav
      ref={rootRef}
      aria-label='Settings'
      className='-mx-2 relative isolate flex flex-col'
      onPointerLeave={() => setHovered(null)}
    >
      <div
        ref={indicatorRef}
        aria-hidden
        className='pointer-events-none absolute top-0 left-0 -z-10 rounded-lg bg-bg-a2 opacity-0'
        style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
      />
      {GROUPS.map((group, groupIndex) => (
        <div key={group.label} className='flex flex-col gap-0.5'>
          <span className={cn('px-2 pb-1 font-medium text-fg-2 text-xs', groupIndex > 0 ? 'pt-5' : 'pt-0')}>
            {group.label}
          </span>
          {group.items.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base;
            const active = pathname === href;
            const highlighted = hovered ? hovered === item.label : active;
            return (
              <Link
                key={item.label}
                to={href}
                aria-current={active ? 'page' : undefined}
                data-highlighted={highlighted ? '' : undefined}
                onPointerEnter={() => setHovered(item.label)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1 font-medium text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-2 data-indicator-here:text-fg-4',
                  '[&_svg]:transition-opacity [&_svg]:duration-200 [&[data-indicator-here]_svg]:opacity-85',
                  active ? 'text-fg-4' : 'text-fg-2'
                )}
              >
                <Icon name={item.icon} className={cn('size-4', active && 'opacity-85')} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
