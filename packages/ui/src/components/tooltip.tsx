'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot='tooltip-provider' delay={delay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot='tooltip' {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot='tooltip-trigger' {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className='isolate z-50'
      >
        {/* A compact dark chip — no arrow; the offset alone reads as attached. */}
        <TooltipPrimitive.Popup
          data-slot='tooltip-content'
          className={cn(
            'corner-superellipse/1.125 z-50 inline-flex min-h-6 w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-lg bg-fg-4 px-2.5 py-1 font-medium text-background text-xs shadow-sm has-data-[slot=kbd]:py-0.5 has-data-[slot=kbd]:pr-0.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:h-5 **:data-[slot=kbd]:rounded-md **:data-[slot=kbd]:bg-background/15 **:data-[slot=kbd]:text-background data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

function TooltipLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot='tooltip-label' className={cn('text-fg-1', className)} {...props} />;
}

export { Tooltip, TooltipContent, TooltipLabel, TooltipProvider, TooltipTrigger };
