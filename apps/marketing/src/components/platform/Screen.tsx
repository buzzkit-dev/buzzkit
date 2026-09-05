import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';

export const TONES = {
  sky: { fill: 'var(--sky-4)', dot: 'bg-sky-4' },
  blue: { fill: 'var(--blue-4)', dot: 'bg-blue-4' },
  green: { fill: 'var(--green-4)', dot: 'bg-green-4' },
  red: { fill: 'var(--red-4)', dot: 'bg-red-4' },
  amber: { fill: 'var(--amber-4)', dot: 'bg-amber-4' },
} as const;

export function ScreenHeader({
  parent,
  title,
  description,
  children,
}: {
  parent?: string;
  title: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-3'>
      {parent && (
        <Button
          variant='ghost'
          size='sm'
          icon='IconChevronLeftMedium'
          className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        >
          {parent}
        </Button>
      )}
      <header className='flex items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h2 className='flex items-center gap-2.5 font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            {title}
          </h2>
          <p className='text-base text-fg-2 leading-tighter'>{description}</p>
        </div>
        {children && <div className='flex shrink-0 items-center gap-2'>{children}</div>}
      </header>
    </div>
  );
}

export function Key({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className='flex items-center gap-1.5 text-fg-2 text-xs'>
      <span className={cn('size-2 rounded-full', TONES[tone].dot)} />
      {children}
    </span>
  );
}

export function Delta({ children }: { children: React.ReactNode }) {
  return (
    <span className='flex items-center gap-0.5 font-medium text-green-4 text-sm'>
      <Icon name='IconArrowUpRight' className='size-3.5 opacity-100' />
      {children}
    </span>
  );
}
