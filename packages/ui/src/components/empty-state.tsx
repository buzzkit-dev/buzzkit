import type { IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot='empty-state'
      className={cn('flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center', className)}
    >
      <IconTile icon={icon} size='lg' className='text-fg-2' />
      <div className='flex flex-col gap-0.5'>
        <h2 className='text-balance font-medium text-base text-fg-4 leading-tighter'>{title}</h2>
        {description && <p className='max-w-md text-pretty text-fg-2 text-sm'>{description}</p>}
      </div>
      {children}
    </div>
  );
}

export { EmptyState };
