import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor/children arrive via props at the call site
    <label
      data-slot='label'
      className={cn(
        'flex cursor-pointer items-center gap-2 text-sm leading-tighter font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Label };
