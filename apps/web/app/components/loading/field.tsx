import { Input } from '@buzzkit/ui/components/input';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { cn } from '@buzzkit/ui/lib/utils';

function ControlSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden className={cn('relative flex w-full', className)}>
      {children}
      <Skeleton className='absolute inset-0 rounded-xl' />
    </span>
  );
}

export function InputSkeleton({ className }: { className?: string }) {
  return (
    <ControlSkeleton className={className}>
      <Input className='invisible' tabIndex={-1} readOnly />
    </ControlSkeleton>
  );
}

export function TextareaSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <ControlSkeleton>
      <Textarea className={cn('invisible resize-none', className)} rows={rows} tabIndex={-1} readOnly />
    </ControlSkeleton>
  );
}
