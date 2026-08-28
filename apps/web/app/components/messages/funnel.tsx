import {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger,
} from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import { TIME_TOOLTIP_DELAY } from '@/app/hooks/use-time-ago';
import type { Message } from '@/app/lib/api.server';

const FUNNEL_TONES = {
  sent: 'bg-green-4',
  failed: 'bg-red-4',
  pending: 'bg-amber-4',
} as const;

function describeSchedule(schedule: unknown): React.ReactNode {
  const { at, timezone } = (schedule ?? {}) as { at?: string; timezone?: string };
  if (!at) return 'Waiting for its scheduled time';
  const zone = timezone === 'subscriber' ? 'local time' : (timezone ?? 'UTC').replace(/_/g, ' ');
  return (
    <span className='whitespace-nowrap'>
      <TooltipLabel>Scheduled for</TooltipLabel> {at.replace('T', ' ')} <TooltipLabel>{zone}</TooltipLabel>
    </span>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone?: 'green' | 'red' | 'amber' }) {
  const color =
    value === 0 || !tone
      ? undefined
      : tone === 'green'
        ? 'text-green-4'
        : tone === 'red'
          ? 'text-red-4'
          : 'text-amber-4';
  return (
    <span className={color}>
      {value} <TooltipLabel className={color}>{label}</TooltipLabel>
    </span>
  );
}

export function Funnel({
  counts,
  status,
  schedule,
  className,
}: {
  counts: Message['counts'];
  status: Message['status'];
  schedule?: unknown;
  className?: string;
}) {
  const { total, sent, failed, invalid, pending } = counts;
  const width = (value: number) => (total === 0 ? '0%' : `${(value / total) * 100}%`);
  const summary =
    total > 0 ? (
      <span className='flex items-center gap-1.5 whitespace-nowrap'>
        <Count value={total} label='reachable' />
        <TooltipLabel>·</TooltipLabel>
        <Count value={sent} label='sent' tone='green' />
        <TooltipLabel>·</TooltipLabel>
        <Count value={failed + invalid} label='failed' tone='red' />
        <TooltipLabel>·</TooltipLabel>
        <Count value={pending} label='pending' tone='amber' />
      </span>
    ) : status === 'completed' ? (
      'No one was reachable'
    ) : status === 'scheduled' ? (
      describeSchedule(schedule)
    ) : status === 'canceled' ? (
      'Canceled before sending'
    ) : (
      'Deliveries scheduled'
    );

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
