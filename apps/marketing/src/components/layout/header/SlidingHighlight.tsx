import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';

export const spring = { type: 'spring', duration: 0.3, bounce: 0 } as const;

const pressSpring = { type: 'spring', duration: 0.15, bounce: 0 } as const;

interface Highlight {
  left: number;
  top: number;
  width: number;
  height: number;
}

function readPressInset(): { x: number; y: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    x: Number.parseFloat(style.getPropertyValue('--press-inset-x')) || 1,
    y: Number.parseFloat(style.getPropertyValue('--press-inset-y')) || 0.5,
  };
}

export function useSlidingHighlight<Container extends HTMLElement>() {
  const containerRef = useRef<Container>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pressed, setPressed] = useState(false);

  const move = (target: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    setHighlight({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const clear = () => {
    setHighlight(null);
    setPressed(false);
  };

  const press = () => setPressed(true);
  const release = () => setPressed(false);

  return { containerRef, highlight, pressed, move, clear, press, release };
}

export function SlidingHighlight({ highlight, pressed }: { highlight: Highlight | null; pressed: boolean }) {
  const inset = pressed ? readPressInset() : { x: 0, y: 0 };
  const target = highlight
    ? {
        left: highlight.left + inset.x,
        top: highlight.top + inset.y,
        width: highlight.width - inset.x * 2,
        height: highlight.height - inset.y * 2,
      }
    : null;
  return (
    <AnimatePresence initial={false}>
      {target && (
        <motion.span
          aria-hidden='true'
          className='pointer-events-none absolute rounded-xl bg-bg-a2 corner-superellipse/1.125'
          initial={{ opacity: 0, ...target }}
          animate={{ opacity: 1, ...target }}
          exit={{ opacity: 0 }}
          transition={pressed ? pressSpring : spring}
        />
      )}
    </AnimatePresence>
  );
}
