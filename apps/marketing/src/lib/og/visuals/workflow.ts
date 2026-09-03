import type { IconName } from '@buzzkit/ui/components/icon/paths';
import { COLORS, column, element, icon, type Node, px, row, SHADOWS, type Style } from '../primitives';
import { label } from './elements';

function workflowNode(head: IconName, kind: string, name: string, detail: string, status: string): Node {
  return column(
    [
      row(
        [
          row([icon(head, px(14), COLORS.fg2), label(kind, 12, COLORS.fg2)], { gap: px(6) }),
          label(status, 12, COLORS.fg3, 500),
        ],
        {
          justifyContent: 'space-between',
          padding: `${px(4)}px ${px(10)}px`,
          backgroundColor: COLORS.bg2,
          borderBottom: `1px solid ${COLORS.bg3}`,
        }
      ),
      column([label(name, 14, COLORS.fg4, 500), label(detail, 12, COLORS.fg2)], {
        gap: px(4),
        padding: `${px(8)}px ${px(10)}px`,
      }),
    ],
    {
      width: px(220),
      borderRadius: px(12),
      backgroundColor: COLORS.bg1,
      boxShadow: SHADOWS.card,
      overflow: 'hidden',
    }
  );
}

function port(style: Style = {}): Node {
  return element('div', {
    width: px(8),
    height: px(8),
    borderRadius: px(3),
    backgroundColor: COLORS.bg1,
    boxShadow: `0 0 0 1px ${COLORS.bg4}`,
    ...style,
  });
}

function withPorts(node: Node, incoming: boolean): Node {
  const centered = { position: 'absolute', left: '50%', marginLeft: -px(4) };
  const ports = [port({ ...centered, top: '100%', marginTop: -px(4) })];
  if (incoming) ports.push(port({ ...centered, top: -px(4) }));
  return element('div', { display: 'flex', position: 'relative' }, [node, ...ports]);
}

export function workflow(): Node {
  const nodes = [
    workflowNode('IconZapFilled', 'Event', '$app.opened', 'plan is trial', 'Completed'),
    workflowNode('IconHourglassFilled', 'Wait', 'settle', '2 days, reset on $app.opened', '12 here now'),
    workflowNode('IconPaperPlaneTopRightFilled', 'Send', 'nudge', 'push · Leg day', '3 here now'),
  ];
  const rail = element('div', {
    position: 'absolute',
    top: px(20),
    bottom: px(5),
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: COLORS.bg4,
  });
  const end = element('div', {
    width: px(10),
    height: px(10),
    borderRadius: px(3),
    backgroundColor: COLORS.fg1,
  });
  return column([rail, ...nodes.map((node, index) => withPorts(node, index > 0)), end], {
    position: 'relative',
    alignItems: 'center',
    gap: px(20),
  });
}
