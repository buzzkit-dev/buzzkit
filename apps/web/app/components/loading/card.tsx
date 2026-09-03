import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { cn } from '@buzzkit/ui/lib/utils';

const PLACEHOLDER_LINES = ['a', 'b', 'c', 'd', 'e', 'f'];

export function CardSkeleton({
  title,
  description,
  lines = 3,
  className,
}: {
  title: string;
  description?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader divider>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className='gap-3 pt-3.5'>
        {PLACEHOLDER_LINES.slice(0, lines).map((line) => (
          <Skeleton key={line} className='h-4 w-full' />
        ))}
      </CardContent>
    </Card>
  );
}

export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('bg-bg-3', className ?? 'h-40 w-full rounded-2xl')} />;
}
