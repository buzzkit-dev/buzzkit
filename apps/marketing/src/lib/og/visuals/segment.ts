import type { IconName } from '@buzzkit/ui/components/icon/paths';
import { COLORS, column, type Node, pastelAvatar, px, row } from '../primitives';
import { badge, card, cell, label, livePing, tableRow } from './elements';

function conditionChip(kind: IconName, subject: string, operator: string, value: string): Node {
  return badge(
    [label(subject, 12, COLORS.fg4, 500), label(operator, 12, COLORS.fg2), label(value, 12, COLORS.fg4, 500)],
    'default',
    kind
  );
}

export function segment(): Node {
  const conditions = [
    conditionChip('IconUserFilled', 'plan', 'is', 'pro'),
    conditionChip('IconZapFilled', 'workout.completed', 'at least', '3× in 7 days'),
    conditionChip('IconClock', 'active', 'in the last', '30 days'),
  ];
  const members = [
    { id: 'user_42', platform: 'iOS', seen: '2m ago' },
    { id: 'user_311', platform: 'iOS', seen: '26m ago' },
    { id: 'user_178', platform: 'Android', seen: '1h ago' },
  ];
  return card(
    [
      column(
        [
          ...conditions.map((chip, index) =>
            row(
              [
                row([label(index === 0 ? 'Where' : 'and', 12, COLORS.fg1)], { width: px(40), flexShrink: 0 }),
                chip,
              ],
              { gap: px(8) }
            )
          ),
          row([livePing(), label('1,284 subscribers match right now', 14, COLORS.fg4, 500)], {
            gap: px(8),
            marginTop: px(4),
          }),
        ],
        { gap: px(8), padding: `${px(14)}px ${px(16)}px` }
      ),
      column(
        members.map((member, index) =>
          tableRow(
            [
              cell([pastelAvatar(member.id, px(20), 0, 'orb'), label(member.id, 14, COLORS.fg4, 500)], {
                flex: 1,
              }),
              cell([badge([member.platform], member.platform === 'iOS' ? 'blue' : 'purple')]),
              cell([label(member.seen, 14, COLORS.fg2)]),
            ],
            index === members.length - 1
          )
        ),
        { borderTop: `1px solid ${COLORS.bg3}` }
      ),
    ],
    px(332)
  );
}
