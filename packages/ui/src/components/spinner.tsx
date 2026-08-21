import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';

type SpinnerProps = {
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
};

function Spinner({ className, 'aria-label': ariaLabel = 'Loading', ...props }: SpinnerProps) {
  return (
    <Icon
      name='IconLoadingCircle'
      data-slot='spinner'
      role='status'
      ariaLabel={ariaLabel}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
