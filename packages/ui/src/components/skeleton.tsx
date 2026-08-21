import { cn } from '@buzzkit/ui/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot='skeleton' className={cn('animate-pulse rounded-sm bg-bg-4', className)} {...props} />
  );
}

export { Skeleton };
