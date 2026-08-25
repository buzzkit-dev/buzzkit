'use client';

import { Button } from '@buzzkit/ui/components/button';
import { Icon } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

function FilterBar({ className, children, ...props }: React.ComponentProps<'div'>) {
  const parts = React.Children.toArray(children);
  const search = parts.filter((part) => React.isValidElement(part) && part.type === FilterSearch);
  const facets = parts.filter((part) => !search.includes(part));

  return (
    <div
      data-slot='filter-bar'
      className={cn('-mb-2.5 flex shrink-0 items-center justify-between gap-2', className)}
      {...props}
    >
      <div className='flex min-w-0 flex-wrap items-center gap-2'>{facets}</div>
      {search}
    </div>
  );
}

function FilterSearch({
  className,
  loading,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'loading'> & { loading?: boolean }) {
  return (
    <span data-slot='filter-search' className={cn('relative inline-flex w-64 shrink-0', className)}>
      <Icon
        name='IconMagnifyingGlass'
        className='pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-fg-2'
      />
      <Input
        type='search'
        autoComplete='off'
        spellCheck={false}
        loading={loading ?? false}
        className='w-full [&_input]:pl-9'
        {...props}
      />
    </span>
  );
}

export type FilterOption<V extends string = string> = { value: V; label: React.ReactNode };

const ANY = '__any__';

function FilterSelect<V extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string;
  value: V | null;
  options: FilterOption<V>[];
  onValueChange: (value: V | null) => void;
  className?: string;
}) {
  const items = [{ value: ANY, label: `Any ${label.toLowerCase()}` }, ...options];
  return (
    <Select
      items={items}
      value={value ?? ANY}
      onValueChange={(next) => onValueChange(next === ANY || next === null ? null : (next as V))}
    >
      <SelectTrigger
        aria-label={label}
        data-active={value !== null ? '' : undefined}
        className={cn('w-auto data-active:text-fg-4', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterClear({ className, ...props }: Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button
      variant='ghost'
      size='sm'
      icon='IconCrossMedium'
      className={cn('text-fg-2', className)}
      {...props}
    >
      Clear
    </Button>
  );
}

export { FilterBar, FilterClear, FilterSearch, FilterSelect };
