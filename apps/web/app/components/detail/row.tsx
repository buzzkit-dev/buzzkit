import { Icon } from '@buzzkit/ui/components/icon';
import { iconSwap, iconSwapIn, iconSwapOut } from '@buzzkit/ui/lib/icon-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';

export function DetailRow({
  label,
  copy,
  children,
}: {
  label: string;
  copy?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyValue = () => {
    if (!copy) return;
    navigator.clipboard.writeText(copy).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className='flex min-h-10 items-center gap-6 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='w-36 shrink-0 text-fg-2 text-sm'>{label}</dt>
      <dd className='flex min-w-0 flex-1 items-center text-fg-4 text-sm'>
        {copy ? (
          <button
            type='button'
            aria-label={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) return;
              copyValue();
            }}
            className={cn(
              'group/copy -mx-2 -my-1 relative isolate flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
              "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
              'before:transition-[background-color,inset] before:duration-150 before:ease-out active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y)',
              'hover:before:bg-bg-a1 active:before:bg-bg-a1'
            )}
          >
            <span className='flex min-w-0 items-center gap-1.5 truncate'>{children}</span>
            <span className='-translate-y-[0.5px] relative size-4 shrink-0'>
              <Icon
                name='IconClipboard2'
                className={cn(
                  'absolute inset-0 size-4 text-fg-2',
                  iconSwap,
                  copied
                    ? iconSwapOut
                    : cn(
                        iconSwapIn,
                        'opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100'
                      )
                )}
              />
              <Icon
                name='IconCheckmark1'
                className={cn(
                  'absolute inset-0 size-4 text-green-4',
                  iconSwap,
                  copied ? iconSwapIn : iconSwapOut
                )}
              />
            </span>
          </button>
        ) : (
          <span className='flex min-w-0 items-center gap-1.5'>{children}</span>
        )}
      </dd>
    </div>
  );
}
