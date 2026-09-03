import { COLORS, column, icon, type Node, px, row } from '../primitives';
import { badge, card, cardHeader, cell, label, livePing, tableRow } from './elements';

function providerMark(): Node {
  return row([icon('IconMailboxFilled', px(10), COLORS.fg2)], {
    width: px(18),
    height: px(18),
    justifyContent: 'center',
    borderRadius: px(5),
    backgroundColor: COLORS.bgA1,
    flexShrink: 0,
  });
}

export function sources(): Node {
  const inbound = [
    { event: 'INITIAL_PURCHASE', becomes: 'subscription.started' },
    { event: 'cancellation', becomes: 'subscription.canceled' },
    { event: 'order.shipped', becomes: 'order.shipped' },
  ];
  return card(
    [
      cardHeader([
        label('Sources', 14, COLORS.fg4, 500),
        row([livePing(), label('Receiving', 12, COLORS.fg2)], { gap: px(6), marginLeft: 'auto' }),
      ]),
      column(
        inbound.map((entry, index) =>
          tableRow(
            [
              cell([providerMark(), badge([entry.event])]),
              cell([icon('IconArrowRight', px(14), COLORS.fg1)]),
              cell([badge([entry.becomes], 'green')]),
            ],
            index === inbound.length - 1
          )
        )
      ),
    ],
    px(420)
  );
}
