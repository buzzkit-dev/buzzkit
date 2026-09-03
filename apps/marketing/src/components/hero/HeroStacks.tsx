import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { type Artifact, ArtifactCard } from './Artifact';

const POOL: Artifact[] = [
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
    id: 'readwise',
    kind: 'banner',
    app: 'Dune',
    title: '3 highlights to review',
    body: 'Keep your streak at 41 days.',
    when: '1h ago',
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
  {
    id: 'harbor',
    kind: 'banner',
    app: 'Harbor',
    title: 'Table ready',
    body: 'Head to the host stand.',
    when: 'now',
  },
  {
    id: 'nook-activity',
    kind: 'activity',
    app: 'Nook',
    title: 'Out for delivery',
    detail: '4 stops away',
    progress: 0.85,
  },
];

const POSITIONS = [
  { id: 'top', x: 0, y: 0, rotate: -3 },
  { id: 'bot', x: 20, y: 104, rotate: 2 },
] as const;

const SLOTS = POSITIONS.length;
const SWAP_INTERVAL = 3000;

function Stack({
  side,
  used,
  frozen,
}: {
  side: 'left' | 'right';
  used: React.RefObject<Set<string>>;
  frozen: boolean;
}) {
  const offset = side === 'left' ? 0 : SLOTS;
  const [slots, setSlots] = useState<Artifact[]>(() => POOL.slice(offset, offset + SLOTS));
  const orderRef = useRef(side === 'left' ? [0, 1] : [1, 0]);
  const stepRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (frozen) return;
    const swap = () => {
      const index = orderRef.current[stepRef.current % SLOTS]!;
      stepRef.current += 1;
      setSlots((current) => {
        const roomForRich = current.every((entry, slot) => slot === index || entry.kind === 'banner');
        const candidates = POOL.filter(
          (entry) => !used.current.has(entry.id) && (roomForRich || entry.kind === 'banner')
        );
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        if (!candidate) return current;
        const next = [...current];
        used.current.delete(current[index]!.id);
        used.current.add(candidate.id);
        next[index] = candidate;
        return next;
      });
    };
    const initialDelay = side === 'right' ? SWAP_INTERVAL / 2 : 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      swap();
      interval = setInterval(swap, SWAP_INTERVAL);
    }, SWAP_INTERVAL + initialDelay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [side, used, frozen]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const anchor = side === 'left' ? 'right' : 'left';

  return (
    <div
      className={
        side === 'left'
          ? 'pointer-events-none absolute top-1/2 right-[calc(50%+16.5rem+var(--stack-gap))] hidden h-48 w-80 origin-right -translate-y-1/2 scale-85 text-left lg:block xl:scale-100'
          : 'pointer-events-none absolute top-1/2 left-[calc(50%+16.5rem+var(--stack-gap))] hidden h-48 w-80 origin-left -translate-y-1/2 scale-85 text-left lg:block xl:scale-100'
      }
      style={{ '--stack-gap': 'clamp(1.5rem, 6vw - 2.5rem, 10rem)' } as React.CSSProperties}
      aria-hidden='true'
    >
      {POSITIONS.map((position, index) => {
        const artifact = slots[index]!;
        const firstPaint = !mountedRef.current;
        return (
          <div key={position.id} className='absolute' style={{ [anchor]: position.x, top: position.y }}>
            <AnimatePresence mode='wait' initial={!frozen}>
              <motion.div
                key={artifact.id}
                initial={{ opacity: 0, scale: 0.85, y: 10, rotate: position.rotate }}
                animate={{ opacity: 1, scale: 1, y: 0, rotate: position.rotate }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{
                  duration: firstPaint ? 0.4 : 0.5,
                  ease: 'easeOut',
                  delay: firstPaint ? (side === 'right' ? 0.06 : 0) + index * 0.12 : 0,
                }}
              >
                <ArtifactCard artifact={artifact} />
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

const SCATTER = [
  { id: 'a', className: '-top-4 -left-28 rotate-[-6deg]', pool: 4 },
  { id: 'b', className: 'top-2 -right-32 rotate-[5deg]', pool: 7 },
  { id: 'c', className: 'bottom-4 -left-24 rotate-[4deg]', pool: 2 },
  { id: 'd', className: '-right-28 bottom-0 rotate-[-5deg]', pool: 3 },
] as const;

function Scatter({ frozen }: { frozen: boolean }) {
  const [slots, setSlots] = useState<Artifact[]>(() => SCATTER.map((slot) => POOL[slot.pool]!));
  const stepRef = useRef(0);

  useEffect(() => {
    if (frozen) return;
    const interval = setInterval(() => {
      const index = stepRef.current % SCATTER.length;
      stepRef.current += 1;
      setSlots((current) => {
        const shown = new Set(current.map((entry) => entry.id));
        const candidates = POOL.filter((entry) => entry.kind === 'banner' && !shown.has(entry.id));
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        if (!candidate) return current;
        const next = [...current];
        next[index] = candidate;
        return next;
      });
    }, SWAP_INTERVAL);
    return () => clearInterval(interval);
  }, [frozen]);

  return (
    <div className='pointer-events-none absolute inset-0 lg:hidden' aria-hidden='true'>
      {SCATTER.map((slot, index) => {
        const artifact = slots[index]!;
        return (
          <div key={slot.id} className={`absolute scale-75 ${slot.className}`}>
            <AnimatePresence mode='wait' initial={!frozen}>
              <motion.div
                key={artifact.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 0.16, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.1 }}
              >
                <ArtifactCard artifact={artifact} />
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function HeroStacks() {
  const reducedMotion = useReducedMotion();
  const used = useRef(new Set(POOL.slice(0, SLOTS * 2).map((entry) => entry.id)));
  return (
    <>
      <Scatter frozen={reducedMotion === true} />
      <Stack side='left' used={used} frozen={reducedMotion === true} />
      <Stack side='right' used={used} frozen={reducedMotion === true} />
    </>
  );
}
