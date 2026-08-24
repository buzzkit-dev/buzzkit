'use client';

import { cn } from '@buzzkit/ui/lib/utils';
import * as React from 'react';

function BlurImage({
  className,
  imageClassName,
  placeholder,
  src,
  alt,
  onLoad,
  ...props
}: React.ComponentProps<'img'> & { imageClassName?: string; placeholder?: React.ReactNode }) {
  const ref = React.useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(false);
    const image = ref.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <span data-slot='blur-image' className={cn('relative block overflow-hidden bg-bg-3', className)}>
      {placeholder && (
        <span aria-hidden className='absolute inset-0 flex items-center justify-center'>
          {placeholder}
        </span>
      )}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        className={cn(
          'relative size-full object-cover transition-[filter,opacity] duration-300 ease-out',
          loaded ? 'opacity-100 blur-0' : 'opacity-0 blur-[4px]',
          imageClassName
        )}
        {...props}
      />
    </span>
  );
}

export { BlurImage };
