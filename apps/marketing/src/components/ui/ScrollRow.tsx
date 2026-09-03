import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef } from 'react';

export function ScrollRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <div className={cn('relative', className)}>
      <ScrollFade orientation='horizontal' targetRef={viewport} />
      <div ref={viewport} className='overflow-x-auto'>
        <div className='w-max min-w-full'>{children}</div>
      </div>
    </div>
  );
}
