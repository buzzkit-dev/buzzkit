import { Button } from '@buzzkit/ui/components/button';
import type { IconName } from '@buzzkit/ui/components/icon';
import { Skeleton } from '@buzzkit/ui/components/skeleton';

export function ButtonSkeleton({
  label,
  icon,
  size,
}: {
  label: string;
  icon?: IconName;
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  return (
    <span aria-hidden className='relative inline-flex shrink-0'>
      <Button icon={icon} size={size} className='invisible' tabIndex={-1}>
        {label}
      </Button>
      <Skeleton
        className={
          size === 'xs' || size === 'sm' ? 'absolute inset-0 rounded-[10px]' : 'absolute inset-0 rounded-xl'
        }
      />
    </span>
  );
}
