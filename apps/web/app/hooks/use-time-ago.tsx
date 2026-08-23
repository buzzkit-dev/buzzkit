import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { useSyncExternalStore } from 'react';
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

export const TIME_TOOLTIP_DELAY = 250;

export function TimeAgo({ at }: { at: string }) {
  const value = useTimeAgo(at);
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger render={<span className='cursor-default'>{value}</span>} />
        <TooltipContent>{exactTime(at)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
