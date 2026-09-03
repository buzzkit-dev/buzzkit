import { Badge } from '@buzzkit/ui/components/badge';
import type { IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { NavigationMenuLink } from '@buzzkit/ui/components/navigation-menu';
import { SlidingHighlight, useSlidingHighlight } from './SlidingHighlight';

interface MenuItem {
  label: string;
  href?: string;
  blurb: string;
  icon: string;
  soon?: boolean;
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export function MenuPanel({
  label,
  groups,
  columns,
}: {
  label: string;
  groups: MenuGroup[];
  columns: 1 | 2;
}) {
  const slider = useSlidingHighlight<HTMLElement>();
  return (
    <nav
      ref={slider.containerRef}
      aria-label={label}
      onMouseLeave={slider.clear}
      className={`relative grid gap-x-6 gap-y-5 p-3 ${columns === 2 ? 'w-[640px] grid-cols-2' : 'w-80 grid-cols-1'}`}
    >
      <SlidingHighlight highlight={slider.highlight} pressed={slider.pressed} />
      {groups.map((group) => (
        <div key={group.label} className='flex flex-col gap-0.5'>
          <span className='px-2.5 pt-1 pb-1.5 font-medium text-fg-2 text-xs'>{group.label}</span>
          {group.items.map((item) =>
            item.soon ? (
              <div
                key={item.label}
                aria-disabled='true'
                className='relative z-10 flex items-start gap-3 rounded-xl px-2.5 py-2 text-fg-2'
              >
                <IconTile icon={item.icon as IconName} size='sm' className='text-fg-1' />
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='flex items-center gap-2 font-medium text-fg-3 text-sm leading-tighter'>
                    {item.label}
                    <Badge size='sm'>Soon</Badge>
                  </span>
                  <span className='text-fg-1 text-xs leading-tighter text-pretty'>{item.blurb}</span>
                </span>
              </div>
            ) : (
              <NavigationMenuLink
                key={item.href}
                href={item.href}
                className='relative z-10 items-start gap-3 rounded-xl px-2.5 py-2 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent'
                onMouseEnter={(event) => slider.move(event.currentTarget)}
                onFocus={(event) => slider.move(event.currentTarget)}
                onMouseDown={slider.press}
                onMouseUp={slider.release}
              >
                <IconTile icon={item.icon as IconName} size='sm' className='text-fg-2' />
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='font-medium text-fg-4 text-sm leading-tighter'>{item.label}</span>
                  <span className='text-fg-2 text-xs leading-tighter text-pretty'>{item.blurb}</span>
                </span>
              </NavigationMenuLink>
            )
          )}
        </div>
      ))}
    </nav>
  );
}
