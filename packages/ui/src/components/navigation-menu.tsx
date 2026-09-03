import { NavigationMenu as NavigationMenuPrimitive } from '@base-ui/react/navigation-menu';
import { Icon } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva } from 'class-variance-authority';

function NavigationMenu({
  align = 'start',
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Root.Props & Pick<NavigationMenuPrimitive.Positioner.Props, 'align'>) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot='navigation-menu'
      className={cn(
        'group/navigation-menu relative flex max-w-max flex-1 items-center justify-center',
        className
      )}
      {...props}
    >
      {children}
      <NavigationMenuPositioner align={align} />
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot='navigation-menu-list'
      className={cn('group flex flex-1 list-none items-center justify-center gap-0', className)}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot='navigation-menu-item'
      className={cn('relative', className)}
      {...props}
    />
  );
}

const navigationMenuTriggerStyle = cva(
  'group/navigation-menu-trigger corner-superellipse/1.125 inline-flex h-8 w-max cursor-pointer items-center justify-center gap-1 rounded-xl px-3 font-medium text-fg-2 text-sm outline-none transition-colors duration-200 hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2 active:text-fg-4 disabled:pointer-events-none disabled:opacity-50 data-open:text-fg-4 data-popup-open:text-fg-4'
);

function NavigationMenuTrigger({ className, children, ...props }: NavigationMenuPrimitive.Trigger.Props) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot='navigation-menu-trigger'
      className={cn(navigationMenuTriggerStyle(), className)}
      {...props}
    >
      {children}
      <Icon
        name='IconChevronDownMedium'
        className='size-3.5 text-fg-1 opacity-100 transition-transform duration-200 group-data-open/navigation-menu-trigger:rotate-180 group-data-popup-open/navigation-menu-trigger:rotate-180'
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({ className, ...props }: NavigationMenuPrimitive.Content.Props) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot='navigation-menu-content'
      className={cn(
        'h-full w-auto p-1 transition-[opacity,translate] duration-200 ease-out',
        'data-ending-style:opacity-0 data-starting-style:opacity-0',
        'data-starting-style:data-activation-direction=left:translate-x-[-32px] data-starting-style:data-activation-direction=right:translate-x-[32px]',
        'data-ending-style:data-activation-direction=left:translate-x-[32px] data-ending-style:data-activation-direction=right:translate-x-[-32px]',
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuPositioner({
  className,
  side = 'bottom',
  sideOffset = 8,
  align = 'start',
  alignOffset = 0,
  ...props
}: NavigationMenuPrimitive.Positioner.Props) {
  return (
    <NavigationMenuPrimitive.Portal>
      <NavigationMenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className={cn(
          'isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-instant:transition-none data-[side=bottom]:before:top-[-10px] data-[side=bottom]:before:right-0 data-[side=bottom]:before:left-0',
          className
        )}
        {...props}
      >
        <NavigationMenuPrimitive.Popup className='corner-superellipse/1.125 relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-xl bg-bg-1 text-fg-3 shadow-3 outline-none transition-[opacity,scale,width,height,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-150'>
          <NavigationMenuPrimitive.Viewport className='relative size-full overflow-hidden' />
        </NavigationMenuPrimitive.Popup>
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPrimitive.Portal>
  );
}

function NavigationMenuLink({ className, ...props }: NavigationMenuPrimitive.Link.Props) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot='navigation-menu-link'
      className={cn(
        'corner-superellipse/1.125 flex items-center gap-2 rounded-lg p-2 text-fg-3 text-sm outline-none transition-colors duration-150 hover:bg-bg-a2/70 hover:text-fg-4 focus-visible:bg-bg-a2/70 focus-visible:text-fg-4 active:bg-bg-a2/70 active:text-fg-4 data-active:text-fg-4',
        "[&_svg:not([class*='size-'])]:size-4.5",
        className
      )}
      {...props}
    />
  );
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPositioner,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
};
