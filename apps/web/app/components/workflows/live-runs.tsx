import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Tooltip, TooltipContent, TooltipLabel, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';

type LiveCounts = { running: number; sleeping: number; waiting: number };

const LIVE_STATUSES = [
  { status: 'running', label: 'Running', dot: 'bg-blue-4' },
  { status: 'sleeping', label: 'Sleeping', dot: 'bg-sky-4' },
  { status: 'waiting', label: 'Waiting', dot: 'bg-purple-4' },
] as const;

export function LiveRuns({ runs }: { runs: LiveCounts }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className='flex w-fit cursor-default items-center gap-3'>
            {LIVE_STATUSES.map(({ status, dot }) => (
              <span key={status} className='flex items-center gap-1.5'>
                <span
                  className={cn('size-1.5 shrink-0 rounded-full', runs[status] === 0 ? 'bg-bg-3' : dot)}
                />
                <NumberFlow
                  value={runs[status]}
                  className={cn(
                    'text-sm tabular-nums leading-none',
                    runs[status] === 0 ? 'text-fg-1' : 'font-medium text-fg-4'
                  )}
                />
              </span>
            ))}
          </span>
        }
      />
      <TooltipContent>
        <span className='flex items-center gap-1.5 whitespace-nowrap'>
          {LIVE_STATUSES.map(({ status, label }, index) => (
            <span key={status} className='flex items-center gap-1.5'>
              {index > 0 && <TooltipLabel>·</TooltipLabel>}
              <span>{runs[status]}</span>
              <TooltipLabel>{label}</TooltipLabel>
            </span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
