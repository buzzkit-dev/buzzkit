import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { Spot, SpotRing } from './spot';

export function MockButton({
  children,
  variant = 'primary',
  icon,
  className,
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'accent' | 'secondary' | 'link';
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-medium text-xs',
        variant === 'primary' && 'bg-fg-4 text-background',
        variant === 'accent' && 'bg-sky-4 text-white',
        variant === 'secondary' && 'bg-bg-2 text-fg-4',
        variant === 'link' && 'px-0 text-sky-text',
        className
      )}
    >
      {icon && <Icon name={icon} className='size-3.5 opacity-100' />}
      {children}
    </span>
  );
}

export function MockInput({
  label,
  value,
  placeholder,
  className,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-col gap-1', className)}>
      {label && <span className='font-medium text-fg-3 text-xs'>{label}</span>}
      <span className='flex h-7.5 items-center rounded-lg border border-bg-4 bg-bg-1 px-2.5 text-xs'>
        <span className={cn(value ? 'text-fg-4' : 'text-fg-1')}>{value ?? placeholder}</span>
      </span>
    </span>
  );
}

export function MockCheckbox({ label, checked, hint }: { label: string; checked?: boolean; hint?: string }) {
  return (
    <span className='flex min-w-0 items-center gap-2.5 py-1.5 text-xs'>
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[5px] border',
          checked ? 'border-sky-4 bg-sky-4' : 'border-bg-4 bg-bg-1'
        )}
      >
        {checked && <Icon name='IconCheckmark1' className='size-3 rotate-[4deg] text-white opacity-100' />}
      </span>
      <span className={cn('truncate', checked ? 'font-medium text-fg-4' : 'text-fg-3')}>{label}</span>
      {hint && <span className='text-fg-2'>{hint}</span>}
    </span>
  );
}

export function MockSelect({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-col gap-1', className)}>
      <span className='font-medium text-fg-3 text-xs'>{label}</span>
      <span className='flex h-7.5 items-center justify-between gap-2 rounded-lg border border-bg-4 bg-bg-1 px-2.5 text-fg-4 text-xs'>
        <span className='truncate'>{value}</span>
        <Icon name='IconChevronDownMedium' className='size-3.5 shrink-0 text-fg-2' />
      </span>
    </span>
  );
}

export function MockRow({
  cells,
  header,
  highlight,
  columns,
  className,
}: {
  cells: React.ReactNode[];
  header?: boolean;
  highlight?: boolean;
  columns?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid h-8 items-center gap-3 border-bg-3 border-b px-1 text-xs last:border-b-0',
        header ? 'font-medium text-fg-2' : 'text-fg-3',
        highlight && 'relative z-10 rounded-md border-transparent bg-bg-1',
        className
      )}
      style={{ gridTemplateColumns: columns ?? `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {highlight && <SpotRing className='inset-0 rounded-[inherit]' />}
      {cells.map((cell, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static illustration cells never reorder
        <span key={index} className='truncate'>
          {cell}
        </span>
      ))}
    </div>
  );
}

export function MockTabs({
  items,
  active,
  highlight,
}: {
  items: string[];
  active: string;
  highlight?: string;
}) {
  return (
    <div className='flex gap-4 border-bg-3 border-b'>
      {items.map((item) => {
        const tab = (
          <span
            key={item}
            className={cn(
              '-mb-px flex h-8 items-center border-b-2 text-xs',
              item === active ? 'border-sky-4 font-medium text-fg-4' : 'border-transparent text-fg-2'
            )}
          >
            {item}
          </span>
        );
        return item === highlight ? (
          <Spot key={item} className='rounded-md' inset='-inset-x-2 -inset-y-0.5'>
            {tab}
          </Spot>
        ) : (
          tab
        );
      })}
    </div>
  );
}

export function MockDialog({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'corner-superellipse/1.125 flex w-full max-w-72 flex-col gap-3 rounded-2xl bg-bg-1 p-4 shadow-3',
        className
      )}
    >
      <span className='font-medium text-fg-4 text-sm leading-tighter'>{title}</span>
      {children}
    </div>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <span className='flex items-start gap-2 rounded-lg bg-amber-1 px-2.5 py-2 text-amber-text text-xs'>
      <Icon name='IconExclamationTriangle' className='mt-px size-3.5 shrink-0 opacity-100' />
      <span className='text-pretty'>{children}</span>
    </span>
  );
}

export function MockInfo({ children }: { children: React.ReactNode }) {
  return (
    <span className='flex items-start gap-2 rounded-lg bg-sky-1 px-2.5 py-2 text-sky-text text-xs'>
      <Icon name='IconInfoSimple' className='mt-px size-3.5 shrink-0 opacity-100' />
      <span className='text-pretty'>{children}</span>
    </span>
  );
}
