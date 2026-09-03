import { COLORS, column, type Node, px, row } from '../primitives';
import { badge, card, cardHeader, label } from './elements';

export function apiKey(): Node {
  return card([
    cardHeader([
      label('Workspace key', 14, COLORS.fg4, 500),
      row([badge(['Active'], 'green')], { marginLeft: 'auto' }),
    ]),
    column(
      [
        label('bk_ws_9f3k • • • • • • • • 2mq', 14, COLORS.fg4, 500),
        row([badge(['messages:send']), badge(['subscribers:write']), badge(['events:write'])], {
          gap: px(4),
          flexWrap: 'wrap',
        }),
      ],
      { gap: px(8), padding: `${px(12)}px ${px(16)}px` }
    ),
  ]);
}
