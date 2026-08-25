import { cn } from '@buzzkit/ui/lib/utils';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
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
  // Pressing the already-active item shrinks the pill (the clip window, so
  // the labels stay fixed) by the same ratio a button's background shrinks.
  const [pressed, setPressed] = React.useState(false);

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

  // The clip window is driven by numeric springs, one per edge, sharing one
  // spring config, so both edges move in lockstep and the pill keeps the
  // width of a tab while it slides. (Animating the `clip-path` string lets the
  // edges interpolate independently: the pill stretches across every tab in
  // between on the way.)
  const leftSource = useMotionValue(0);
  const rightSource = useMotionValue(0);
  const pressSource = useMotionValue(0);
  const left = useSpring(leftSource, { visualDuration: 0.3, bounce: 0 });
  const right = useSpring(rightSource, { visualDuration: 0.3, bounce: 0 });
  const press = useSpring(pressSource, { visualDuration: 0.15, bounce: 0 });
  const sizeRef = React.useRef({ width: 0, height: 0 });
  const placedValue = React.useRef<V | null>(null);
  React.useEffect(() => {
    if (!active) return;
    sizeRef.current = { width: active.width, height: active.height };
    const animates = placedValue.current !== null && placedValue.current !== active.value;
    placedValue.current = active.value;
    if (animates) {
      leftSource.set(active.left);
      rightSource.set(active.right);
    } else if (leftSource.get() !== active.left || rightSource.get() !== active.right) {
      // First placement and resize re-measures snap; only a value change slides.
      // A re-measure that lands on the same target (the page re-rendering while
      // the pill is still sliding) must not cut the slide short.
      leftSource.jump(active.left);
      rightSource.jump(active.right);
      left.jump(active.left);
      right.jump(active.right);
    }
  }, [active, leftSource, rightSource, left, right]);
  React.useEffect(() => {
    pressSource.set(pressed ? 1 : 0);
  }, [pressed, pressSource]);
  const clip = useTransform([left, right, press], ([l, r, p]) => {
    const dx = (p as number) * sizeRef.current.width * 0.0125;
    const dy = (p as number) * sizeRef.current.height * 0.0125;
    return `inset(${dy}px ${(r as number) + dx}px ${dy}px ${(l as number) + dx}px round 9999px)`;
  });

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
        style={{ clipPath: clip }}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ opacity: fadeIn ? { duration: 0.15, ease: 'easeOut' } : { duration: 0 } }}
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
