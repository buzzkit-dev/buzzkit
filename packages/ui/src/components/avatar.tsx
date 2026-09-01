import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { BlurImage } from '@buzzkit/ui/components/blur-image';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { cn } from '@buzzkit/ui/lib/utils';
import type * as React from 'react';

function generatedAvatarUrl(name: string): string {
  const key = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'anonymous';
  return `https://api.kodama.sh/${key}?size=128&shape=circle&depth=subtle&mood=happy,surprised,cool&animations=blink,eyebrowBounce`;
}

const FALLBACK_CLASS =
  'flex size-full items-center justify-center rounded-full bg-bg-4 font-medium text-fg-2 text-sm uppercase group-data-[size=lg]/avatar:text-base group-data-[size=sm]/avatar:text-xs group-data-[size=xl]/avatar:text-3xl';

function Avatar({
  className,
  size = 'default',
  name,
  label,
  picture = 'face',
  children,
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: 'default' | 'sm' | 'lg' | 'xl';
  name?: string;
  label?: string;
  picture?: 'face' | 'orb';
}) {
  return (
    <AvatarPrimitive.Root
      data-slot='avatar'
      data-size={size}
      className={cn(
        'group/avatar relative flex size-[30px] shrink-0 select-none rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xl]:size-16',
        className
      )}
      {...props}
    >
      {name === undefined ? (
        children
      ) : picture === 'orb' ? (
        <PastelAvatar
          seed={name}
          variant='orb'
          className='size-full'
          style={{ width: undefined, height: undefined }}
          aria-label={label}
        />
      ) : (
        <BlurImage
          src={generatedAvatarUrl(name)}
          alt=''
          className='size-full rounded-full'
          placeholder={<span className={FALLBACK_CLASS}>{(label ?? name).trim().charAt(0)}</span>}
        />
      )}
    </AvatarPrimitive.Root>
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot='avatar-image'
      className={cn('aspect-square size-full rounded-full object-cover', className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot='avatar-fallback'
      className={cn(FALLBACK_CLASS, className)}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot='avatar-badge'
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        'group-data-[size=xl]/avatar:size-4 group-data-[size=xl]/avatar:[&>svg]:size-3',
        className
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='avatar-group'
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='avatar-group-count'
      className={cn(
        'relative flex size-[30px] shrink-0 items-center justify-center rounded-full bg-bg-4 font-medium text-fg-2 text-sm ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 group-has-data-[size=xl]/avatar-group:size-16 group-has-data-[size=xl]/avatar-group:text-lg [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3 group-has-data-[size=xl]/avatar-group:[&>svg]:size-7',
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
