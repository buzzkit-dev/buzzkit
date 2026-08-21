import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'corner-superellipse/1.125 field-sizing-content min-h-20 w-full rounded-xl bg-bg-2 px-3.5 py-2 text-fg-4 text-sm backdrop-blur-md transition-[color,background-color,outline-color,box-shadow] duration-150',
        'outline-[1.5px] outline-transparent placeholder:text-fg-2 focus:outline-primary-4/40 focus:ring-[1.5px] focus:ring-primary-2/60',
        'disabled:cursor-not-allowed disabled:text-fg-1 disabled:opacity-50',
        'aria-invalid:focus:outline-red-4 aria-invalid:focus:ring-red-2',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
