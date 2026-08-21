'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot='tabs'
      data-orientation={orientation}
      className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'group/tabs-list relative isolate inline-flex w-fit items-center justify-center group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
  {
    variants: {
      variant: {
        default: 'corner-superellipse/1.125 gap-1 rounded-xl bg-bg-2 p-[3px] group-data-horizontal/tabs:h-9',
        ghost: 'gap-3 bg-transparent group-data-horizontal/tabs:h-8',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function TabsList({
  className,
  variant = 'default',
  children,
  ref,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement, []);
  // The active pill slides between tabs instead of cross-fading.
  const indicatorRef = useAnimatedIndicator(listRef, { attribute: 'data-active', press: false });

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot='tabs-list'
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {variant !== 'ghost' ? (
        <div
          ref={indicatorRef}
          aria-hidden
          className='corner-superellipse/1.125 pointer-events-none absolute top-0 left-0 -z-10 rounded-[9px] bg-background opacity-0 shadow-1 dark:bg-bg-4'
          style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot='tabs-trigger'
      className={cn(
        'relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium text-fg-2 text-sm outline-none transition-colors duration-200 ease-out',
        'hover:text-fg-4 active:text-fg-4 data-active:text-fg-4',
        'focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        'group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Segmented: full-height tab; the sliding indicator supplies the pill.
        'group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:rounded-[9px] group-data-[variant=default]/tabs-list:px-3',
        // Ghost: bare text switchers — no indicator, so the content itself
        // takes the press, exactly like the link button.
        'group-data-[variant=ghost]/tabs-list:transition-[color,scale] group-data-[variant=ghost]/tabs-list:enabled:active:scale-[0.975]',
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot='tabs-content'
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
