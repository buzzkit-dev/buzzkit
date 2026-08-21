import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { type MenuItemIcon, menuIconPosition, renderMenuIcon } from '@buzzkit/ui/components/menu-icon';
import { cn } from '@buzzkit/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  [
    'group/badge inline-flex w-fit shrink-0 select-none items-center justify-center gap-1 overflow-hidden whitespace-nowrap font-medium transition-[color,background-color,box-shadow]',
    'outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
    '[&>svg]:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-bg-a1 text-fg-2',
        purple: 'selection-purple bg-purple-1 text-purple-text',
        blue: 'selection-blue bg-blue-1 text-blue-text',
        sky: 'selection-sky bg-sky-1 text-sky-text',
        green: 'selection-green bg-green-1 text-green-text',
        amber: 'selection-amber bg-amber-1 text-amber-text',
        orange: 'selection-orange bg-orange-1 text-orange-text',
        red: 'selection-red bg-red-1 text-red-text',
        pink: 'selection-pink bg-pink-1 text-pink-text',
        solid: 'selection-inverse bg-fg-4 text-background',
      },
      size: {
        sm: 'h-5 rounded-full px-2 text-xs [&>svg]:size-3!',
        default: 'h-6 rounded-full px-2.5 text-sm [&>svg]:size-3.5!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// Like buttons, an icon trims 2px off its own side so the glyph sits optically
// level with the text edge.
const ICON_PADDING = {
  sm: { 'inline-start': 'pl-1.5', 'inline-end': 'pr-1.5' },
  default: { 'inline-start': 'pl-2', 'inline-end': 'pr-2' },
} as const;

function Badge({
  className,
  variant = 'default',
  size = 'default',
  icon,
  render,
  children,
  ...props
}: useRender.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** `icon='IconBell'`, or `{ name, position: 'inline-end' }` to trail. */
    icon?: MenuItemIcon;
  }) {
  const position = menuIconPosition(icon);
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(
          badgeVariants({ variant, size }),
          position && ICON_PADDING[size ?? 'default'][position],
          className
        ),
        children: (
          <>
            {renderMenuIcon(icon, 'inline-start')}
            {children}
            {renderMenuIcon(icon, 'inline-end')}
          </>
        ),
      },
      props
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
