import { cn } from '@buzzkit/ui/lib/utils';
import { motion } from 'motion/react';

const fillSpring = { type: 'spring', duration: 0.5, bounce: 0 } as const;

export function OnboardingProgress({
  values,
  labels,
  className,
}: {
  values: number[];
  labels: string[];
  className?: string;
}) {
  const done = values.filter((value) => value >= 1).length;
  return (
    <div
      role='progressbar'
      aria-label='Setup progress'
      aria-valuemin={0}
      aria-valuemax={values.length}
      aria-valuenow={done}
      aria-valuetext={`${labels[Math.min(done, labels.length - 1)] ?? ''}, step ${Math.min(done + 1, values.length)} of ${values.length}`}
      className={cn('flex items-center gap-1.5', className)}
    >
      {values.map((value, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          key={index}
          className='relative h-1 flex-1 overflow-hidden rounded-full bg-bg-3'
        >
          <motion.span
            className='absolute inset-y-0 left-0 rounded-full bg-fg-4'
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
            transition={fillSpring}
          />
        </span>
      ))}
    </div>
  );
}
