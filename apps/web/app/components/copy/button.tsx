import { Icon } from '@buzzkit/ui/components/icon';
import { iconSwap, iconSwapIn, iconSwapOut } from '@buzzkit/ui/lib/icon-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';

export function CopyButton({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type='button'
      aria-label={copied ? 'Copied' : label}
      onClick={copy}
      className={cn(
        'group/copy relative isolate -mx-2 -my-1 flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
        'before:transition-[background-color,inset] before:duration-150 before:ease-out active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y)',
        'hover:before:bg-bg-a1 active:before:bg-bg-a1',
        className
      )}
    >
      <span className='flex min-w-0 items-center gap-1.5 truncate'>{children}</span>
      <span className='relative size-4 shrink-0 -translate-y-[0.5px]'>
        <Icon
          name='IconClipboard2'
          className={cn(
            'absolute inset-0 size-4 text-fg-2',
            iconSwap,
            copied
              ? iconSwapOut
              : cn(iconSwapIn, 'opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100')
          )}
        />
        <Icon
          name='IconCheckmark1'
          className={cn('absolute inset-0 size-4 text-green-4', iconSwap, copied ? iconSwapIn : iconSwapOut)}
        />
      </span>
    </button>
  );
}
