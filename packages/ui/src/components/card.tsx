import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card'
      className={cn(
        'group/card corner-superellipse/1.125 flex w-full flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        'grid auto-rows-min items-start gap-0.5 px-4 py-4 group-has-data-[slot=card-content]/card:pb-[13px] has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
        'relative [&>[data-slot=card-title]~*:not([data-slot=card-description])]:absolute [&>[data-slot=card-title]~*:not([data-slot=card-description])]:inset-y-0 [&>[data-slot=card-title]~*:not([data-slot=card-description])]:right-4 [&>[data-slot=card-title]~*:not([data-slot=card-description])]:my-auto [&>[data-slot=card-title]~*:not([data-slot=card-description])]:h-fit',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-title'
      className={cn('flex w-full items-center gap-1 font-medium text-fg-4 leading-tighter', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-description'
      className={cn('w-full text-pretty text-fg-2 text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='card-action' className={cn('flex items-center', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot='card-content' className={cn('flex flex-col gap-5 px-4 pb-3.5', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-footer'
      className={cn('flex min-h-12 items-center justify-between border-bg-3 border-t px-4 py-2', className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
