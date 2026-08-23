import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { Spot } from './spot';

const DESIGN_WIDTH = 640;

const DESIGN_HEIGHT = 400;

export function Browser({
  url,
  children,
  className,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div aria-hidden className='@container relative aspect-[16/10] w-full select-none'>
      <div
        className={cn(
          'corner-superellipse/1.125 absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden rounded-2xl border border-bg-3 bg-bg-1',
          className
        )}
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(calc(100cqw / ${DESIGN_WIDTH}px))`,
        }}
      >
        <div className='flex h-10 shrink-0 items-center gap-3 border-bg-3 border-b px-3'>
          <span className='flex gap-1.5'>
            <span className='size-2.5 rounded-full bg-bg-4' />
            <span className='size-2.5 rounded-full bg-bg-4' />
            <span className='size-2.5 rounded-full bg-bg-4' />
          </span>
          <span className='flex h-6 min-w-0 flex-1 items-center justify-center rounded-md bg-bg-2 px-2'>
            <span className='truncate text-fg-2 text-xs'>{url}</span>
          </span>
        </div>
        <div className='flex min-h-0 flex-1'>{children}</div>
      </div>
    </div>
  );
}

export function Sidebar({
  title,
  items,
  active,
  highlight,
  className,
}: {
  title?: string;
  items: { label: string; icon?: IconName }[];
  active?: string;
  highlight?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-40 shrink-0 flex-col gap-0.5 border-bg-3 border-r bg-background-subtle px-2 py-3',
        className
      )}
    >
      {title && <span className='px-2 pb-2 font-medium text-fg-4 text-xs'>{title}</span>}
      {items.map((item) => {
        const isActive = item.label === active;
        const row = (
          <span
            key={item.label}
            className={cn(
              'flex h-7 items-center gap-2 rounded-lg px-2 text-xs',
              isActive ? 'bg-bg-a2 font-medium text-fg-4' : 'text-fg-2'
            )}
          >
            {item.icon && <Icon name={item.icon} className='size-3.5' />}
            {item.label}
          </span>
        );
        return item.label === highlight ? (
          <Spot key={item.label} className='rounded-lg'>
            {row}
          </Spot>
        ) : (
          row
        );
      })}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-1 flex-col gap-4 p-5', className)}>{children}</div>;
}

export function PageTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <span className='font-medium text-base text-fg-4 leading-tighter'>{children}</span>
      {action}
    </div>
  );
}

export function MockBackLink({ children }: { children: React.ReactNode }) {
  return (
    <span className='flex items-center gap-0.5 text-sky-text text-xs'>
      <Icon name='IconChevronLeftMedium' className='size-3.5 opacity-100' />
      {children}
    </span>
  );
}

export function PortalBar({
  product,
  account,
  highlightAccount,
}: {
  product: string;
  account: React.ReactNode;
  highlightAccount?: boolean;
}) {
  const right = <span className='truncate text-fg-3 text-xs'>{account}</span>;
  return (
    <span className='flex h-9 shrink-0 items-center justify-between gap-3 border-bg-3 border-b px-3'>
      <span className='flex items-center gap-1 font-medium text-fg-4 text-xs'>
        <Icon name='IconAppleFilled' className='size-3.5 opacity-100' />
        {product}
      </span>
      {highlightAccount ? (
        <Spot inset='-inset-x-1.5 -inset-y-1' className='rounded-md'>
          {right}
        </Spot>
      ) : (
        right
      )}
    </span>
  );
}
