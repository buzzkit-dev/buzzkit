import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const iconTileVariants = cva(
  'corner-superellipse/1.125 flex shrink-0 items-center justify-center bg-bg-2 text-fg-3 ring-1 ring-transparent transition-[box-shadow,background-color] duration-150 ease-out',
  {
    variants: {
      size: {
        sm: 'size-8 rounded-xl [&>svg]:size-4.5',
        default: 'size-8.5 rounded-xl [&>svg]:size-5',
        lg: 'size-12 rounded-2xl [&>svg]:size-7',
      },
    },
    defaultVariants: { size: 'default' },
  }
);

function IconTile({
  icon,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> &
  VariantProps<typeof iconTileVariants> & { icon: IconName }) {
  return (
    <span data-slot='icon-tile' className={cn(iconTileVariants({ size }), className)} {...props}>
      <Icon name={icon} />
    </span>
  );
}

export { IconTile, iconTileVariants };
