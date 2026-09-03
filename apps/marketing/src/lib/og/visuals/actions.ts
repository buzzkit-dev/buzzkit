import { COLORS, column, logo, type Node, px, row, SHADOWS } from '../primitives';
import { CARD_WIDTH, label } from './elements';

function actionsCard(title: string, body: string, buttons: [string, string]): Node {
  return column(
    [
      row(
        [
          logo(px(38), px(11)),
          column([label(title, 14, COLORS.fg4, 500), label(body, 14, COLORS.fg2)], {
            flex: 1,
            minWidth: 0,
            gap: 1,
          }),
        ],
        { gap: px(12) }
      ),
      row(
        buttons.map((action) =>
          row([label(action, 12, COLORS.fg3, 500)], {
            flex: 1,
            height: px(28),
            justifyContent: 'center',
            borderRadius: px(10),
            backgroundColor: COLORS.bg2,
          })
        ),
        { gap: px(8) }
      ),
    ],
    {
      width: CARD_WIDTH,
      padding: px(12),
      gap: px(10),
      borderRadius: px(22),
      backgroundColor: COLORS.bg1,
      boxShadow: SHADOWS.raised,
    }
  );
}

export function actions(): Node {
  return actionsCard('Rest day is over', 'Your next workout is ready.', ['Snooze', 'Start workout']);
}
