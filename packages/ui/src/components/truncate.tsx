'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

const TRUNCATE_TOOLTIP_DELAY = 150;

/**
 * A single line of text that truncates with an ellipsis and, only when it
 * actually is cut off, shows the full text in a tooltip on hover. Drop-in for
 * `<span className='truncate'>`; the wrapper must give it a bounded width
 * (`min-w-0` on flex children) exactly as with the bare utility.
 */
function Truncate({ children, className, ...props }: React.ComponentProps<'span'>) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setClipped(el.scrollWidth > el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider delay={TRUNCATE_TOOLTIP_DELAY}>
      <Tooltip disabled={!clipped}>
        <TooltipTrigger
          render={
            <span
              ref={ref}
              data-slot='truncate'
              className={cn('block min-w-0 truncate', className)}
              {...props}
            >
              {children}
            </span>
          }
        />
        <TooltipContent className='max-w-72 whitespace-normal text-pretty [overflow-wrap:anywhere]'>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Truncate };
