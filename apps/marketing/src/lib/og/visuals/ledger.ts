import { COLORS, column, type Node, px, row } from '../primitives';
import { badge, card, cardHeader, cell, label, tableHead, tableRow } from './elements';

export function ledger(): Node {
  const attempts = [
    { attempt: '1', outcome: 'Retrying', tone: 'amber' as const, code: 'rate_limited', latency: '412 ms' },
    { attempt: '2', outcome: 'Retrying', tone: 'amber' as const, code: 'timeout', latency: '5,000 ms' },
    { attempt: '3', outcome: 'Sent', tone: 'green' as const, code: '200 from APNs', latency: '142 ms' },
  ];
  return card(
    [
      cardHeader([
        label('Delivery to user_42', 14, COLORS.fg4, 500),
        badge(['iOS'], 'blue'),
        row([badge(['Delivered'], 'green')], { marginLeft: 'auto' }),
      ]),
      tableHead(['Attempt', 'Outcome', 'Provider', 'Latency'], [52, 76, 104, 60]),
      column(
        attempts.map((entry, index) =>
          tableRow(
            [
              cell([label(entry.attempt, 14, COLORS.fg4, 500)], { width: px(52) }),
              cell([badge([entry.outcome], entry.tone)], { width: px(76) }),
              cell([label(entry.code, 14, COLORS.fg2)], { width: px(104) }),
              cell([label(entry.latency, 14, COLORS.fg3)], { width: px(60) }),
            ],
            index === attempts.length - 1
          )
        )
      ),
      row(
        [
          label('2,418 total', 12, COLORS.fg2),
          label('2,412 sent', 12, COLORS.green4),
          label('2,380 delivered', 12, COLORS.green4),
          label('3 failed', 12, COLORS.red4),
          label('3 invalid', 12, COLORS.fg1),
        ],
        { gap: px(12), padding: `${px(10)}px ${px(16)}px`, borderTop: `1px solid ${COLORS.bg3}` }
      ),
    ],
    px(404)
  );
}
