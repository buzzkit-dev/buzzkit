import { cn } from '@buzzkit/ui/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot='kbd'
      className={cn(
        "pointer-events-none inline-flex h-[18px] w-fit min-w-[18px] select-none items-center justify-center gap-1 rounded-[5px] bg-bg-2 in-data-[slot=tooltip-content]:bg-background/20 px-1 font-medium font-sans in-data-[slot=tooltip-content]:text-background text-fg-2 text-xs in-data-[slot=tooltip-content]:ring-background/15 ring-1 ring-bg-4/70 ring-inset dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd data-slot='kbd-group' className={cn('inline-flex items-center gap-0.75', className)} {...props} />
  );
}

export { Kbd, KbdGroup };
