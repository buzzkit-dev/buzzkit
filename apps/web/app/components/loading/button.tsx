import { Button } from '@buzzkit/ui/components/button';
import type { IconName } from '@buzzkit/ui/components/icon';
import { Skeleton } from '@buzzkit/ui/components/skeleton';

export function ButtonSkeleton({ label, icon }: { label: string; icon?: IconName }) {
  return (
    <span aria-hidden className='relative inline-flex shrink-0'>
      <Button icon={icon} className='invisible' tabIndex={-1}>
        {label}
      </Button>
      <Skeleton className='absolute inset-0 rounded-xl' />
    </span>
  );
}
