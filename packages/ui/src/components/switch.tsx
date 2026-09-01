'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@buzzkit/ui/lib/utils';

// One size. Geometry is driven by the 16px knob: 2px inset on every side makes
// the track 20 tall and 32 wide, and the checked translate of `thumb - 3` lands
// the knob flush against the right edge.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(
        'peer group/switch relative inline-flex h-5 w-8 shrink-0 items-center rounded-full border border-transparent bg-bg-3 transition-[background-color,box-shadow] duration-200 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'after:absolute after:-inset-x-3 after:-inset-y-2',
        'not-data-disabled:cursor-pointer data-checked:bg-primary-4',
        'data-disabled:cursor-not-allowed data-disabled:[&>span]:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className={cn(
          'pointer-events-none flex size-4 items-center justify-center rounded-full bg-background text-primary-4 ring-0 transition-transform duration-150 ease-out will-change-transform',
          'shadow-control-knob',
          'translate-x-px data-checked:translate-x-[calc(100%-3px)]'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
