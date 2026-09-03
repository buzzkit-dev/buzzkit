'use client';

import { Button } from '@buzzkit/ui/components/button';
import { Calendar } from '@buzzkit/ui/components/calendar';
import { Icon } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Popover, PopoverContent } from '@buzzkit/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@buzzkit/ui/components/select';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';

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
export type FilterGroup<V extends string = string> = { label: string; options: FilterOption<V>[] };

const ANY = '__any__';

function isGroup<V extends string>(entry: FilterOption<V> | FilterGroup<V>): entry is FilterGroup<V> {
  return 'options' in entry;
}

function FilterSelect<V extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
  disabled,
}: {
  label: string;
  value: V | null;
  options: FilterOption<V>[] | FilterGroup<V>[];
  onValueChange: (value: V | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const any = { value: ANY, label: `Any ${label.toLowerCase()}` };
  const groups = options.filter(isGroup);
  const items = [any, ...options.flatMap((entry) => (isGroup(entry) ? entry.options : [entry]))];
  const item = (entry: FilterOption<string>) => (
    <SelectItem key={entry.value} value={entry.value}>
      {entry.label}
    </SelectItem>
  );
  return (
    <Select
      items={items}
      value={value ?? ANY}
      onValueChange={(next) => onValueChange(next === ANY || next === null ? null : (next as V))}
    >
      <SelectTrigger
        aria-label={label}
        disabled={disabled}
        data-active={value !== null ? '' : undefined}
        className={cn('w-auto data-active:text-fg-4', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.length === 0
          ? items.map(item)
          : [
              item(any),
              ...groups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map(item)}
                </SelectGroup>
              )),
            ]}
      </SelectContent>
    </Select>
  );
}

const CUSTOM = '__custom__';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseRange(value: string | null): DateRange | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})\.\.(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const from = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const to = new Date(Number(match[4]), Number(match[5]) - 1, Number(match[6]));
  return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to ? null : { from, to };
}

function formatRange({ from, to }: { from: Date; to: Date }): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const thisYear = to.getFullYear() === new Date().getFullYear();
  const day = (date: Date, year: boolean) =>
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
    });
  return `${day(from, !sameYear)} – ${day(to, !thisYear || !sameYear)}`;
}

function FilterRange({
  label = 'Time',
  presets,
  value,
  onValueChange,
  className,
  allowAny = true,
  disabled,
}: {
  label?: string;
  presets: FilterOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  className?: string;
  /** Offer "Any time" (clears the range). Off for pages that always need a window. */
  allowAny?: boolean;
  disabled?: boolean;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined);
  const custom = parseRange(value);
  const items = [
    ...(allowAny ? [{ value: ANY, label: `Any ${label.toLowerCase()}` }] : []),
    ...presets,
    ...(custom && value ? [{ value, label: formatRange(custom as { from: Date; to: Date }) }] : []),
    { value: CUSTOM, label: 'Custom range' },
  ];
  const complete = draft?.from && draft?.to ? { from: draft.from, to: draft.to } : null;

  return (
    <>
      <Select
        items={items}
        value={value ?? ANY}
        onValueChange={(next) => {
          if (next === CUSTOM) {
            setDraft(custom ?? undefined);
            setOpen(true);
            return;
          }
          onValueChange(next === ANY || next === null ? null : String(next));
        }}
      >
        <SelectTrigger
          ref={triggerRef}
          aria-label={label}
          disabled={disabled}
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent anchor={triggerRef} align='start' className='w-auto gap-1 p-1'>
          <Calendar
            mode='range'
            numberOfMonths={2}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={custom?.from ?? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)}
            disabled={{ after: new Date() }}
          />
          <div className='flex items-center justify-between gap-2 px-2 pb-1'>
            <span className='text-fg-2 text-xs'>
              {complete ? formatRange(complete) : 'Pick a start and an end day'}
            </span>
            <span className='flex gap-1.5'>
              <Button variant='ghost' size='sm' onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size='sm'
                disabled={!complete}
                onClick={() => {
                  if (!complete) return;
                  onValueChange(`${dayKey(complete.from)}..${dayKey(complete.to)}`);
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </>
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

export { FilterBar, FilterClear, FilterRange, FilterSearch, FilterSelect };
