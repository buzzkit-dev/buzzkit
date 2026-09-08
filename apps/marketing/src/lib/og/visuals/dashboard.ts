import type { IconName } from '@buzzkit/ui/components/icon/paths';
import {
  areaChart,
  COLORS,
  column,
  element,
  icon,
  type Node,
  pastelAvatar,
  row,
  SHADOWS,
  text,
} from '../primitives';

const WIDTH = 1024;
const HEIGHT = 420;
const SIDEBAR_WIDTH = 224;
const PANEL_WIDTH = WIDTH - SIDEBAR_WIDTH;
const CONTENT_WIDTH = PANEL_WIDTH - 64;
const TILE_WIDTH = (CONTENT_WIDTH - 40) / 3;

const NAVIGATION: { label?: string; pages: { label: string; icon: IconName }[] }[] = [
  { pages: [{ label: 'Overview', icon: 'IconHomeRoundDoorFilled' }] },
  {
    label: 'Messaging',
    pages: [
      { label: 'Messages', icon: 'IconPaperPlaneTopRightFilled' },
      { label: 'Workflows', icon: 'IconAgentsFilled' },
      { label: 'Events', icon: 'IconZapFilled' },
    ],
  },
  {
    label: 'Audience',
    pages: [
      { label: 'Subscribers', icon: 'IconTeamFilled' },
      { label: 'Segments', icon: 'IconTargetFilled' },
      { label: 'Topics', icon: 'IconTagFilled' },
    ],
  },
];

const SUBSCRIBERS = [
  12_140, 12_230, 12_318, 12_402, 12_540, 12_611, 12_704, 12_838, 12_902, 13_017, 13_141, 13_226, 13_318,
  13_460,
];
const DELIVERED = [1702, 1768, 2041, 1889, 2203, 2310, 2144, 2412, 2545, 2490, 2694, 2796, 2741, 2958];
const EVENTS = [
  8420, 8790, 9130, 8880, 9640, 10_120, 9860, 10_480, 10_910, 10_730, 11_260, 11_690, 11_420, 12_050,
];
const SENT = [1840, 1912, 2210, 2044, 2380, 2492, 2318, 2601, 2744, 2688, 2903, 3012, 2957, 3184];
const FAILED = [22, 18, 31, 24, 19, 27, 21, 30, 26, 22, 28, 24, 19, 23];

function navigationItem(page: { label: string; icon: IconName }, active: boolean): Node {
  return row([icon(page.icon, 18, active ? COLORS.fg4 : COLORS.fg2), text(page.label)], {
    height: 32,
    gap: 8,
    padding: '0 10px 0 8px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    color: active ? COLORS.fg4 : COLORS.fg2,
    backgroundColor: active ? COLORS.bgA2 : 'transparent',
  });
}

function sidebar(): Node {
  return column(
    [
      row([pastelAvatar('gymly', 24, 8), text('Gymly'), icon('IconChevronGrabberVertical', 16, COLORS.fg2)], {
        height: 32,
        gap: 8,
        padding: '0 10px 0 5px',
        fontSize: 14,
        fontWeight: 500,
        color: COLORS.fg4,
      }),
      column(
        NAVIGATION.map((section) =>
          column(
            [
              ...(section.label
                ? [
                    text(section.label, {
                      padding: '0 10px 4px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: COLORS.fg2,
                    }),
                  ]
                : []),
              ...section.pages.map((page) => navigationItem(page, page.label === 'Overview')),
            ],
            { gap: 2 }
          )
        ),
        { gap: 20 }
      ),
    ],
    { width: SIDEBAR_WIDTH, flexShrink: 0, gap: 12, padding: '12px 12px 8px' }
  );
}

function tile(name: string, value: string, delta: string, values: number[], color: string): Node {
  return column(
    [
      column(
        [
          text(name, { fontSize: 14, color: COLORS.fg2 }),
          row(
            [
              text(value, { fontSize: 24, fontWeight: 500, color: COLORS.fg4, letterSpacing: -0.5 }),
              row([icon('IconArrowUpRight', 14, COLORS.green4), text(delta)], {
                gap: 2,
                fontSize: 14,
                fontWeight: 500,
                color: COLORS.green4,
              }),
            ],
            { gap: 8 }
          ),
        ],
        { padding: '14px 16px 0', gap: 2 }
      ),
      areaChart([{ values, color }], TILE_WIDTH, 56, 1.5, 0.25),
    ],
    {
      width: TILE_WIDTH,
      borderRadius: 16,
      backgroundColor: COLORS.bg1,
      boxShadow: SHADOWS.card,
      overflow: 'hidden',
    }
  );
}

function legend(name: string, color: string): Node {
  return row(
    [element('div', { width: 8, height: 8, borderRadius: 999, backgroundColor: color }), text(name)],
    {
      gap: 6,
      fontSize: 12,
      color: COLORS.fg2,
    }
  );
}

function panel(): Node {
  return column(
    [
      row(
        [
          column(
            [
              text('Overview', { fontSize: 24, fontWeight: 500, color: COLORS.fg4, letterSpacing: -0.5 }),
              text('Subscribers, deliveries, events and runs over time.', {
                fontSize: 16,
                color: COLORS.fg2,
              }),
            ],
            { gap: 2 }
          ),
          row([text('Last 14 days'), icon('IconChevronDownMedium', 14, COLORS.fg2)], {
            height: 30,
            gap: 6,
            padding: '0 8px 0 10px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 500,
            color: COLORS.fg4,
            backgroundColor: COLORS.bg1,
            boxShadow: SHADOWS.card,
          }),
        ],
        { justifyContent: 'space-between', alignItems: 'flex-start' }
      ),
      row(
        [
          tile('Subscribers', '13,460', '11%', SUBSCRIBERS, COLORS.sky4),
          tile('Delivered', '35,285', '24%', DELIVERED, COLORS.blue4),
          tile('Events', '143,380', '18%', EVENTS, COLORS.amber4),
        ],
        { gap: 20 }
      ),
      column(
        [
          row(
            [
              column(
                [
                  text('Deliveries', { fontSize: 16, fontWeight: 500, color: COLORS.fg4 }),
                  text('Sent and failed deliveries per day.', { fontSize: 14, color: COLORS.fg2 }),
                ],
                { gap: 2 }
              ),
              row(
                [
                  legend('Sent', COLORS.green4),
                  legend('Delivered', COLORS.blue4),
                  legend('Failed', COLORS.red4),
                ],
                {
                  gap: 12,
                }
              ),
            ],
            { justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 16px 13px' }
          ),
          areaChart(
            [
              { values: SENT, color: COLORS.green4 },
              { values: DELIVERED, color: COLORS.blue4 },
              { values: FAILED, color: COLORS.red4 },
            ],
            CONTENT_WIDTH,
            160,
            2,
            0.14
          ),
        ],
        {
          width: CONTENT_WIDTH,
          borderRadius: 16,
          backgroundColor: COLORS.bg1,
          boxShadow: SHADOWS.card,
          overflow: 'hidden',
        }
      ),
    ],
    { width: PANEL_WIDTH, gap: 24, padding: '24px 32px' }
  );
}

export function dashboard(): Node {
  return element(
    'div',
    {
      display: 'flex',
      width: WIDTH,
      height: HEIGHT,
      borderRadius: '20px 20px 0 0',
      backgroundColor: COLORS.bg1,
      boxShadow: `${SHADOWS.raised}, 0px 0px 0px 1px ${COLORS.bg3}`,
      overflow: 'hidden',
    },
    [sidebar(), panel()]
  );
}
