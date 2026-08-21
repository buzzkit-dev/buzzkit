import { cn } from '@buzzkit/ui/lib/utils';
import { motion } from 'motion/react';
import * as React from 'react';

/**
 * Segmented pill tabs with geometry-driven color: the active pill is an
 * aria-hidden overlay — a full copy of the label row in the inverted color on
 * the pill background — clipped to the active item by an animated
 * `clip-path: inset(… round 9999px)`. Sliding the clip window *reveals* the
 * inverted labels, so mid-animation a label is split at the pill edge instead
 * of cross-fading. Never animate tab text colors directly.
 */

const VARIANTS = {
  /** Black pill, inverted labels (inbox filters). */
  primary: {
    overlay: 'selection-inverse bg-primary text-primary-foreground',
    item: 'text-fg-2 hover:text-fg-3 active:text-fg-3',
  },
  /** Amber pill — the internal-mode composer picker. */
  amber: {
    overlay: 'selection-amber bg-amber-4 text-white',
    item: 'text-fg-2 hover:text-fg-3 active:text-fg-3',
  },
  /** Soft pill, raised labels (header nav, composer modes). */
  soft: { overlay: 'bg-bg-2 text-fg-4', item: 'text-fg-2 hover:text-fg-3 active:text-fg-3' },
} as const;

export type PillTabsItem<V extends string = string> = { value: V; label: React.ReactNode };

// The mount fade is a page-load nicety. Client-side route changes remount
// PillTabs instances (each route renders its own copy), and replaying the fade
// there reads as flicker — so only instances mounting before the app's first
// paint fade in; everything after appears settled.
let pageHasPainted = false;

/** Props PillTabs hands to a custom item renderer (e.g. a router Link). */
export type PillTabsItemProps = {
  ref: (node: HTMLElement | null) => void;
  className: string;
  children: React.ReactNode;
  onClick: () => void;
  'aria-current'?: 'page';
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
};

export function PillTabs<V extends string>({
  items,
  value,
  onValueChange,
  variant = 'soft',
  className,
  gapClassName = 'gap-1',
  itemClassName,
  renderItem,
}: {
  items: PillTabsItem<V>[];
  value: V | null;
  onValueChange?: (value: V) => void;
  variant?: keyof typeof VARIANTS;
  className?: string;
  /** Spacing between items — applied to both layers, so keep it a gap-*. */
  gapClassName?: string;
  /** Sizing shared by both layers, e.g. 'h-6.5 px-2.5 text-xs'. */
  itemClassName?: string;
  /** Custom interactive element per item (PillTabs renders buttons otherwise). */
  renderItem?: (item: PillTabsItem<V>, props: PillTabsItemProps) => React.ReactNode;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef(new Map<string, HTMLElement>());
  const [active, setActive] = React.useState<{
    left: number;
    right: number;
    width: number;
    height: number;
    value: V;
  } | null>(null);
  // Written after paint, so every pre-paint render (hydration, StrictMode
  // double-invokes) still sees null and snaps. Only a real value change —
  // never the first placement, never a resize re-measure — animates.
  const settled = React.useRef<{ value: V } | null>(null);
  React.useEffect(() => {
    settled.current = active;
  });

  // Pressing the already-active item shrinks the pill (the clip window, so
  // the labels stay fixed) by the same ratio a button's background shrinks.
  const [pressed, setPressed] = React.useState(false);
  const prevPressed = React.useRef(false);
  const pressChanged = pressed !== prevPressed.current;
  React.useEffect(() => {
    prevPressed.current = pressed;
  });

  const [fadeIn] = React.useState(() => !pageHasPainted);
  React.useEffect(() => {
    pageHasPainted = true;
  }, []);

  const measure = React.useCallback(() => {
    const root = listRef.current;
    if (!root || value == null) {
      setActive(null);
      return;
    }
    const el = itemRefs.current.get(value);
    if (!el) {
      setActive(null);
      return;
    }
    // offset* values are integer-rounded; the 1px cushion keeps the rounding
    // error from shaving the pill's outer arcs on the first and last items.
    const left = Math.max(0, el.offsetLeft - 1);
    const right = Math.max(0, root.offsetWidth - el.offsetLeft - el.offsetWidth - 1);
    setActive({ left, right, width: el.offsetWidth, height: el.offsetHeight, value });
  }, [value]);

  React.useLayoutEffect(measure, [measure]);

  React.useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure]);

  const registerItem = (itemValue: string) => (node: HTMLElement | null) => {
    if (node) itemRefs.current.set(itemValue, node);
    else itemRefs.current.delete(itemValue);
  };

  const itemBase = cn(
    'flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium',
    itemClassName
  );
  const styles = VARIANTS[variant];

  const animates = settled.current !== null && active !== null && settled.current.value !== active.value;

  const dx = pressed && active ? active.width * 0.0125 : 0;
  const dy = pressed && active ? active.height * 0.0125 : 0;
  const clip = active
    ? `inset(${dy}px ${active.right + dx}px ${dy}px ${active.left + dx}px round 9999px)`
    : 'inset(0px 100% 0px 0px round 9999px)';

  return (
    <div ref={listRef} className={cn('relative isolate flex w-max', gapClassName, className)}>
      {items.map((item) => {
        const props: PillTabsItemProps = {
          ref: registerItem(item.value),
          className: cn(
            itemBase,
            styles.item,
            'cursor-pointer outline-none transition-[color,scale] duration-150 focus-visible:ring-2 focus-visible:ring-primary-2',
            item.value !== value && 'active:scale-[0.975]'
          ),
          children: item.label,
          onClick: () => onValueChange?.(item.value),
          ...(item.value === value && {
            'aria-current': 'page' as const,
            onPointerDown: () => setPressed(true),
            onPointerUp: () => setPressed(false),
            onPointerLeave: () => setPressed(false),
          }),
        };
        if (renderItem) {
          return <React.Fragment key={item.value}>{renderItem(item, props)}</React.Fragment>;
        }
        const { 'aria-current': _current, ...rest } = props;
        return <button key={item.value} type='button' aria-pressed={item.value === value} {...rest} />;
      })}
      {/* The pill: an inverted copy of the row, revealed through the clip window. */}
      <motion.div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0 z-10 flex', gapClassName, styles.overlay)}
        initial={false}
        animate={{
          clipPath: clip,
          opacity: active ? 1 : 0,
        }}
        transition={
          animates
            ? { type: 'spring', duration: 0.3, bounce: 0 }
            : pressChanged
              ? { clipPath: { duration: 0.15, ease: 'easeOut' }, opacity: { duration: 0 } }
              : {
                  clipPath: { duration: 0 },
                  opacity: fadeIn ? { duration: 0.15, ease: 'easeOut' } : { duration: 0 },
                }
        }
      >
        {items.map((item) => (
          <span key={item.value} className={itemBase}>
            {item.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
