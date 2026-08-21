'use client';

import { useIsMobile } from '@buzzkit/ui/hooks/use-mobile';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

function Drawer({
  direction,
  responsive = false,
  shouldScaleBackground,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { responsive?: boolean }) {
  const isMobile = useIsMobile();
  const resolved = direction ?? (responsive && !isMobile ? 'left' : 'bottom');
  return (
    <DrawerPrimitive.Root
      data-slot='drawer'
      direction={resolved}
      shouldScaleBackground={shouldScaleBackground ?? resolved === 'bottom'}
      {...props}
    />
  );
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot='drawer-close' {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot='drawer-portal' {...props} />;
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot='drawer-overlay'
      className={cn('fixed inset-0 z-50 bg-fg-4/15', className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  style,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { showHandle?: boolean }) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot='drawer-content'
        style={{ '--initial-transform': 'calc(100% + 8px)', ...style } as React.CSSProperties}
        className={cn(
          'group/drawer fixed z-50 flex flex-col bg-bg-1 outline-none',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-6 data-[vaul-drawer-direction=bottom]:h-[96%] data-[vaul-drawer-direction=bottom]:rounded-t-3xl',
          'data-[vaul-drawer-direction=left]:after:hidden data-[vaul-drawer-direction=right]:after:hidden',
          'data-[vaul-drawer-direction=left]:top-2 data-[vaul-drawer-direction=left]:bottom-2 data-[vaul-drawer-direction=left]:left-2 data-[vaul-drawer-direction=left]:w-[19.375rem] data-[vaul-drawer-direction=left]:rounded-3xl data-[vaul-drawer-direction=left]:shadow-4',
          'data-[vaul-drawer-direction=right]:top-2 data-[vaul-drawer-direction=right]:right-2 data-[vaul-drawer-direction=right]:bottom-2 data-[vaul-drawer-direction=right]:w-[19.375rem] data-[vaul-drawer-direction=right]:rounded-3xl data-[vaul-drawer-direction=right]:shadow-4',
          className
        )}
        {...props}
      >
        {showHandle && (
          <div className='flex shrink-0 justify-center pt-3 pb-1 group-data-[vaul-drawer-direction=left]/drawer:hidden group-data-[vaul-drawer-direction=right]/drawer:hidden'>
            <DrawerPrimitive.Handle className='!bg-bg-4 h-1 w-9 rounded-full' />
          </div>
        )}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='drawer-header' className={cn('flex shrink-0 flex-col p-4', className)} {...props} />;
}

function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='drawer-body'
      className={cn('min-h-0 flex-1 overflow-y-auto px-4', className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='drawer-footer'
      className={cn('mt-auto flex shrink-0 flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot='drawer-title'
      className={cn('font-medium text-base text-fg-4', className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot='drawer-description'
      className={cn('text-pretty text-fg-2 text-sm', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
