'use client';

import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

type Orientation = 'vertical' | 'horizontal' | 'both';

type ScrollFadeProps = Omit<React.ComponentProps<'div'>, 'ref'> & {
  orientation?: Orientation;
  /** Fade size in px (or any CSS length). */
  size?: number | string;
  /**
   * Ref of an existing scroll container to decorate. The fade is applied to
   * that element directly, so it needs no wrapper and nothing renders here.
   * Omit it to have this component render its own scroll container from
   * `children`.
   */
  targetRef?: React.RefObject<HTMLElement | null>;
};

/**
 * Fades the scrollable edges of a plain overflow container. Prefer `ScrollArea`
 * when you also want a custom scrollbar; reach for this when the scrolling
 * element is native (or owned by something else) and only needs the fades.
 *
 * The fade is a mask on the scrolling element, so it works on any surface and
 * stays strictly inside the scrolling area — it never paints over a border.
 */
function ScrollFade({
  orientation = 'vertical',
  size = 24,
  targetRef,
  className,
  children,
  ...props
}: ScrollFadeProps) {
  const internalRef = React.useRef<HTMLDivElement>(null);
  const ref = (targetRef ?? internalRef) as React.RefObject<HTMLElement | null>;
  const dim = typeof size === 'number' ? `${size}px` : size;

  // Passive on purpose: a caller's `targetRef` may point at a sibling rendered
  // after this component, and React attaches refs in tree order during the same
  // pass that runs layout effects — a layout effect here could still see null
  // and silently never decorate the target. Passive effects run after every ref
  // is attached; the fades are cosmetic and transition in, so settling a frame
  // after paint is fine (and SSR on Workers stays warning-free).
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const vertical = orientation === 'vertical' || orientation === 'both';
    const horizontal = orientation === 'horizontal' || orientation === 'both';
    // A caller-supplied target doesn't get our className, so opt it in here.
    el.classList.add('scroll-fade');
    el.style.setProperty('--fade-size', dim);

    const update = () => {
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el;
      // Mirrors Base UI's ScrollArea attributes so both share one utility.
      el.toggleAttribute('data-overflow-y-start', vertical && scrollTop > 0);
      el.toggleAttribute(
        'data-overflow-y-end',
        vertical && Math.ceil(scrollTop + clientHeight) < scrollHeight
      );
      el.toggleAttribute('data-overflow-x-start', horizontal && scrollLeft > 0);
      el.toggleAttribute(
        'data-overflow-x-end',
        horizontal && Math.ceil(scrollLeft + clientWidth) < scrollWidth
      );
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // Content can change height without the container resizing.
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      el.classList.remove('scroll-fade');
      el.style.removeProperty('--fade-size');
      for (const attr of ['y-start', 'y-end', 'x-start', 'x-end']) {
        el.removeAttribute(`data-overflow-${attr}`);
      }
    };
  }, [ref, orientation, dim]);

  if (targetRef) return null;

  const overflow =
    orientation === 'vertical'
      ? 'overflow-y-auto'
      : orientation === 'horizontal'
        ? 'overflow-x-auto'
        : 'overflow-auto';

  return (
    <div className={cn('relative', className)} {...props}>
      <div
        ref={internalRef}
        data-slot='scroll-fade-viewport'
        className={cn('scrollbar-hide size-full rounded-[inherit]', overflow)}
      >
        {children}
      </div>
    </div>
  );
}

export { ScrollFade };
