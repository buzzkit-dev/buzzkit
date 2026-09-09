import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

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

function CardHeader({
  className,
  divider = false,
  ...props
}: React.ComponentProps<'div'> & { divider?: boolean }) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        'grid auto-rows-min items-start gap-0.5 px-4 py-4 has-data-[slot=card-description]:grid-rows-[auto_auto] group-has-data-[slot=card-content]/card:pb-[13px] sm:has-data-[slot=card-action]:pr-28',
        divider && 'border-bg-3 [&:has(+_:not([data-slot=empty-state]))]:border-b',
        'relative sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:absolute sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:inset-y-0 sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:right-4 sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:my-auto sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:h-fit',
        'max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:[&>[data-slot=card-description]]:order-last max-sm:[&>[data-slot=card-title]]:w-auto max-sm:[&>[data-slot=card-title]]:min-w-0 max-sm:[&>[data-slot=card-title]]:flex-auto max-sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:max-w-full max-sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:overflow-x-auto max-sm:[&>[data-slot=card-title]~*:not([data-slot=card-description])]:py-1',
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
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <>
      <ScrollFade orientation='horizontal' size={16} targetRef={ref} />
      <div
        ref={ref}
        data-slot='card-action'
        className={cn('flex min-w-0 items-center', className)}
        {...props}
      />
    </>
  );
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
