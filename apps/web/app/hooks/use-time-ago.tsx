import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { useSyncExternalStore } from 'react';
import { formatDate } from '@/app/lib/utils/format';
import { timeAgo } from '@/app/lib/utils/time';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    for (const notify of listeners) notify();
  }, 60_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function currentMinute() {
  return Math.floor(Date.now() / 60_000);
}

export function useTimeAgo(iso: string): string {
  useSyncExternalStore(subscribe, currentMinute, currentMinute);
  return timeAgo(iso);
}

export function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const TIME_TOOLTIP_DELAY = 150;

function ExactTimeTooltip({ at, children }: { at: string; children: string }) {
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger
          render={
            <time dateTime={at} className='cursor-default'>
              {children}
            </time>
          }
        />
        <TooltipContent>{exactTime(at)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TimeAgo({ at }: { at: string }) {
  return <ExactTimeTooltip at={at}>{useTimeAgo(at)}</ExactTimeTooltip>;
}

export function Time({ at }: { at: string }) {
  return <ExactTimeTooltip at={at}>{formatDate(at)}</ExactTimeTooltip>;
}
