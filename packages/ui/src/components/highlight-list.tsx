'use client';

import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

const TRANSITION =
  'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease-out';
const PRESS_SCALE = '0.985';

/**
 * Attaches a sliding indicator to any container whose items expose a
 * boolean-ish attribute (e.g. `data-highlighted`, `data-active`). Pure
 * imperative DOM — no React re-renders on hover/active change.
 *
 * Items get `data-indicator-here` while the indicator sits on them, so they
 * can style their own text/icon color for the highlighted state.
 *
 * Usage:
 *   const rootRef = useRef<HTMLDivElement>(null);
 *   const indicatorRef = useAnimatedIndicator(rootRef, { attribute: 'data-active' });
 *   return (
 *     <div ref={rootRef} className='relative'>
 *       <div ref={indicatorRef} className='absolute rounded-lg bg-bg-a2' />
 *       {children}
 *     </div>
 *   );
 */
function useAnimatedIndicator<T extends HTMLElement>(
  rootRef: React.RefObject<T | null>,
  {
    attribute = 'data-highlighted',
    press = true,
    pressScale = PRESS_SCALE,
  }: { attribute?: string; press?: boolean; pressScale?: string } = {}
): React.RefObject<HTMLDivElement | null> {
  const indicatorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const indicator = indicatorRef.current;
    if (!root || !indicator) return;

    let hasAppeared = false;
    let translate = '';
    let activeEl: HTMLElement | null = null;
    const selector = `[${attribute}]`;

    const applyTransform = () => {
      indicator.style.transform = `${translate} scale(var(--hl-press-scale, 1))`;
    };

    const update = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) return;

      if (el !== activeEl) {
        activeEl?.removeAttribute('data-indicator-here');
        el.setAttribute('data-indicator-here', '');
        activeEl = el;
        // Mirror the item's variant so the indicator can tint itself for
        // destructive rows instead of every item drawing its own background.
        const variant = el.getAttribute('data-variant');
        if (variant) indicator.setAttribute('data-variant', variant);
        else indicator.removeAttribute('data-variant');
      }

      // Walk the offsetParent chain up to `root` for the item's position in
      // layout coords. offset* instead of getBoundingClientRect avoids
      // measurement drift during the popup's open/close transforms
      // (zoom-in-95 etc.), which would otherwise land the indicator mid-item.
      let left = 0;
      let top = 0;
      let current: HTMLElement | null = el;
      while (current && current !== root) {
        left += current.offsetLeft;
        top += current.offsetTop;
        const next = current.offsetParent as HTMLElement | null;
        if (!next || !root.contains(next)) break;
        current = next;
      }
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      translate = `translate(${left}px, ${top}px)`;

      if (!hasAppeared) {
        hasAppeared = true;
        indicator.style.transition = 'none';
        applyTransform();
        indicator.style.width = `${width}px`;
        indicator.style.height = `${height}px`;
        void indicator.offsetHeight;
        indicator.style.transition = TRANSITION;
        indicator.style.opacity = '1';
      } else {
        applyTransform();
        indicator.style.width = `${width}px`;
        indicator.style.height = `${height}px`;
      }
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: [attribute] });
    // The popup can resize after mount (anchor-width applied late, filtered
    // content, …) — re-measure so the indicator stays aligned.
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(root);

    if (!press) {
      return () => {
        observer.disconnect();
        resizeObserver.disconnect();
        activeEl?.removeAttribute('data-indicator-here');
      };
    }

    let releasing: (() => void) | null = null;

    const release = () => {
      indicator.style.removeProperty('--hl-press-scale');
      releasing?.();
      releasing = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const item = event.target.closest<HTMLElement>(selector);
      if (!item || !root.contains(item)) return;
      indicator.style.setProperty('--hl-press-scale', pressScale);
      const doc = root.ownerDocument ?? document;
      doc.addEventListener('pointerup', release, true);
      doc.addEventListener('pointercancel', release, true);
      releasing = () => {
        doc.removeEventListener('pointerup', release, true);
        doc.removeEventListener('pointercancel', release, true);
      };
    };

    root.addEventListener('pointerdown', onPointerDown);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      root.removeEventListener('pointerdown', onPointerDown);
      release();
      activeEl?.removeAttribute('data-indicator-here');
    };
  }, [rootRef, attribute, press, pressScale]);

  return indicatorRef;
}

/**
 * Menu/list wrapper: a relative container with an absolutely positioned
 * indicator that slides between `data-highlighted` items. Owns the list
 * padding so the indicator can sit flush inside the popup's edge.
 *
 * When a wrapper div isn't possible (e.g. inside Base UI's Tabs.List, which
 * expects Tab children directly), use `useAnimatedIndicator` directly.
 */
function HighlightList({
  children,
  className,
  indicatorClassName,
  attribute,
  press,
}: {
  children: React.ReactNode;
  className?: string;
  indicatorClassName?: string;
  attribute?: string;
  press?: boolean;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = useAnimatedIndicator(rootRef, { attribute, press });

  return (
    <div ref={rootRef} className={cn('relative isolate p-1', className)}>
      <div
        ref={indicatorRef}
        className={cn(
          'pointer-events-none absolute top-0 left-0 -z-10 rounded-lg bg-bg-a2 opacity-0',
          indicatorClassName
        )}
        style={{
          transition: TRANSITION,
          willChange: 'transform, opacity',
          contain: 'layout paint',
          transformOrigin: 'center',
        }}
      />
      {children}
    </div>
  );
}

export { HighlightList, useAnimatedIndicator };
