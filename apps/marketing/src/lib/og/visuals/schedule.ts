import { COLORS, column, type Node, px, row } from '../primitives';
import { badge, card, cardHeader, cell, label, livePing, tableRow } from './elements';

function state(value: string): Node {
  if (value === 'Sent') return badge(['Sent'], 'green');
  if (value === 'Next') return row([livePing(), label('Releasing at 09:00', 12, COLORS.fg3)], { gap: px(6) });
  return badge(['Scheduled']);
}

export function schedule(): Node {
  const zones = [
    { zone: 'Tokyo', offset: 'UTC+9', state: 'Sent' },
    { zone: 'Berlin', offset: 'UTC+2', state: 'Sent' },
    { zone: 'New York', offset: 'UTC−4', state: 'Next' },
    { zone: 'Los Angeles', offset: 'UTC−7', state: 'Scheduled' },
  ];
  return card(
    [
      cardHeader([
        label('Weekly recap', 14, COLORS.fg4, 500),
        badge(['Scheduled'], 'sky'),
        row([label('09:00, subscriber time', 12, COLORS.fg2)], { marginLeft: 'auto' }),
      ]),
      column(
        zones.map((entry, index) =>
          tableRow(
            [
              cell([label(entry.zone, 14, COLORS.fg4, 500)], { width: px(88) }),
              cell([label(entry.offset, 14, COLORS.fg2)], { width: px(56) }),
              cell([state(entry.state)]),
            ],
            index === zones.length - 1
          )
        )
      ),
    ],
    px(340)
  );
}
