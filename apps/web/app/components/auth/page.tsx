import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

type Notification =
  | { id: string; kind: 'banner'; app: string; title: string; body: string; when: string }
  | { id: string; kind: 'actions'; app: string; title: string; body: string; actions: [string, string] }
  | { id: string; kind: 'activity'; app: string; title: string; detail: string; progress: number };

const POOL: Notification[] = [
  {
    id: 'gymly',
    kind: 'banner',
    app: 'Gymly',
    title: 'Leg day',
    body: 'Let’s go. 6:00 with Maya.',
    when: 'now',
  },
  {
    id: 'nook',
    kind: 'banner',
    app: 'Nook',
    title: 'Your order shipped',
    body: 'Arrives Thursday by 6 pm.',
    when: '2m ago',
  },
  {
    id: 'ledger',
    kind: 'banner',
    app: 'Ledger',
    title: 'Invoice paid',
    body: 'Acme Studio paid $1,240.00.',
    when: '9m ago',
  },
  {
    id: 'trail',
    kind: 'banner',
    app: 'Trail',
    title: 'Storm near your route',
    body: 'Heavy rain expected after 3 pm.',
    when: 'now',
  },
  {
    id: 'dune',
    kind: 'banner',
    app: 'Dune',
    title: '3 highlights to review',
    body: 'Keep your streak at 41 days.',
    when: '1h ago',
  },
  {
    id: 'harbor',
    kind: 'banner',
    app: 'Harbor',
    title: 'Table ready',
    body: 'Head to the host stand.',
    when: 'now',
  },
  {
    id: 'pace',
    kind: 'activity',
    app: 'Pace',
    title: 'DL 214 boarding',
    detail: 'Gate B12 · departs 18:40',
    progress: 0.72,
  },
  {
    id: 'gymly-actions',
    kind: 'actions',
    app: 'Gymly',
    title: 'Rest day is over',
    body: 'Your next workout is ready.',
    actions: ['Snooze', 'Start workout'],
  },
];

const SLOTS = [
  { id: 'left-top', side: 'left', x: 0, y: 0, rotate: -3 },
  { id: 'left-bottom', side: 'left', x: 20, y: 104, rotate: 2 },
  { id: 'right-top', side: 'right', x: 0, y: 0, rotate: 3 },
  { id: 'right-bottom', side: 'right', x: 20, y: 104, rotate: -2 },
] as const;

const SCATTER = [
  { id: 'a', className: '-top-6 -left-24 rotate-[-6deg]', pool: 3 },
  { id: 'b', className: 'top-10 -right-28 rotate-[5deg]', pool: 4 },
  { id: 'c', className: '-bottom-4 -left-20 rotate-[4deg]', pool: 1 },
  { id: 'd', className: '-right-24 bottom-12 rotate-[-5deg]', pool: 2 },
] as const;

const SWAP_INTERVAL_MS = 4000;
const STACK_GAP = 'clamp(1.5rem, 6vw - 2.5rem, 10rem)';

function NotificationCard({ notification }: { notification: Notification }) {
  if (notification.kind === 'activity') {
    return (
      <div className='selection-inverse flex w-72 flex-col gap-3 rounded-[22px] bg-fg-4 p-3.5 text-background shadow-3'>
        <div className='flex items-center gap-3'>
          <PastelAvatar
            seed={notification.app}
            size={36}
            className='corner-superellipse/1.125 rounded-[10px]'
          />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate font-medium text-sm'>{notification.title}</span>
            <span className='truncate text-background/60 text-xs'>{notification.detail}</span>
          </span>
          <span className='ml-auto text-background/60 text-xs'>{notification.app}</span>
        </div>
        <div className='h-1.5 w-full overflow-hidden rounded-full bg-background/15'>
          <div
            className='h-full rounded-full bg-background/90'
            style={{ width: `${notification.progress * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className='flex w-72 flex-col gap-2.5 rounded-[22px] bg-bg-1 p-3 shadow-3'>
      <div className='flex items-start gap-3'>
        <PastelAvatar
          seed={notification.app}
          size={38}
          className='corner-superellipse/1.125 rounded-[11px]'
        />
        <span className='flex min-w-0 flex-1 flex-col gap-px'>
          <span className='flex items-baseline justify-between gap-2'>
            <span className='truncate font-medium text-fg-4 text-sm'>{notification.title}</span>
            {notification.kind === 'banner' && (
              <span className='shrink-0 text-fg-1 text-xs'>{notification.when}</span>
            )}
          </span>
          <span className='truncate text-fg-2 text-sm'>{notification.body}</span>
        </span>
      </div>
      {notification.kind === 'actions' && (
        <div className='flex gap-2'>
          {notification.actions.map((action) => (
            <span
              key={action}
              className='flex h-7 flex-1 items-center justify-center rounded-[10px] bg-bg-2 font-medium text-fg-3 text-xs'
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stacks({ frozen }: { frozen: boolean }) {
  const [shown, setShown] = useState<Notification[]>(() => POOL.slice(0, SLOTS.length));
  const stepRef = useRef(0);

  useEffect(() => {
    if (frozen) return;
    const interval = setInterval(() => {
      const slot = stepRef.current % SLOTS.length;
      stepRef.current += 1;
      setShown((current) => {
        const visible = new Set(current.map((entry) => entry.id));
        const candidates = POOL.filter((entry) => !visible.has(entry.id));
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
          <NotificationCard notification={POOL[slot.pool]!} />
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
