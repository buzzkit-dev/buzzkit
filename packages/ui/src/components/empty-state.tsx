import type { IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function EmptyState({
  icon,
  title,
  description,
  size = 'default',
  className,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  size?: 'default' | 'sm';
  className?: string;
  children?: React.ReactNode;
}) {
  const small = size === 'sm';
  return (
    <div
      data-slot='empty-state'
      data-size={size}
      className={cn(
        'flex flex-1 flex-col items-center justify-center text-center',
        small ? 'gap-2 p-6 pt-3' : 'gap-3 p-8',
        className
      )}
    >
      <IconTile icon={icon} size={small ? 'sm' : 'lg'} className='text-fg-2' />
      <div className='flex flex-col gap-0.5'>
        <h2
          className={cn(
            'text-balance font-medium text-fg-4 leading-tighter',
            small ? 'text-sm' : 'text-base'
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn('max-w-md text-pretty text-fg-2', small ? 'text-xs' : 'text-sm')}>{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export { EmptyState };
