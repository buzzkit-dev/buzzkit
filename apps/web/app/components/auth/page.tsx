import {
  type Notification,
  NotificationCard,
  SAMPLE_NOTIFICATIONS,
} from '@buzzkit/ui/components/notification';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const SLOTS = [
  { id: 'left-top', side: 'left', x: 0, y: 0, rotate: -3 },
  { id: 'left-bottom', side: 'left', x: 20, y: 104, rotate: 2 },
  { id: 'right-top', side: 'right', x: 0, y: 0, rotate: 3 },
  { id: 'right-bottom', side: 'right', x: 20, y: 104, rotate: -2 },
] as const;

const SCATTER = [
  { id: 'a', className: '-top-6 -left-24 rotate-[-6deg]', sample: 3 },
  { id: 'b', className: 'top-10 -right-28 rotate-[5deg]', sample: 4 },
  { id: 'c', className: '-bottom-4 -left-20 rotate-[4deg]', sample: 1 },
  { id: 'd', className: '-right-24 bottom-12 rotate-[-5deg]', sample: 2 },
] as const;

const SWAP_INTERVAL_MS = 4000;
const STACK_GAP = 'clamp(1.5rem, 6vw - 2.5rem, 10rem)';

function Stacks({ frozen }: { frozen: boolean }) {
  const [shown, setShown] = useState<Notification[]>(() => SAMPLE_NOTIFICATIONS.slice(0, SLOTS.length));
  const stepRef = useRef(0);

  useEffect(() => {
    if (frozen) return;
    const interval = setInterval(() => {
      const slot = stepRef.current % SLOTS.length;
      stepRef.current += 1;
      setShown((current) => {
        const visible = new Set(current.map((entry) => entry.id));
        const candidates = SAMPLE_NOTIFICATIONS.filter((entry) => !visible.has(entry.id));
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        if (!candidate) return current;
        const next = [...current];
        next[slot] = candidate;
        return next;
      });
    }, SWAP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [frozen]);

  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={
            side === 'left'
              ? 'absolute top-1/2 right-[calc(50%+14rem+var(--stack-gap))] hidden h-48 w-80 origin-right -translate-y-1/2 scale-85 lg:block xl:scale-100'
              : 'absolute top-1/2 left-[calc(50%+14rem+var(--stack-gap))] hidden h-48 w-80 origin-left -translate-y-1/2 scale-85 lg:block xl:scale-100'
          }
          style={{ '--stack-gap': STACK_GAP } as React.CSSProperties}
        >
          {SLOTS.map((slot, index) => {
            if (slot.side !== side) return null;
            const notification = shown[index]!;
            return (
              <div
                key={slot.id}
                className='absolute'
                style={{ [side === 'left' ? 'right' : 'left']: slot.x, top: slot.y }}
              >
                <AnimatePresence mode='wait' initial={!frozen}>
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, scale: 0.85, y: 10, rotate: slot.rotate }}
                    animate={{ opacity: 1, scale: 1, y: 0, rotate: slot.rotate }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  >
                    <NotificationCard notification={notification} />
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function Scatter() {
  return (
    <div className='absolute inset-0 lg:hidden'>
      {SCATTER.map((slot) => (
        <div key={slot.id} className={`absolute scale-75 opacity-16 ${slot.className}`}>
          <NotificationCard notification={SAMPLE_NOTIFICATIONS[slot.sample]!} />
        </div>
      ))}
    </div>
  );
}

export function AuthPage({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <main className='relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden p-6'>
      <div className='pointer-events-none absolute inset-0 -z-10' aria-hidden='true'>
        <div className='absolute inset-0 bg-linear-to-b from-brand-1 via-background to-background' />
        <div className='absolute inset-x-0 top-0 h-80 bg-radial-[at_50%_0%] from-brand-2/70 to-70% to-transparent' />
        <Scatter />
        <Stacks frozen={reducedMotion === true} />
      </div>
      <div className='flex w-full max-w-md flex-col items-center'>{children}</div>
    </main>
  );
}
