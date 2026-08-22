'use client';

import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';

const moveSpring = { type: 'spring', duration: 0.4, bounce: 0 } as const;
const swapTransition = { ...moveSpring, opacity: { duration: 0.25, ease: 'easeOut' } } as const;

const MASK_X = '0.5em';
const MASK_Y = '0.3em';
const mask = [
  `linear-gradient(to right, transparent, black ${MASK_X}, black calc(100% - ${MASK_X}), transparent)`,
  `linear-gradient(to bottom, transparent, black ${MASK_Y}, black calc(100% - ${MASK_Y}), transparent)`,
].join(', ');

const variants = {
  enter: (direction: number) => ({ y: `${direction * -100}%`, opacity: 0, filter: 'blur(3px)' }),
  settled: { y: '0%', opacity: 1, filter: 'blur(0px)' },
  exit: (direction: number) => ({ y: `${direction * 100}%`, opacity: 0, filter: 'blur(3px)' }),
};

/**
 * Swaps a short text like a slot machine reel. Labels are remembered in the
 * order they were first shown, and that order is the reel: moving to a label
 * further along rolls forward (the new one drops in from the top, the old one
 * leaves through the bottom); moving back to an earlier label rolls backward
 * (the new one rises from the bottom, the old one leaves through the top), so
 * `Next` that just left downward comes back up from where it went. Meanwhile and the box springs to the
 * new text's width so whatever wraps it (a button) grows or shrinks smoothly.
 *
 * Overflow is handled like NumberFlow's mask: the box carries a padding zone
 * (pulled back with negative margins so layout is unchanged) and a gradient
 * mask that is fully opaque over the text at rest and fades to nothing across
 * that zone. While the width is still catching up, whatever pokes past the
 * text area dissolves into the edge instead of being hard-cut or spilling
 * into the button's padding. An invisible in-flow copy of the current text
 * is what gets measured (the visible labels are absolute and centred by the
 * flex box's static positioning), so measuring never depends on a ref that an
 * exiting label can null out on its way out. Every change mounts a fresh
 * label (keyed by a counter, not by the text), so a text that returns while
 * its previous self is still rolling out is never revived mid-exit; it makes
 * its own entrance in the remembered direction. `children` must be a string.
 */
function TextSwap({ children, className }: { children: string; className?: string }) {
  const sizerRef = React.useRef<HTMLSpanElement>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  const reel = React.useRef<string[]>([children]);
  const [entry, setEntry] = React.useState({ text: children, id: 0, direction: 1 });
  if (entry.text !== children) {
    if (!reel.current.includes(children)) reel.current.push(children);
    const direction = reel.current.indexOf(children) > reel.current.indexOf(entry.text) ? 1 : -1;
    setEntry({ text: children, id: entry.id + 1, direction });
  }

  React.useLayoutEffect(() => {
    const sizer = sizerRef.current;
    if (!sizer) return;
    const measure = () => setWidth(sizer.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sizer);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    if (sizerRef.current) setWidth(sizerRef.current.offsetWidth);
  }, [children]);

  return (
    <motion.span
      className={cn('relative inline-flex items-center justify-center overflow-hidden', className)}
      style={{
        paddingInline: MASK_X,
        paddingBlock: MASK_Y,
        marginInline: `calc(${MASK_X} * -1)`,
        marginBlock: `calc(${MASK_Y} * -1)`,
        maskImage: mask,
        maskComposite: 'intersect',
        WebkitMaskImage: mask,
        WebkitMaskComposite: 'source-in',
      }}
      initial={false}
      animate={width === null ? undefined : { width: `calc(${width}px + ${MASK_X} * 2)` }}
      transition={moveSpring}
    >
      <span ref={sizerRef} aria-hidden className='invisible whitespace-nowrap'>
        {children}
      </span>
      <AnimatePresence initial={false} custom={entry.direction}>
        <motion.span
          key={entry.id}
          custom={entry.direction}
          className='absolute whitespace-nowrap'
          variants={variants}
          initial='enter'
          animate='settled'
          exit='exit'
          transition={swapTransition}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export { TextSwap };
