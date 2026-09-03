import type { IconName } from '@buzzkit/ui/components/icon/paths';
import { COLORS, column, element, icon, type Node, px, row, SHADOWS, type Style, text } from '../primitives';

type BadgeVariant = 'default' | 'green' | 'blue' | 'sky' | 'amber' | 'purple';

const BADGE_COLORS: Record<BadgeVariant, { background: string; color: string }> = {
  default: { background: COLORS.bgA1, color: COLORS.fg2 },
  green: { background: COLORS.green1, color: COLORS.greenText },
  blue: { background: COLORS.blue1, color: COLORS.blueText },
  sky: { background: COLORS.sky1, color: COLORS.skyText },
  amber: { background: COLORS.amber1, color: COLORS.amberText },
  purple: { background: COLORS.purple1, color: COLORS.purpleText },
};

export const CARD_WIDTH = px(292);

export function label(content: string, size: number, color: string, weight = 400): Node {
  return text(content, { fontSize: px(size), color, fontWeight: weight });
}

export function badge(
  children: (Node | string)[],
  variant: BadgeVariant = 'default',
  leading?: IconName
): Node {
  const colors = BADGE_COLORS[variant];
  return row(
    [
      ...(leading ? [icon(leading, px(12), colors.color)] : []),
      ...children.map((child) => (typeof child === 'string' ? label(child, 12, colors.color, 500) : child)),
    ],
    {
      height: px(20),
      padding: `0 ${px(8)}px 0 ${leading ? px(6) : px(8)}px`,
      gap: px(4),
      borderRadius: 999,
      backgroundColor: colors.background,
      flexShrink: 0,
    }
  );
}

export function card(children: Node[], width = CARD_WIDTH): Node {
  return column(children, {
    width,
    borderRadius: px(16),
    backgroundColor: COLORS.bg1,
    boxShadow: SHADOWS.card,
    overflow: 'hidden',
  });
}

export function cardHeader(children: Node[]): Node {
  return row(children, {
    gap: px(8),
    padding: `${px(12)}px ${px(16)}px`,
    borderBottom: `1px solid ${COLORS.bg3}`,
  });
}

export function livePing(): Node {
  return element(
    'div',
    {
      display: 'flex',
      position: 'relative',
      width: px(8),
      height: px(8),
      alignItems: 'center',
      justifyContent: 'center',
    },
    [
      element('div', {
        position: 'absolute',
        width: px(14),
        height: px(14),
        borderRadius: 999,
        backgroundColor: COLORS.green4,
        opacity: 0.25,
      }),
      element('div', { width: px(8), height: px(8), borderRadius: 999, backgroundColor: COLORS.green4 }),
    ]
  );
}

export function tableRow(cells: Node[], last: boolean, header = false): Node {
  const style: Style = { gap: px(16) };
  if (header) {
    style.padding = `0 ${px(16)}px`;
    style.height = px(36);
  } else {
    style.padding = `${px(10)}px ${px(16)}px`;
  }
  if (!last) style.borderBottom = `1px solid ${COLORS.bg3}`;
  return row(cells, style);
}

export function cell(children: (Node | string)[], style: Style = {}): Node {
  return row(
    children.map((child) => (typeof child === 'string' ? label(child, 14, COLORS.fg3) : child)),
    { gap: px(8), ...style }
  );
}

export function tableHead(titles: string[], widths: number[]): Node {
  return tableRow(
    titles.map((title, index) =>
      cell([label(title, 12, COLORS.fg2, 500)], { width: px(widths[index] ?? 80) })
    ),
    false,
    true
  );
}

export function switchControl(on: boolean): Node {
  return element(
    'div',
    {
      display: 'flex',
      width: px(32),
      height: px(20),
      padding: px(1),
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: on ? 'flex-end' : 'flex-start',
      backgroundColor: on ? COLORS.fg4 : COLORS.bg3,
      flexShrink: 0,
    },
    [
      element('div', {
        width: px(16),
        height: px(16),
        borderRadius: 999,
        backgroundColor: COLORS.bg1,
        boxShadow: SHADOWS.knob,
      }),
    ]
  );
}
