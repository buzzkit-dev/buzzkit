import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import { TIME_TOOLTIP_DELAY } from '@/app/hooks/use-time-ago';
import type { Message } from '@/app/lib/api.server';

export const FUNNEL_TONES = {
  sent: 'bg-green-4',
  failed: 'bg-red-4',
  pending: 'bg-amber-4',
} as const;

export function Funnel({
  counts,
  status,
  className,
}: {
  counts: Message['counts'];
  status: Message['status'];
  className?: string;
}) {
  const { total, sent, failed, invalid, pending } = counts;
  const width = (value: number) => (total === 0 ? '0%' : `${(value / total) * 100}%`);
  const summary =
    total > 0
      ? `${total} reachable · ${sent} sent · ${failed + invalid} failed · ${pending} pending`
      : status === 'completed'
        ? 'No one was reachable'
        : 'Deliveries scheduled';

  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn('flex h-1.5 w-16 cursor-default overflow-hidden rounded-full bg-bg-3', className)}
            >
              <span className={cn('h-full', FUNNEL_TONES.sent)} style={{ width: width(sent) }} />
              <span
                className={cn('h-full', FUNNEL_TONES.failed)}
                style={{ width: width(failed + invalid) }}
              />
              <span className={cn('h-full', FUNNEL_TONES.pending)} style={{ width: width(pending) }} />
            </span>
          }
        />
        <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
