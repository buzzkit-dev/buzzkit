import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const iconTileVariants = cva(
  'corner-superellipse/1.125 flex shrink-0 items-center justify-center ring-1 transition-[box-shadow,background-color,color] duration-150 ease-out',
  {
    variants: {
      size: {
        sm: 'size-8 rounded-xl [&>svg]:size-4.5',
        default: 'size-8.5 rounded-xl [&>svg]:size-5',
        lg: 'size-12 rounded-2xl [&>svg]:size-7',
      },
      tone: {
        default: 'bg-bg-2 text-fg-3 ring-bg-4/70',
        purple: 'bg-purple-4/15 text-purple-4 ring-purple-4/25 [&>svg]:opacity-85',
        sky: 'bg-sky-4/15 text-sky-4 ring-sky-4/25 [&>svg]:opacity-85',
        blue: 'bg-blue-4/15 text-blue-4 ring-blue-4/25 [&>svg]:opacity-85',
        green: 'bg-green-4/15 text-green-4 ring-green-4/25 [&>svg]:opacity-85',
        amber: 'bg-amber-4/15 text-amber-4 ring-amber-4/25 [&>svg]:opacity-85',
        orange: 'bg-orange-4/15 text-orange-4 ring-orange-4/25 [&>svg]:opacity-85',
        red: 'bg-red-4/15 text-red-4 ring-red-4/25 [&>svg]:opacity-70',
        pink: 'bg-pink-4/15 text-pink-4 ring-pink-4/25 [&>svg]:opacity-85',
        yellow: 'bg-yellow-4/15 text-yellow-4 ring-yellow-4/25 [&>svg]:opacity-85',
      },
    },
    defaultVariants: { size: 'default', tone: 'default' },
  }
);

function IconTile({
  icon,
  size,
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> &
  VariantProps<typeof iconTileVariants> & { icon: IconName }) {
  return (
    <span data-slot='icon-tile' className={cn(iconTileVariants({ size, tone }), className)} {...props}>
      <Icon name={icon} />
    </span>
  );
}

export { IconTile, iconTileVariants };
