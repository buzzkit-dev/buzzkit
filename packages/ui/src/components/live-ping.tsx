import { cn } from '@buzzkit/ui/lib/utils';

/**
 * The waiting dot (design.md §6): the app is ready and listening, not
 * working — that is what separates it from a spinner. A solid core under a
 * soft expanding ring; place it beside the thing it waits for and remove it
 * the moment the awaited event arrives.
 */
export function LivePing({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('relative flex size-2', className)}>
      <span className='absolute inset-0 animate-ping rounded-full bg-green-4 opacity-60 motion-reduce:animate-none' />
      <span className='relative size-full rounded-full bg-green-4' />
    </span>
  );
}
