import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function Flag({
  code,
  className,
  ...props
}: Omit<React.ComponentProps<'img'>, 'src' | 'alt'> & { code: string }) {
  return (
    <img
      data-slot='flag'
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=''
      className={cn('-mt-px size-4 shrink-0 select-none', className)}
      {...props}
    />
  );
}

export { Flag };
