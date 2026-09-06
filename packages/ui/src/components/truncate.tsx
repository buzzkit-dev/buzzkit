'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

const TRUNCATE_TOOLTIP_DELAY = 150;

const useMeasureEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

const ELLIPSIS = '…';

let ruler: CanvasRenderingContext2D | null = null;

function widthOf(text: string, font: string): number {
  if (!ruler) ruler = document.createElement('canvas').getContext('2d');
  if (!ruler) return 0;
  ruler.font = font;
  return ruler.measureText(text).width;
}

function fontOf(element: HTMLElement): string {
  const style = window.getComputedStyle(element);
  if (style.font) return style.font;
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function clampToMiddle(text: string, available: number, font: string, scale: number): string {
  let low = 0;
  let high = text.length - 1;
  let best = '';
  while (low <= high) {
    const kept = Math.floor((low + high) / 2);
    const head = Math.ceil(kept / 2);
    const candidate = `${text.slice(0, head)}${ELLIPSIS}${text.slice(text.length - (kept - head))}`;
    if (widthOf(candidate, font) * scale <= available) {
      best = candidate;
      low = kept + 1;
    } else {
      high = kept - 1;
    }
  }

  return best || ELLIPSIS;
}

/**
 * A single line of text that truncates with an ellipsis and, only when it
 * actually is cut off, shows the full text in a tooltip on hover. Drop-in for
 * `<span className='truncate'>`; the wrapper must give it a bounded width
 * (`min-w-0` on flex children) exactly as with the bare utility.
 *
 * `middle` cuts in the centre instead of the end, so both ends of an identifier
 * stay readable. The element always hugs the text it is showing, so whatever
 * follows it sits directly after the last character.
 *
 * The available width is read once per container size, while the full string is
 * rendered: at that moment `scrollWidth` is the text's natural width and
 * `clientWidth` is the room it was given. Shortening then narrows the element,
 * which is why the measurement is not repeated until the parent resizes.
 */
function Truncate({
  children,
  className,
  middle = false,
  ...props
}: React.ComponentProps<'span'> & { middle?: boolean }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const measured = React.useRef(false);
  const [clipped, setClipped] = React.useState(false);
  const [shortened, setShortened] = React.useState<string | null>(null);

  const full = middle && typeof children === 'string' ? children : null;

  useMeasureEffect(() => {
    const element = ref.current;
    if (!element || full === null) return;
    if (measured.current || shortened !== null) return;

    const available = element.clientWidth;
    const natural = element.scrollWidth;
    if (available <= 0) return;

    measured.current = true;
    if (natural <= available) return;

    const font = fontOf(element);
    const canvas = widthOf(full, font);
    setShortened(clampToMiddle(full, available, font, canvas > 0 ? natural / canvas : 1));
    setClipped(true);
  }, [full, shortened]);

  useMeasureEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (full === null) {
      const update = () => setClipped(element.scrollWidth > element.clientWidth);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }

    const parent = element.parentElement;
    if (!parent) return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      measured.current = false;
      setShortened(null);
      setClipped(false);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [full]);

  return (
    <TooltipProvider delay={TRUNCATE_TOOLTIP_DELAY}>
      <Tooltip disabled={!clipped}>
        <TooltipTrigger
          render={
            <span
              ref={ref}
              data-slot='truncate'
              className={cn(
                'block min-w-0',
                middle ? 'overflow-hidden whitespace-nowrap' : 'truncate',
                className
              )}
              {...props}
            >
              {full === null ? children : (shortened ?? full)}
            </span>
          }
        />
        <TooltipContent className='max-w-72 whitespace-normal text-pretty [overflow-wrap:anywhere]'>
          {full ?? children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Truncate };
