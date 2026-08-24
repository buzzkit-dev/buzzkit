import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  [
    'group/button relative isolate flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-medium',
    'corner-superellipse/1.125 transition-[color,opacity,scale] duration-150 ease-out',
    // Fill + shadow live on ::before so pressing deflates only the background —
    // the label, icons and layout stay fixed. The press is a fixed inset
    // (tokens in globals.css), so a full-width button presses exactly like a
    // short one.
    "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
    'before:transition-[background-color,box-shadow,inset] before:duration-150 before:ease-out',
    'not-disabled:active:before:inset-x-(--press-inset-x) not-disabled:active:before:inset-y-(--press-inset-y)',
    'not-disabled:data-[pressed]:before:inset-x-(--press-inset-x) not-disabled:data-[pressed]:before:inset-y-(--press-inset-y)',
    'outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
    'aria-invalid:focus-visible:ring-0',
    '[&:disabled]:cursor-not-allowed [&:disabled_svg]:opacity-30',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'text-primary-foreground before:bg-primary',
          'before:shadow-control',
          'not-disabled:hover:before:bg-primary/80',
          'disabled:text-fg-1 disabled:before:bg-bg-4 disabled:before:shadow-none',
        ].join(' '),
        elevated: [
          'text-fg-4 before:bg-background dark:before:bg-bg-3',
          'before:shadow-control-elevated not-disabled:hover:before:shadow-control-elevated-hover',
          'not-disabled:active:before:bg-bg-1 not-disabled:data-[pressed]:before:bg-bg-1 dark:not-disabled:active:before:bg-bg-4 dark:not-disabled:data-[pressed]:before:bg-bg-4',
          'disabled:text-fg-1',
        ].join(' '),
        soft: 'text-fg-3 before:bg-bg-a1 not-disabled:hover:text-fg-3 not-disabled:hover:before:bg-bg-a2 not-disabled:active:before:bg-bg-a2 dark:before:bg-bg-a3 dark:not-disabled:hover:before:bg-bg-a4 dark:not-disabled:active:before:bg-bg-a4 disabled:text-fg-a1/50 disabled:before:bg-bg-2',
        ghost:
          'text-fg-2 not-disabled:hover:text-fg-4 not-disabled:active:text-fg-4 not-disabled:hover:before:bg-bg-a2/70 not-disabled:active:before:bg-bg-a2/70 disabled:opacity-50',
        destructive: [
          'text-white before:bg-red-4',
          'before:shadow-control-destructive',
          'not-disabled:hover:before:bg-red-4/90',
          'disabled:opacity-50',
        ].join(' '),
        // No background to scale, so the content itself takes the press.
        link: [
          'text-primary-4 before:hidden not-disabled:hover:opacity-80 not-disabled:active:opacity-80 disabled:opacity-50',
          'px-0! not-disabled:active:scale-[0.975] not-disabled:data-[pressed]:scale-[0.975]',
        ].join(' '),
      },
      // An icon on either side trims that side's padding by 2px so the glyph
      // sits optically level with the text edge.
      size: {
        xs: 'h-[26px] gap-1.5 rounded-[10px] px-2.5 text-xs data-[icon=inline-end]:pr-2 data-[icon=inline-start]:pl-2',
        sm: 'h-7.5 gap-1.5 rounded-[10px] px-2.5 text-xs data-[icon=inline-end]:pr-2 data-[icon=inline-start]:pl-2',
        default:
          'h-8 gap-2 rounded-xl px-2.5 text-sm data-[icon=inline-end]:pr-2 data-[icon=inline-start]:pl-2',
        lg: 'h-9 gap-2 rounded-xl px-3 text-sm data-[icon=inline-end]:pr-2.5 data-[icon=inline-start]:pl-2.5',
        'icon-xs': 'size-[26px] rounded-[10px] px-0',
        'icon-sm': 'size-7.5 rounded-[10px] px-0',
        icon: 'size-8 rounded-xl px-0',
        'icon-lg': 'size-9 rounded-xl px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  icon,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** `icon='IconBell'`, or `{ name, position: 'inline-end' }` to trail. */
    icon?: MenuItemIcon;
  }) {
  const position = menuIconPosition(icon);
  return (
    <ButtonPrimitive
      data-slot='button'
      data-icon={position}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {renderMenuIcon(icon, 'inline-start')}
      {children}
      {renderMenuIcon(icon, 'inline-end')}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
