import { COLORS, column, logo, type Node, px, row, SHADOWS } from '../primitives';
import { CARD_WIDTH, label } from './elements';

function banner(title: string, body: string, when: string): Node {
  return row(
    [
      logo(px(38), px(11)),
      column(
        [
          row([label(title, 14, COLORS.fg4, 500), label(when, 12, COLORS.fg1)], {
            justifyContent: 'space-between',
            gap: px(8),
          }),
          label(body, 14, COLORS.fg2),
        ],
        { flex: 1, minWidth: 0, gap: 1 }
      ),
    ],
    {
      width: CARD_WIDTH,
      padding: px(12),
      gap: px(12),
      borderRadius: px(22),
      backgroundColor: COLORS.bg1,
      boxShadow: SHADOWS.raised,
    }
  );
}

export function notifications(): Node {
  return column(
    [
      banner('Leg day', 'Let’s go. 6:00 with Maya.', 'now'),
      banner('Your order shipped', 'Arriving Thursday.', '2m'),
    ],
    { gap: px(12) }
  );
}
