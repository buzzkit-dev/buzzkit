import { Badge } from '@buzzkit/ui/components/badge';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { cn } from '@buzzkit/ui/lib/utils';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

const HoverContext = createContext<{ hovered: string | null; setHovered: (id: string | null) => void }>({
  hovered: null,
  setHovered: () => {},
});

export function ChoiceRows({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useAnimatedIndicator(rootRef);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (indicator && !hovered) indicator.style.opacity = '0';
    if (indicator && hovered) indicator.style.opacity = '1';
  }, [hovered, indicatorRef]);

  return (
    <HoverContext.Provider value={{ hovered, setHovered }}>
      <div ref={rootRef} className='relative isolate -mx-2' onPointerLeave={() => setHovered(null)}>
        <div
          ref={indicatorRef}
          aria-hidden
          className='corner-superellipse/1.125 pointer-events-none absolute top-0 left-0 -z-10 rounded-xl bg-bg-a2 opacity-0'
          style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
        />
        <ul className='flex flex-col gap-0.5'>{children}</ul>
      </div>
    </HoverContext.Provider>
  );
}

export function ChoiceRow({
  to,
  onClick,
  icon,
  title,
  badges = [],
  description,
  state = 'available',
}: {
  to?: string;
  onClick?: () => void;
  icon: IconName;
  title: string;
  badges?: string[];
  description: string;
  state?: 'available' | 'connected' | 'soon';
}) {
  const { hovered, setHovered } = useContext(HoverContext);
  const disabled = state === 'soon';
  const key = to ?? title;
  const body = (
    <>
      <IconTile icon={icon} />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex items-center gap-1.5'>
          <span className='truncate font-medium text-fg-4 text-sm leading-tighter'>{title}</span>
          {badges.map((badge) => (
            <Badge key={badge} size='sm'>
              {badge}
            </Badge>
          ))}
        </span>
        <span className='truncate text-fg-2 text-xs'>{description}</span>
      </span>
      <span className='flex shrink-0 items-center'>
        {state === 'connected' ? (
          <Badge variant='green' size='sm'>
            Connected
          </Badge>
        ) : state === 'soon' ? (
          <Badge size='sm'>Soon</Badge>
        ) : (
          <Icon name='IconChevronRightMedium' className='size-4 text-fg-2' />
        )}
      </span>
    </>
  );

  const className = cn(
    'corner-superellipse/1.125 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none',
    state === 'available' && 'pr-1.5',
    disabled
      ? 'cursor-not-allowed opacity-50'
      : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-2'
  );

  return (
    <li>
      {disabled ? (
        <div aria-disabled className={className}>
          {body}
        </div>
      ) : to ? (
        <Link
          to={to}
          className={className}
          data-highlighted={hovered === key ? '' : undefined}
          onPointerEnter={() => setHovered(key)}
          onFocus={() => setHovered(key)}
        >
          {body}
        </Link>
      ) : (
        <button
          type='button'
          className={className}
          data-highlighted={hovered === key ? '' : undefined}
          onPointerEnter={() => setHovered(key)}
          onFocus={() => setHovered(key)}
          onClick={onClick}
        >
          {body}
        </button>
      )}
    </li>
  );
}
