import { cn } from '@buzzkit/ui/lib/utils';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

const spotPulse =
  'after:pointer-events-none after:absolute after:inset-0 after:animate-[spot-pulse_2s_ease-out_infinite] after:rounded-[inherit]';

const spotEntry = { type: 'spring', duration: 0.4, bounce: 0, delay: 0.6 } as const;
let hydrated = false;

export function SpotRing({ className }: { className?: string }) {
  const [animateEntry] = useState(() => hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return (
    <motion.span
      aria-hidden
      className={cn('pointer-events-none absolute ring-2 ring-sky-4', spotPulse, className)}
      initial={animateEntry ? { scale: 1.12, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={spotEntry}
    />
  );
}

export function Spot({
  children,
  className,
  inset = '-inset-1',
}: {
  children: React.ReactNode;
  className?: string;
  inset?: string;
}) {
  return (
    <span className={cn('relative inline-flex max-w-full', className?.includes('min-w-0') && 'min-w-0')}>
      <SpotRing className={cn('rounded-xl', inset, className)} />
      {children}
    </span>
  );
}
