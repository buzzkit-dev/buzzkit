import { COLORS, column, element, logo, type Node, px, row, SHADOWS } from '../primitives';
import { CARD_WIDTH, label } from './elements';

export function liveActivity(): Node {
  const muted = 'rgba(255, 255, 255, 0.6)';
  return column(
    [
      row(
        [
          logo(px(36), px(10)),
          column([label('Leg day with Maya', 14, COLORS.bg1, 500), label('Gymly · Warm-up', 12, muted)], {
            flex: 1,
            minWidth: 0,
          }),
          label('Live', 12, muted),
        ],
        { gap: px(12) }
      ),
      element(
        'div',
        {
          display: 'flex',
          height: px(6),
          borderRadius: 999,
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
        },
        [
          element('div', {
            width: '62%',
            height: px(6),
            borderRadius: 999,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
          }),
        ]
      ),
      row([label('Set 3 of 5', 12, muted), label('12 min left', 12, muted)], {
        justifyContent: 'space-between',
      }),
    ],
    {
      width: CARD_WIDTH,
      padding: px(14),
      gap: px(12),
      borderRadius: px(22),
      backgroundColor: COLORS.fg4,
      boxShadow: SHADOWS.raised,
    }
  );
}
