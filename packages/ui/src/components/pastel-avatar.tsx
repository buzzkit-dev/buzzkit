import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

/**
 * Two palettes, so a workspace and a person never look alike even from the
 * same seed. Tiles (workspaces) blend two *neighbouring* accent ramps; orbs
 * (people) stay inside one ramp, lit from a corner, and use a different hash,
 * so the same string lands on different colours in each.
 */
const TILE_PAIRS = [
  ['purple', 'pink'],
  ['sky', 'blue'],
  ['green', 'yellow'],
  ['amber', 'orange'],
  ['pink', 'orange'],
  ['blue', 'purple'],
  ['yellow', 'green'],
  ['sky', 'purple'],
] as const;

const ORB_HUES = ['purple', 'sky', 'blue', 'green', 'amber', 'orange', 'pink', 'yellow'] as const;

type Variant = 'tile' | 'orb';

function hash(seed: string, salt: number): number {
  let value = salt;
  for (let index = 0; index < seed.length; index++)
    value = Math.imul(value ^ seed.charCodeAt(index), 16777619) >>> 0;
  return value;
}

function pickPair(seed: string, variant: Variant = 'tile'): readonly [string, string] {
  if (variant === 'orb') {
    const hue = ORB_HUES[hash(seed, 2166136261) % ORB_HUES.length]!;
    return [hue, hue];
  }
  return TILE_PAIRS[hash(seed, 84696351) % TILE_PAIRS.length]!;
}

/**
 * A generated picture for things that have no picture of their own: a pastel
 * gradient between two accent ramps picked deterministically from the seed,
 * with a soft highlight in the top corner so it reads as a rounded object
 * rather than a flat swatch. `tile` (workspaces) is a diagonal blend of two
 * hues on a superellipse; `orb` (people) is a lit sphere in a single hue,
 * always fully round. Pure CSS
 * from the design tokens, so it renders on the server and follows the theme.
 * It reads the raw ramp variables (`--sky-2`), not the `--color-*` theme
 * aliases: Tailwind drops theme variables no class uses.
 */
function PastelAvatar({
  seed,
  variant = 'tile',
  size = 24,
  className,
  style,
  ...props
}: React.ComponentProps<'span'> & { seed: string; variant?: Variant; size?: number }) {
  const [from, to] = pickPair(seed, variant);
  return (
    <span
      data-slot='pastel-avatar'
      data-variant={variant}
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden ring-1 ring-fg-a1/30',
        variant === 'orb'
          ? "rounded-full before:absolute before:inset-0 before:bg-radial-[at_32%_28%] before:from-bg-1/60 before:to-transparent before:to-55% before:content-['']"
          : "before:absolute before:inset-0 before:bg-radial-[at_28%_22%] before:from-bg-1/70 before:to-transparent before:to-65% before:content-['']",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundImage:
          variant === 'orb'
            ? `radial-gradient(circle at 70% 75%, var(--${to}-3), var(--${from}-3) 85%)`
            : `linear-gradient(135deg, var(--${from}-2), var(--${to}-3))`,
        ...style,
      }}
      {...props}
    />
  );
}

export { PastelAvatar, pickPair };
