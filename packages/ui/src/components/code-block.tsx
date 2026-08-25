import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { iconSwap, iconSwapIn, iconSwapOut } from '@buzzkit/ui/lib/icon-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

/**
 * A copyable command/code snippet. Deliberately plain — no syntax highlighting,
 * just mono text on a soft surface with a copy affordance in the corner.
 */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div
      className={cn(
        'corner-superellipse/1.125 relative isolate w-full overflow-hidden rounded-xl bg-bg-2',
        className
      )}
    >
      <ScrollFade orientation='horizontal' size={24}>
        <pre className='w-max min-w-full px-3 py-2 pr-11 text-fg-3 text-xs leading-relaxed'>
          <code>{code}</code>
        </pre>
      </ScrollFade>
      {/* The button sits on a solid disc of the block color with a soft halo
          of the same color, so code scrolling under it fades out on every side
          instead of clipping at an edge. Centered beside a single line, pinned
          near the top of tall blocks. */}
      <div className='pointer-events-none absolute inset-y-0 right-0 flex max-h-10 items-center pr-1.5'>
        <span className='pointer-events-auto flex items-center rounded-full bg-bg-2 shadow-[0_0_14px_12px_var(--color-bg-2)]'>
          <Button
            variant='ghost'
            size='icon-xs'
            aria-label={copied ? 'Copied' : 'Copy to clipboard'}
            onClick={copy}
          >
            {/* Clipboard keeps the quiet 50% icon weight; the check lands
              full-strength green — it is a success confirmation. */}
            <Icon
              name='IconClipboard2'
              className={cn(iconSwap, copied ? iconSwapOut : cn(iconSwapIn, 'opacity-50'))}
            />
            <Icon
              name='IconCheckmark1'
              className={cn(
                'absolute inset-0 m-auto text-green-4',
                iconSwap,
                copied ? iconSwapIn : iconSwapOut
              )}
            />
          </Button>
        </span>
      </div>
    </div>
  );
}
