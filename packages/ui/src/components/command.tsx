'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@buzzkit/ui/components/dialog';
import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon } from '@buzzkit/ui/components/icon';
import { Kbd, KbdGroup } from '@buzzkit/ui/components/kbd';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { SizeAnimator } from '@buzzkit/ui/components/size-animator';
import { cn } from '@buzzkit/ui/lib/utils';
import { Command as CommandPrimitive } from 'cmdk';
import * as React from 'react';

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot='command'
      loop
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command menu',
  description = 'Search for a page or an action.',
  children,
  className,
  finalFocus,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> & {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
  finalFocus?: React.ComponentProps<typeof DialogContent>['finalFocus'];
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        finalFocus={finalFocus}
        className={cn(
          'top-[max(3rem,14vh)] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[560px]',
          className
        )}
      >
        <DialogTitle className='sr-only'>{title}</DialogTitle>
        <DialogDescription className='sr-only'>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  start,
  end,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  start?: React.ReactNode;
  end?: React.ReactNode;
}) {
  return (
    <div
      data-slot='command-input-wrapper'
      className='flex h-[39px] shrink-0 items-center gap-2.5 border-bg-3 border-b px-2.5'
    >
      <Icon name='IconMagnifyingGlass' className='size-4.5 shrink-0 text-fg-2' />
      {start}
      <CommandPrimitive.Input
        data-slot='command-input'
        className={cn(
          'min-w-0 flex-1 bg-transparent font-medium text-fg-4 text-sm outline-none placeholder:font-normal placeholder:text-fg-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
      {end}
    </div>
  );
}

function CommandList({ className, ref, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement);
  const indicatorRef = useAnimatedIndicator(listRef, { attribute: 'data-selected', value: 'true' });

  return (
    <SizeAnimator>
      <CommandPrimitive.List
        ref={listRef}
        data-slot='command-list'
        className={cn(
          'scrollbar-hide relative isolate max-h-[min(--spacing(96),60dvh)] scroll-py-1 overflow-y-auto overscroll-contain p-1',
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
        {props.children}
      </CommandPrimitive.List>
    </SizeAnimator>
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot='command-empty'
      className={cn('py-8 text-center text-fg-2 text-sm', className)}
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot='command-group'
      className={cn(
        'scroll-my-1 overflow-hidden [&_[cmdk-group-heading]]:select-none [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-2 [&_[cmdk-group-heading]]:text-xs',
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot='command-separator'
      className={cn('-mx-1 my-1 h-px bg-bg-3', className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  icon,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & { icon?: MenuItemIcon }) {
  const position = menuIconPosition(icon);
  return (
    <CommandPrimitive.Item
      data-slot='command-item'
      data-icon={position}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-2 pl-2 font-medium text-fg-3 text-sm leading-[18px] outline-hidden data-[disabled=true]:pointer-events-none data-indicator-here:text-fg-4 data-[disabled=true]:opacity-50 [&[data-indicator-here]_svg]:opacity-100 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-opacity [&_svg]:duration-150",
        className
      )}
      {...props}
    >
      {renderMenuIcon(icon, 'inline-start')}
      {children}
      {renderMenuIcon(icon, 'inline-end')}
    </CommandPrimitive.Item>
  );
}

function CommandHint({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span data-slot='command-hint' className={cn('truncate font-normal text-fg-2', className)} {...props} />
  );
}

function CommandShortcut({ keys, className }: { keys: string[]; className?: string }) {
  const chips = keys.map((key, index) => ({ key, id: keys.slice(0, index + 1).join('+') }));
  return (
    <KbdGroup data-slot='command-shortcut' className={cn('ml-auto pl-3', className)}>
      {chips.map((chip) => (
        <Kbd key={chip.id}>{chip.key}</Kbd>
      ))}
    </KbdGroup>
  );
}

function CommandFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='command-footer'
      className={cn(
        'flex h-9 shrink-0 items-center gap-4 border-bg-3 border-t px-3 text-fg-2 text-xs [&_kbd]:bg-bg-2',
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandHint,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
