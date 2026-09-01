'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon } from '@buzzkit/ui/components/icon';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({
  className,
  containerClassName,
  showTrigger = true,
  ...props
}: ComboboxPrimitive.Input.Props & { containerClassName?: string; showTrigger?: boolean }) {
  return (
    <span className={cn('relative flex min-w-0', containerClassName)}>
      <ComboboxPrimitive.Input
        data-slot='combobox-input'
        className={cn(
          'corner-superellipse/1.125 h-8.5 w-full min-w-0 rounded-xl bg-bg-2 px-3.5 font-medium text-fg-4 text-sm backdrop-blur-md transition-[color,background-color,outline-color,box-shadow] duration-150',
          'placeholder:text-fg-2',
          'outline-[1.5px] outline-transparent focus-visible:outline-primary-4/40 focus-visible:ring-[1.5px] focus-visible:ring-primary-2/60',
          'aria-invalid:outline-red-4 aria-invalid:ring-[1.5px] aria-invalid:ring-red-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          showTrigger && 'pr-9',
          className
        )}
        {...props}
      />
      {showTrigger && (
        <ComboboxPrimitive.Trigger
          data-slot='combobox-trigger'
          aria-label='Show options'
          className='absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-fg-2 outline-none transition-colors duration-150 hover:text-fg-4 disabled:cursor-not-allowed data-popup-open:text-fg-4'
        >
          <Icon name='IconChevronDownMedium' className='pointer-events-none size-4' />
        </ComboboxPrimitive.Trigger>
      )}
    </span>
  );
}

function ComboboxContent({
  className,
  children,
  empty,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  ...props
}: Omit<ComboboxPrimitive.Popup.Props, 'children'> &
  Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    children: ComboboxPrimitive.List.Props['children'];
    empty?: React.ReactNode;
  }) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className='isolate z-50'
      >
        <ComboboxPrimitive.Popup
          data-slot='combobox-content'
          className={cn(
            'group/combobox-content corner-superellipse/1.125 relative isolate z-50 w-max min-w-(--anchor-width) max-w-(--available-width) overflow-hidden whitespace-nowrap rounded-xl bg-popover text-popover-foreground shadow-md',
            'data-open:fade-in-0 data-open:zoom-in-95 origin-(--transform-origin) duration-150 ease-out data-open:animate-in',
            empty === undefined && 'data-empty:hidden',
            className
          )}
          {...props}
        >
          <SizeAnimator>
            <ComboboxList>{children}</ComboboxList>
            {empty !== undefined && <ComboboxEmpty>{empty}</ComboboxEmpty>}
          </SizeAnimator>
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ref, children, ...props }: ComboboxPrimitive.List.Props) {
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement);
  const indicatorRef = useAnimatedIndicator(listRef);
  const content =
    typeof children === 'function' ? (
      <ComboboxPrimitive.Collection>{children}</ComboboxPrimitive.Collection>
    ) : (
      children
    );

  return (
    <>
      <ScrollFade targetRef={listRef} />
      <ComboboxPrimitive.List
        ref={listRef}
        data-slot='combobox-list'
        className={cn(
          'scrollbar-hide relative isolate max-h-[min(--spacing(72),calc(var(--available-height)-16px))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0',
          className
        )}
        {...props}
      >
        <div
          ref={indicatorRef}
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 -z-10 rounded-lg bg-bg-a2 opacity-0'
          style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
        />
        {content}
      </ComboboxPrimitive.List>
    </>
  );
}

function ComboboxItem({
  className,
  children,
  icon,
  ...props
}: ComboboxPrimitive.Item.Props & { icon?: MenuItemIcon }) {
  const position = menuIconPosition(icon);
  return (
    <ComboboxPrimitive.Item
      data-slot='combobox-item'
      data-icon={position}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-8 pl-1.5 font-medium text-fg-3 text-sm outline-hidden data-disabled:pointer-events-none data-indicator-here:text-fg-4 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {renderMenuIcon(icon, 'inline-start')}
      <span className='flex flex-1 items-center gap-2 truncate'>{children}</span>
      {renderMenuIcon(icon, 'inline-end')}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className='pointer-events-none absolute right-2 flex size-4 items-center justify-center' />
        }
      >
        <Icon name='IconCheckmark1' className='pointer-events-none size-4 rotate-[4deg]' />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot='combobox-group' className={cn('scroll-my-1', className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot='combobox-label'
      className={cn('select-none px-2 py-1 font-medium text-fg-2 text-xs', className)}
      {...props}
    />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot='combobox-empty'
      className={cn(
        'hidden w-full justify-center px-3 py-2.5 text-center text-fg-2 text-sm group-data-empty/combobox-content:flex',
        className
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
};
