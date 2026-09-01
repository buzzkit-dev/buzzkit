'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { HighlightList } from '@buzzkit/ui/components/highlight-list';
import { Icon } from '@buzzkit/ui/components/icon';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

type SelectItemMeta = { value: unknown; label?: React.ReactNode; icon?: MenuItemIcon };

type SelectOpenContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  items?: readonly SelectItemMeta[];
};
const SelectOpenContext = React.createContext<SelectOpenContextValue | null>(null);

function Select<Value, Multiple extends boolean | undefined = false>({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root<Value, Multiple>>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(nextOpen);
      // Base UI's onOpenChange signature includes event details we don't have
      // here (manual open on click). Cast to pass a minimal synthetic detail.
      onOpenChange?.(nextOpen, {
        reason: 'trigger-press',
      } as Parameters<NonNullable<typeof onOpenChange>>[1]);
    },
    [isControlled, onOpenChange]
  );

  // Base UI accepts `items` for value→label mapping; we also read it to mirror
  // the selected item's icon in the trigger (see SelectValue).
  const items = (props as { items?: readonly SelectItemMeta[] }).items;
  const contextValue = React.useMemo(() => ({ open, setOpen, items }), [open, setOpen, items]);

  return (
    <SelectOpenContext.Provider value={contextValue}>
      <SelectPrimitive.Root
        open={open}
        onOpenChange={(next, details) => {
          if (!isControlled) setUncontrolledOpen(next);
          onOpenChange?.(next, details);
        }}
        {...props}
      />
    </SelectOpenContext.Provider>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group data-slot='select-group' className={cn('scroll-my-1', className)} {...props} />
  );
}

function SelectValue({ className, children, placeholder, ...props }: SelectPrimitive.Value.Props) {
  const ctx = React.useContext(SelectOpenContext);
  return (
    <SelectPrimitive.Value
      data-slot='select-value'
      className={cn('flex flex-1 items-center gap-2 text-left', className)}
      {...props}
    >
      {children ??
        ((value: unknown) => {
          if (value == null || value === '') return placeholder ?? null;
          const item = ctx?.items?.find((i) => i.value === value);
          // Unknown value (not listed in `items`) still renders — never blank.
          if (!item) return String(value);
          return (
            <>
              {renderMenuIcon(item.icon, 'inline-start')}
              {item.label ?? String(value)}
            </>
          );
        })}
    </SelectPrimitive.Value>
  );
}

