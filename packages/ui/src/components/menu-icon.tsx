import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import type { ComponentProps } from 'react';

type IconPosition = 'inline-start' | 'inline-end';
type IconProps = ComponentProps<typeof Icon>;

/** Menu items accept either a bare icon name or full Icon props + a position. */
export type MenuItemIcon = IconName | (IconProps & { position?: IconPosition });

export function renderMenuIcon(icon: MenuItemIcon | undefined, wantedPosition: IconPosition) {
  if (!icon) return null;
  const props = typeof icon === 'string' ? { name: icon } : icon;
  const position = (typeof icon === 'string' ? 'inline-start' : icon.position) ?? 'inline-start';
  if (position !== wantedPosition) return null;
  const { position: _discard, ...rest } = props as typeof props & { position?: IconPosition };
  return <Icon {...rest} />;
}

export function menuIconPosition(icon: MenuItemIcon | undefined): IconPosition | undefined {
  if (!icon) return undefined;
  if (typeof icon === 'string') return 'inline-start';
  return icon.position ?? 'inline-start';
}
