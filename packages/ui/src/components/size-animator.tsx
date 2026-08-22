'use client';

import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

/**
 * Animates height changes of its content: an outer div with an explicit pixel
 * height that transitions, wrapping an inner div whose natural height is
 * measured via ResizeObserver. Use around popup contents so size changes
 * (filtered lists, expanding sections) animate instead of snapping.
 */
function SizeAnimator({
  children,
  className,
  duration = 180,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
}) {
  const transition = `height ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let initial = true;

    const update = () => {
      const height = inner.offsetHeight;
      if (initial) {
        initial = false;
        outer.style.transition = 'none';
        outer.style.height = `${height}px`;
        void outer.offsetHeight;
        outer.style.transition = transition;
      } else {
        outer.style.height = `${height}px`;
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [transition]);

  return (
    <div ref={outerRef} className={cn('overflow-hidden', className)} style={{ transition }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export { SizeAnimator };
