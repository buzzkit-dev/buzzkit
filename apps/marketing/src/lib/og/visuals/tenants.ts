import { COLORS, column, type Node, pastelAvatar, px, row } from '../primitives';
import { badge, card, cardHeader, cell, label, tableHead, tableRow } from './elements';

export function tenants(): Node {
  const entries = [
    { slug: 'gymly', name: 'Gymly', subscribers: '13,460', platforms: ['iOS', 'Android'] },
    { slug: 'nook', name: 'Nook', subscribers: '8,212', platforms: ['iOS'] },
    { slug: 'harbor', name: 'Harbor', subscribers: '2,904', platforms: ['iOS', 'Android'] },
  ];
  return card(
    [
      cardHeader([
        pastelAvatar('orbit', px(22), px(6)),
        label('Orbit', 14, COLORS.fg4, 500),
        label('1 workspace key', 12, COLORS.fg2),
        row([badge(['4 tenants'])], { marginLeft: 'auto' }),
      ]),
      tableHead(['Tenant', 'Subscribers', 'Channels'], [118, 76, 90]),
      column(
        entries.map((entry, index) =>
          tableRow(
            [
              cell(
                [
                  column([
                    label(entry.name, 14, COLORS.fg4, 500),
                    label(`buzzkit-tenant: ${entry.slug}`, 12, COLORS.fg2),
                  ]),
                ],
                { width: px(118) }
              ),
              cell([label(entry.subscribers, 14, COLORS.fg3)], { width: px(76) }),
              cell(
                entry.platforms.map((platform) => badge([platform], platform === 'iOS' ? 'blue' : 'purple')),
                { width: px(90), gap: px(4) }
              ),
            ],
            index === entries.length - 1
          )
        )
      ),
    ],
    px(380)
  );
}
