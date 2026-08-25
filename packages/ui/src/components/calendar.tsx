'use client';

import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';
import { type DayButton, DayPicker, getDefaultClassNames } from 'react-day-picker';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('group/calendar p-2 [--cell-size:--spacing(8)]', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaults.months),
        month: cn('flex w-full flex-col gap-3', defaults.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between', defaults.nav),
        button_previous: cn(
          'flex size-(--cell-size) select-none items-center justify-center rounded-lg text-fg-2 outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-bg-a1 hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2 active:scale-95 aria-disabled:pointer-events-none aria-disabled:opacity-40',
          defaults.button_previous
        ),
        button_next: cn(
          'flex size-(--cell-size) select-none items-center justify-center rounded-lg text-fg-2 outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-bg-a1 hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2 active:scale-95 aria-disabled:pointer-events-none aria-disabled:opacity-40',
          defaults.button_next
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaults.month_caption
        ),
        caption_label: cn('select-none font-medium text-fg-4 text-sm', defaults.caption_label),
        month_grid: cn('w-full border-collapse', defaults.month_grid),
        weekdays: cn('flex', defaults.weekdays),
        weekday: cn('flex-1 select-none font-normal text-fg-2 text-xs', defaults.weekday),
        week: cn('mt-1 flex w-full', defaults.week),
        day: cn('group/day relative aspect-square h-full w-full select-none p-0 text-center', defaults.day),
        range_start: cn(
          'relative isolate z-0 rounded-l-lg bg-bg-a1 after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-bg-a1',
          defaults.range_start
        ),
        range_middle: cn('bg-bg-a1', defaults.range_middle),
        range_end: cn(
          'relative isolate z-0 rounded-r-lg bg-bg-a1 after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-bg-a1',
          defaults.range_end
        ),
        today: cn(defaults.today),
        outside: cn('text-fg-1', defaults.outside),
        disabled: cn('text-fg-1 opacity-50', defaults.disabled),
        hidden: cn('invisible', defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div data-slot='calendar' ref={rootRef} className={cn(className)} {...props} />
        ),
        Chevron: ({ orientation, className }) => (
          <Icon
            name={orientation === 'left' ? 'IconChevronLeftMedium' : 'IconChevronRightMedium'}
            className={cn('size-4', className)}
          />
        ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const single =
    modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle;
  const highlighted = modifiers.selected || modifiers.range_start || modifiers.range_end;

  return (
    <button
      ref={ref}
      type='button'
      data-day={`${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`}
      data-selected-single={single || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      className={cn(
        'relative isolate z-10 flex size-(--cell-size) cursor-pointer items-center justify-center rounded-lg text-fg-3 text-sm outline-none transition-[background-color,color,scale] duration-150 ease-out',
        'hover:bg-bg-a2 hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2 active:scale-95',
        'data-range-middle:rounded-none data-range-middle:text-fg-4 data-range-middle:hover:bg-bg-a2',
        'data-range-end:bg-primary-4 data-range-end:text-primary-foreground data-range-end:hover:bg-primary-4 data-range-start:bg-primary-4 data-range-start:text-primary-foreground data-range-start:hover:bg-primary-4 data-selected-single:bg-primary-4 data-selected-single:text-primary-foreground data-selected-single:hover:bg-primary-4',
        'group-data-[disabled=true]/day:pointer-events-none',
        modifiers.outside && !highlighted && 'text-fg-1 hover:text-fg-3',
        modifiers.today && !highlighted && 'bg-bg-a1 font-medium text-fg-4',
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
