import { Icon } from '@buzzkit/ui/components/icon';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { iconSwapMotion } from '@buzzkit/ui/lib/icon-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';

export type StepState = 'upcoming' | 'active' | 'done';

export function GuideStep({
  number,
  title,
  state,
  waiting,
  onSelect,
  children,
}: {
  number: number;
  title: string;
  state: StepState;
  waiting?: string;
  onSelect?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex gap-3.5 transition-opacity duration-200',
        state === 'upcoming' && 'opacity-60 hover:opacity-100'
      )}
      data-state={state}
    >
      <StepMarker number={number} done={state === 'done'} active={state === 'active'} />
      <div className='flex min-w-0 flex-1 flex-col gap-2 pt-0.5'>
        <h3 className='flex items-center justify-between gap-2 font-medium text-fg-4 text-sm leading-tighter'>
          {onSelect ? (
            <button
              type='button'
              onClick={onSelect}
              className='-m-1 cursor-pointer rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-2'
            >
              {title}
              {state === 'done' && <span className='sr-only'> (done)</span>}
              {state === 'active' && <span className='sr-only'> (current step)</span>}
            </button>
          ) : (
            <span>
              {title}
              {state === 'done' && <span className='sr-only'> (done)</span>}
              {state === 'active' && <span className='sr-only'> (current step)</span>}
            </span>
          )}
          <AnimatePresence initial={false}>
            {state === 'active' && waiting && (
              <motion.span
                aria-hidden
                {...iconSwapMotion}
                className='flex shrink-0 items-center gap-1.5 text-fg-2 text-xs'
              >
                <LivePing />
                {waiting}
              </motion.span>
            )}
          </AnimatePresence>
        </h3>
        {children}
      </div>
    </div>
  );
}

export function StepMarker({ number, done, active }: { number: number; done: boolean; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-6 shrink-0 select-none items-center justify-center rounded-full transition-colors duration-300',
        done ? 'bg-green-1' : active ? 'bg-primary-4' : 'bg-bg-2'
      )}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={done ? 'check' : 'number'}
          className='absolute inset-0 flex items-center justify-center'
          {...iconSwapMotion}
        >
          {done ? (
            <Icon name='IconCheckmark1' className='size-3.5 rotate-[4deg] text-green-4 opacity-100' />
          ) : (
            <span
              className={cn(
                'font-medium text-xs tabular-nums',
                active ? 'text-primary-foreground' : 'text-fg-3'
              )}
            >
              {number}
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
