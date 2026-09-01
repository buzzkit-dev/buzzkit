'use client';

import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { cn } from '@buzzkit/ui/lib/utils';

function ScrollArea({
  className,
  children,
  fade = true,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** Fade the content out at whichever edges can still be scrolled. */
  fade?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot='scroll-area'
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot='scroll-area-viewport'
        className={cn(
          'size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary-2',
          // The fade masks the viewport's own content, so it can never reach
          // past the scrolling area onto the container's border. Base UI puts
          // the `data-overflow-*` attributes here; `scroll-fade` reads them.
          fade && 'scroll-fade'
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({ className, orientation = 'vertical', ...props }: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot='scroll-area-scrollbar'
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'z-20 flex touch-none select-none opacity-0 transition-opacity duration-150 data-hovering:opacity-100 data-scrolling:opacity-100',
        'data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:px-0.75 data-horizontal:pt-px data-horizontal:pb-0.75',
        'data-vertical:h-full data-vertical:w-2.5 data-vertical:py-0.75 data-vertical:pr-0.75 data-vertical:pl-px',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot='scroll-area-thumb'
        className='relative flex-1 rounded-full bg-bg-a2 transition-colors hover:bg-bg-a3'
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
