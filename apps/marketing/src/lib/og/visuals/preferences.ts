import { COLORS, column, element, type Node, px, row, SHADOWS } from '../primitives';
import { CARD_WIDTH, label, switchControl } from './elements';

export function preferences(): Node {
  const topics = [
    { label: 'Workout reminders', description: 'Your booked classes and sessions', on: true },
    { label: 'Progress updates', description: 'Weekly recaps and streaks', on: true },
    { label: 'Tips and offers', description: 'New classes and member deals', on: false },
  ];
  return column(
    [
      element('div', {
        width: px(56),
        height: px(6),
        marginTop: px(4),
        marginBottom: px(12),
        borderRadius: 999,
        backgroundColor: COLORS.bg4,
        alignSelf: 'center',
      }),
      row([label('Notifications', 16, COLORS.fg4, 500)], { padding: `0 ${px(12)}px ${px(8)}px` }),
      column(
        topics.map((topic, index) =>
          row(
            [
              column([label(topic.label, 14, COLORS.fg4, 500), label(topic.description, 12, COLORS.fg2)], {
                flex: 1,
                minWidth: 0,
              }),
              switchControl(topic.on),
            ],
            {
              gap: px(12),
              padding: `${px(12)}px 0`,
              borderBottom: `1px solid ${index === topics.length - 1 ? 'transparent' : COLORS.bg3}`,
            }
          )
        ),
        { padding: `0 ${px(12)}px`, borderRadius: px(16), backgroundColor: COLORS.bg2 }
      ),
    ],
    {
      width: CARD_WIDTH,
      padding: px(8),
      borderRadius: px(24),
      backgroundColor: COLORS.bg1,
      boxShadow: `${SHADOWS.card}, 0 0 0 1px ${COLORS.bg3}`,
    }
  );
}
