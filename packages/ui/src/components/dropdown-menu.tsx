'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { HighlightList } from '@buzzkit/ui/components/highlight-list';
import { Icon } from '@buzzkit/ui/components/icon';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

type DropdownMenuOpenContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};
const DropdownMenuOpenContext = React.createContext<DropdownMenuOpenContextValue | null>(null);

function DropdownMenu({ open: openProp, defaultOpen, onOpenChange, ...props }: MenuPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen, {
        reason: 'trigger-press',
      } as Parameters<NonNullable<typeof onOpenChange>>[1]);
    },
    [isControlled, onOpenChange]
  );

  const contextValue = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <DropdownMenuOpenContext.Provider value={contextValue}>
      <MenuPrimitive.Root
        data-slot='dropdown-menu'
        open={open}
        onOpenChange={(next, details) => {
          if (!isControlled) setUncontrolledOpen(next);
          onOpenChange?.(next, details);
        }}
        {...props}
      />
    </DropdownMenuOpenContext.Provider>
  );
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot='dropdown-menu-portal' {...props} />;
}

function DropdownMenuTrigger({ onMouseDown, onClick, ...props }: MenuPrimitive.Trigger.Props) {
  const ctx = React.useContext(DropdownMenuOpenContext);
  return (
    <MenuPrimitive.Trigger
      data-slot='dropdown-menu-trigger'
      onMouseDown={(event) => {
        // Base UI opens the popup on mousedown. Block it so it opens on click
        // (mouseup) instead — matching button behavior and letting the
        // press-scale animation play first.
        (event as typeof event & { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
        onMouseDown?.(event);
      }}
      onClick={(event) => {
        ctx?.setOpen(!ctx.open);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  anchor,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'anchor'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className='isolate z-50 outline-none'
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
      >
        <MenuPrimitive.Popup
          data-slot='dropdown-menu-content'
          className={cn(
            // Anchor width is a floor, not a cage: long items grow the popup.
            'corner-superellipse/1.125 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--available-height) min-w-[max(8rem,var(--anchor-width))] origin-(--transform-origin) overflow-y-auto overflow-x-hidden whitespace-nowrap rounded-xl bg-popover text-popover-foreground shadow-md outline-none duration-200 data-closed:animate-out data-open:animate-in data-closed:overflow-hidden',
            className
          )}
          {...props}
        >
          <HighlightList indicatorClassName='data-[variant=destructive]:bg-red-a2'>{children}</HighlightList>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot='dropdown-menu-group' {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot='dropdown-menu-label'
      data-inset={inset}
      className={cn('select-none px-2 py-1 font-medium text-fg-2 text-xs data-inset:pl-7', className)}
      {...props}
    />
  );
}

// The sliding indicator (HighlightList) draws the highlight background, so
// items only shift their own text color while it sits on them.
const ITEM_BASE =
  // Icons run at 50% opacity by default; when the highlight sits on an item
  // they rise to full so they darken in step with the text.
  // leading-[18px] keeps item heights integral (12px padding + 18px line box);
  // the type-scale default of 1.25 yields 29.5px items, whose half-pixel edges
  // antialias the menu's bottom padding away at some popup positions.
  "relative flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-2 font-medium text-fg-3 text-sm leading-[18px] outline-hidden select-none data-indicator-here:text-fg-4 data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&[data-indicator-here]_svg]:opacity-100 [&_svg]:transition-opacity [&_svg]:duration-150";

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  icon,
  children,
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
  icon?: MenuItemIcon;
}) {
  const position = menuIconPosition(icon);
  return (
    <MenuPrimitive.Item
      data-slot='dropdown-menu-item'
      data-inset={inset}
      data-variant={variant}
      data-icon={position}
      className={cn(
        ITEM_BASE,
        'pr-2 data-[variant=destructive]:data-indicator-here:text-red-4 data-[variant=destructive]:text-red-4/90 data-[variant=destructive]:*:[svg]:text-red-4',
        className
      )}
      {...props}
    >
      {renderMenuIcon(icon, 'inline-start')}
      {children}
      {renderMenuIcon(icon, 'inline-end')}
    </MenuPrimitive.Item>
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot='dropdown-menu-sub' {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot='dropdown-menu-sub-trigger'
      data-inset={inset}
      className={cn(ITEM_BASE, 'pr-2 data-open:text-fg-4 data-popup-open:text-fg-4', className)}
      {...props}
    >
      {children}
      <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = 'start',
  alignOffset = -3,
  side = 'right',
  // Anchored to the *item*, which is inset by the list's 4px padding — so the
  // offset is that padding plus the 8px gap we actually want to see.
  sideOffset = 12,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot='dropdown-menu-sub-content'
      className={cn('w-auto min-w-[96px] shadow-lg', className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot='dropdown-menu-checkbox-item'
      data-inset={inset}
      className={cn(ITEM_BASE, 'pr-8 [&[data-indicator-here]_span]:text-fg-4', className)}
      checked={checked}
      {...props}
    >
      {/* Pinned to fg-4 so the checkmark doesn't shift color when the hover highlight arrives. */}
      <span
        className='pointer-events-none absolute right-2 flex items-center justify-center text-fg-4'
        data-slot='dropdown-menu-checkbox-item-indicator'
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <Icon name='IconCheckmark1' className='size-4 rotate-[4deg]' />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot='dropdown-menu-radio-group' {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot='dropdown-menu-radio-item'
      data-inset={inset}
      className={cn(ITEM_BASE, 'pr-8 [&[data-indicator-here]_span]:text-fg-4', className)}
      {...props}
    >
      {/* Pinned to fg-4 so the checkmark doesn't shift color when the hover highlight arrives. */}
      <span
        className='pointer-events-none absolute right-2 flex items-center justify-center text-fg-4'
        data-slot='dropdown-menu-radio-item-indicator'
      >
        <MenuPrimitive.RadioItemIndicator>
          <Icon name='IconCheckmark1' className='size-4 rotate-[4deg]' />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn('-mx-1 my-1 h-px bg-bg-3', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot='dropdown-menu-shortcut'
      className={cn('ml-auto text-fg-2 text-xs tracking-widest', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
