import { COLORS, column, element, image, type Node, picture, pngAsset, row, SHADOWS } from '../primitives';

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 2490;
const GLASS_LEFT = 0.0408;
const GLASS_TOP = 0.0197;
const GLASS_WIDTH = 0.9175;
const GLASS_HEIGHT = 0.9622;

const PHONE_WIDTH = 360;
const PHONE_HEIGHT = Math.round((PHONE_WIDTH * FRAME_HEIGHT) / FRAME_WIDTH);
const SCREEN_WIDTH = Math.round(PHONE_WIDTH * GLASS_WIDTH);
const SCREEN_HEIGHT = Math.round(PHONE_HEIGHT * GLASS_HEIGHT);
const SCREEN_LEFT = Math.round(PHONE_WIDTH * GLASS_LEFT);
const SCREEN_TOP = Math.round(PHONE_HEIGHT * GLASS_TOP);

const APP_WIDTH = 393;
const INK = COLORS.fg4;
const ON_INK = 'rgba(255, 255, 255, 1)';
const ON_INK_DETAIL = 'rgba(255, 255, 255, 0.55)';
const ON_INK_TRAILING = 'rgba(255, 255, 255, 0.6)';
const ON_INK_DIVIDER = 'rgba(255, 255, 255, 0.1)';
const RING = 'rgba(0, 0, 0, 0.06)';

function unit(points: number): number {
  return Math.round(((points * SCREEN_WIDTH) / APP_WIDTH) * 2) / 2;
}

function type(content: string, size: number, color: string, weight = 400): Node {
  return element(
    'span',
    { fontSize: unit(size), fontWeight: weight, letterSpacing: unit(size) * -0.02, color },
    content
  );
}

interface Session {
  agent: string;
  title: string;
  project: string;
  progress: string;
}

const SESSIONS: Session[] = [
  { agent: 'claude', title: 'Migrating the node renderer', project: 'buzzkit', progress: '54%' },
  { agent: 'codex', title: 'Building the widget', project: 'Buzz', progress: '35%' },
  { agent: 'cursor', title: 'Rewriting the pricing page', project: 'marketing', progress: '22%' },
];

interface Note {
  agent: string;
  title: string;
  body: string;
  when: string;
}

const NOTES: Note[] = [
  { agent: 'claude', title: 'Tests passed', body: '142 passed in 38s.', when: 'now' },
  { agent: 'cursor', title: 'Build failed', body: '3 type errors in HomeView.swift.', when: '2m ago' },
];

function mark(agent: string, size: number, dotBorder: string): Node {
  const dot = Math.round(size * 0.34);
  const ring = Math.max(1.5, size * 0.055);
  return element('div', { display: 'flex', position: 'relative', width: size, height: size, flexShrink: 0 }, [
    image(pngAsset(`src/assets/agents/${agent}.png`), size, {
      borderRadius: Math.round(size * 0.29),
      boxShadow: `inset 0 0 0 1px ${RING}`,
    }),
    element(
      'div',
      {
        display: 'flex',
        position: 'absolute',
        right: -Math.round(size * 0.1) - ring,
        bottom: -Math.round(size * 0.1) - ring,
        width: dot + ring * 2,
        height: dot + ring * 2,
        borderRadius: 999,
        backgroundColor: dotBorder,
      },
      [element('div', { width: dot, height: dot, borderRadius: 999, backgroundColor: COLORS.sky4 })]
    ),
  ]);
}

function sessionRow(session: Session): Node {
  return row(
    [
      mark(session.agent, unit(32), INK),
      column([type(session.title, 15, ON_INK, 600), type(session.project, 12, ON_INK_DETAIL)], {
        flex: 1,
        minWidth: 0,
      }),
      type(session.progress, 14, ON_INK_TRAILING, 500),
    ],
    { gap: unit(12), padding: `${unit(8)}px ${unit(16)}px`, alignItems: 'center' }
  );
}

function activityCard(): Node {
  const divider = element('div', {
    display: 'flex',
    height: 1,
    marginLeft: unit(60),
    backgroundColor: ON_INK_DIVIDER,
  });
  return column(
    SESSIONS.flatMap((session, index) =>
      index === 0 ? [sessionRow(session)] : [divider, sessionRow(session)]
    ),
    {
      padding: `${unit(6)}px 0`,
      borderRadius: unit(22),
      backgroundColor: INK,
      boxShadow: SHADOWS.raised,
    }
  );
}

function noteCard(note: Note): Node {
  return row(
    [
      mark(note.agent, unit(38), COLORS.bg1),
      column(
        [
          row([type(note.title, 15, COLORS.fg4, 600), type(note.when, 12, COLORS.fg2)], {
            justifyContent: 'space-between',
            gap: unit(8),
          }),
          type(note.body, 15, COLORS.fg3),
        ],
        { flex: 1, minWidth: 0 }
      ),
    ],
    {
      gap: unit(12),
      padding: `${unit(12)}px ${unit(14)}px`,
      alignItems: 'center',
      borderRadius: unit(22),
      backgroundColor: COLORS.bg1,
      boxShadow: SHADOWS.raised,
    }
  );
}

function statusPill(): Node {
  return row(
    [
      element('div', {
        display: 'flex',
        width: unit(9),
        height: unit(9),
        borderRadius: 999,
        backgroundColor: COLORS.sky4,
      }),
      type('3 agents working', 16, COLORS.fg3, 500),
    ],
    {
      gap: unit(8),
      alignItems: 'center',
      padding: `0 ${unit(16)}px`,
      height: unit(44),
      borderRadius: 999,
      backgroundColor: COLORS.bg2,
    }
  );
}

function menuButton(): Node {
  const dot = unit(3.5);
  return row(
    [0, 1, 2].map(() =>
      element('div', {
        display: 'flex',
        width: dot,
        height: dot,
        borderRadius: 999,
        backgroundColor: COLORS.fg2,
      })
    ),
    {
      gap: unit(3),
      alignItems: 'center',
      justifyContent: 'center',
      width: unit(44),
      height: unit(44),
      borderRadius: 999,
      backgroundColor: COLORS.bg2,
    }
  );
}

function screen(): Node {
  return column(
    [
      row([statusPill(), menuButton()], { justifyContent: 'space-between', alignItems: 'center' }),
      column([activityCard(), ...NOTES.map(noteCard)], {
        marginTop: unit(16),
        padding: unit(16),
        gap: unit(12),
        borderRadius: unit(24),
        backgroundImage: `linear-gradient(to bottom, ${COLORS.brand1} 0%, ${COLORS.bg2} 55%, ${COLORS.bg3} 100%)`,
        boxShadow: `inset 0 0 0 1px ${RING}`,
      }),
    ],
    {
      position: 'absolute',
      top: SCREEN_TOP,
      left: SCREEN_LEFT,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      paddingTop: unit(60),
      paddingLeft: unit(24),
      paddingRight: unit(24),
      borderRadius: unit(52),
      backgroundColor: COLORS.bg1,
    }
  );
}

export function phone(): Node {
  return element('div', { display: 'flex', position: 'relative', width: PHONE_WIDTH, height: PHONE_HEIGHT }, [
    screen(),
    picture(pngAsset('public/buzz/iphone.png'), PHONE_WIDTH, PHONE_HEIGHT, {
      position: 'absolute',
      top: 0,
      left: 0,
    }),
  ]);
}
