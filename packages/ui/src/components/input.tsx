import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'corner-superellipse/1.125 h-8.5 w-full min-w-0 rounded-xl bg-bg-2 px-3.5 font-medium text-fg-4 text-sm backdrop-blur-md transition-[color,background-color,outline-color,box-shadow] duration-150',
        'outline-[1.5px] outline-transparent placeholder:text-fg-2 focus:outline-primary-4/40 focus:ring-[1.5px] focus:ring-primary-2/60',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-fg-4 file:text-sm',
        'disabled:cursor-not-allowed disabled:text-fg-1 disabled:opacity-50',
        // Read-only fields stay in the tab order, so they keep a focus ring —
        // quieter than an editable field's, but never absent.
        'read-only:cursor-default read-only:border read-only:border-bg-4 read-only:text-fg-2 read-only:focus:outline-bg-4 read-only:focus:ring-0',
        'aria-invalid:ring-1 aria-invalid:ring-red-4 aria-invalid:focus:outline-red-4 aria-invalid:focus:ring-[1.5px] aria-invalid:focus:ring-red-2',
        className
      )}
      {...props}
    />
  );
}

export { Input };
