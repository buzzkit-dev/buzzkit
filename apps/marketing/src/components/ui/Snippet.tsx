import { Card } from '@buzzkit/ui/components/card';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef } from 'react';

export function Snippet({
  html,
  className,
  maxHeight = false,
  card = false,
}: {
  html: string;
  children?: never;
  className?: string;
  maxHeight?: boolean;
  card?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const body = (
    <>
      <ScrollFade orientation={maxHeight ? 'both' : 'horizontal'} targetRef={viewport} />
      <div ref={viewport} className={cn('overflow-auto rounded-[inherit]', maxHeight && 'max-h-[26rem]')}>
        <pre className='w-max min-w-full px-4 py-3.5 font-mono text-[13px] text-fg-3 leading-6 whitespace-pre'>
          <code className='font-mono' dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </>
  );

  if (card) return <Card className={cn('relative', className)}>{body}</Card>;
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-bg-2 corner-superellipse/1.125', className)}>
      {body}
    </div>
  );
}