function SelectTrigger({
  className,
  children,
  variant = 'default',
  onMouseDown,
  onClick,
  ...props
}: SelectPrimitive.Trigger.Props & {
  /** `ghost`: no fill at rest — the background only appears on hover/open. */
  variant?: 'default' | 'ghost';
}) {
  const ctx = React.useContext(SelectOpenContext);
  return (
    <SelectPrimitive.Trigger
      data-slot='select-trigger'
      data-variant={variant}
      onMouseDown={(event) => {
        // Base UI opens the popup on mousedown. Block it so it opens on click
        // (mouseup) instead — the press-scale animation gets a chance to show.
        (event as typeof event & { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
        onMouseDown?.(event);
      }}
      onClick={(event) => {
        ctx?.setOpen(!ctx.open);
        onClick?.(event);
      }}
      className={cn(
        'group/select-trigger relative isolate flex w-fit cursor-pointer select-none items-center justify-between gap-1.5 whitespace-nowrap font-medium text-fg-4 text-sm transition-[color,opacity] duration-150 ease-out',
        // One size, matching the default button exactly.
        'corner-superellipse/1.125 h-8 rounded-xl px-2.5',
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:transition-[background-color,box-shadow,inset] before:duration-150 before:ease-out before:content-['']",
        'enabled:active:before:inset-x-(--press-inset-x) enabled:active:before:inset-y-(--press-inset-y)',
        variant === 'ghost'
          ? 'enabled:active:before:bg-bg-a2/70 enabled:hover:before:bg-bg-a2/70 aria-expanded:before:bg-bg-a2'
          : 'before:bg-bg-2 enabled:active:before:bg-bg-3/80 enabled:hover:before:bg-bg-3/80 aria-expanded:before:bg-bg-3/80',
        'outline-[1.5px] outline-transparent focus-visible:outline-primary-4/40 focus-visible:ring-[1.5px] focus-visible:ring-primary-2/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:focus-visible:outline-red-4 aria-invalid:focus-visible:ring-red-2',
        'data-placeholder:text-fg-2',
        '*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<Icon name='IconChevronDownMedium' className='pointer-events-none size-4 text-fg-2' />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  // Native-select behavior: the popup opens *over* the trigger with the selected
  // item sitting exactly on it. Base UI lines the item's text up with the
  // trigger's value text, so both must start at the same x — that's why the
  // trigger mirrors the item's icon and item padding is tuned to match
  // (list p-1 4px + item pl-1.5 6px == trigger px-2.5 10px).
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className='isolate z-50'
      >
        <SelectPrimitive.Popup
          data-slot='select-content'
          className={cn(
            // Anchor width is a floor, not a cage: long items grow the popup,
            // and the positioner picks the side with room for it. The popup is a
            // static shell: the list scrolls, and the surface lives on ::before so
            // only the background animates while text lands instantly.
            'corner-superellipse/1.125 relative isolate z-50 flex max-h-(--available-height) min-w-(--anchor-width) flex-col whitespace-nowrap rounded-xl text-popover-foreground',
            "before:corner-superellipse/1.125 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-popover before:shadow-md before:content-['']",
            // Entry only; closing is instant.
            'before:origin-(--transform-origin) before:duration-150 before:ease-out data-open:before:animate-in',
            // Beside the trigger: the surface fades and grows from 95%.
            'data-open:before:fade-in-0 data-open:before:zoom-in-95',
            // Over the trigger (Base UI reports side "none" when the selected item
            // is aligned with it): the surface takes over from the trigger's press,
            // growing 0.975 → 1 in place, no fade.
            'data-open:data-[side=none]:before:fade-in-100 data-open:data-[side=none]:before:zoom-in-[0.975] data-[side=none]:before:origin-center',
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
            <HighlightList>{children}</HighlightList>
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot='select-label'
      className={cn('select-none px-2 py-1 font-medium text-fg-2 text-xs', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  icon,
  ...props
}: SelectPrimitive.Item.Props & { icon?: MenuItemIcon }) {
  const position = menuIconPosition(icon);
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      data-icon={position}
      className={cn(
        // The sliding indicator draws the highlight; items only shift text color.
        // pl-1.5 is load-bearing: list p-1 (4px) + pl-1.5 (6px) equals the
        // trigger's px-2.5, so the aligned popup sits exactly over the trigger.
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-8 pl-1.5 font-medium text-fg-3 text-sm outline-hidden data-disabled:pointer-events-none data-indicator-here:text-fg-4 data-disabled:opacity-50 [&[data-indicator-here]_span]:text-fg-4 [&[data-indicator-here]_svg]:opacity-100 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-opacity [&_svg]:duration-150 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className='flex flex-1 shrink-0 items-center gap-2 whitespace-nowrap'>
        {renderMenuIcon(icon, 'inline-start')}
        {children}
      </SelectPrimitive.ItemText>
      {renderMenuIcon(icon, 'inline-end')}
      <SelectPrimitive.ItemIndicator
        render={
          <span className='pointer-events-none absolute right-2 flex size-4 items-center justify-center' />
        }
      >
        <Icon name='IconCheckmark1' className='pointer-events-none size-4 rotate-[4deg]' />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot='select-separator'
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-bg-3', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot='select-scroll-up-button'
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name='IconChevronTopMedium' className='size-4' />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot='select-scroll-down-button'
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name='IconChevronDownMedium' className='size-4' />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
