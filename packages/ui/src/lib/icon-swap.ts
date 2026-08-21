/**
 * The icon-swap standard (design.md §6): the outgoing icon scales down to
 * .65 as it fades out behind a subtle blur; the incoming icon scales in from
 * .65 as it fades in. Both at once, one duration — a simple symmetric
 * cross-fade.
 *
 * CSS flavor: keep both icons mounted (stacked absolutely) and toggle each
 * between `iconSwapIn` and `iconSwapOut` — transitions retarget mid-swap.
 */
export const iconSwap = 'transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]';
export const iconSwapIn = 'scale-100 opacity-100 blur-none';
export const iconSwapOut = 'scale-[0.65] opacity-0 blur-[2px]';

/** motion/react flavor, for swaps driven by `AnimatePresence` keyed children. */
export const iconSwapMotion = {
  initial: { opacity: 0, scale: 0.65, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.65, filter: 'blur(2px)' },
  transition: { type: 'spring', duration: 0.3, bounce: 0 },
} as const;
