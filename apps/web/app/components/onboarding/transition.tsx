import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { AnimatePresence, motion } from 'motion/react';

export const STEP_DURATION_MS = 400;

const stepSpring = { type: 'spring', duration: STEP_DURATION_MS / 1000, bounce: 0 } as const;

export type StepKind = 'rows' | 'preview';
export type StepMotion = { direction: number; from: StepKind; to: StepKind };

const stepVariants = {
  enter: ({ direction, to }: StepMotion) => ({
    x: `${direction * 100}%`,
    scale: to === 'rows' ? 1 : 0.85,
    filter: to === 'rows' ? 'blur(1.5px)' : 'blur(4px)',
  }),
  center: { x: '0%', scale: 1, filter: 'blur(0px)' },
  exit: ({ direction, from }: StepMotion) => ({
    x: `${direction * -100}%`,
    scale: from === 'rows' ? 1 : 0.85,
    filter: from === 'rows' ? 'blur(1px)' : 'blur(2px)',
  }),
} as const;

export function StepTransition({
  id,
  motion: stepMotion,
  children,
}: {
  id: string;
  motion: StepMotion;
  children: React.ReactNode;
}) {
  return (
    <SizeAnimator
      className='relative overflow-visible [clip-path:inset(0_-100vw_0_-100vw)]'
      duration={STEP_DURATION_MS}
    >
      <AnimatePresence initial={false} mode='popLayout' custom={stepMotion}>
        <motion.div
          key={id}
          custom={stepMotion}
          variants={stepVariants}
          initial='enter'
          animate='center'
          exit='exit'
          transition={stepSpring}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </SizeAnimator>
  );
}
