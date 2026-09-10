import { COLORS, column, element, icon, image, type Node, pngAsset, px, row, SHADOWS } from '../primitives';
import { CARD_WIDTH, label } from './elements';

const INK = COLORS.fg4;
const TITLE = 'rgba(255, 255, 255, 1)';
const DETAIL = 'rgba(255, 255, 255, 0.55)';
const TRAILING = 'rgba(255, 255, 255, 0.6)';
const DIVIDER = 'rgba(255, 255, 255, 0.1)';

const AVATAR = px(32);

interface Session {
  agent: string;
  title: string;
  project: string;
  tint: string;
  progress?: string;
}

const SESSIONS: Session[] = [
  {
    agent: 'claude',
    title: 'Running migrations',
    project: 'buzzkit',
    tint: COLORS.sky4,
    progress: '43%',
  },
  { agent: 'codex', title: 'Building the widget', project: 'buzz', tint: COLORS.sky4, progress: '24%' },
  { agent: 'cursor', title: 'Writing the launch copy', project: 'marketing', tint: COLORS.green4 },
];

function agentAvatar(agent: string, tint: string): Node {
  const dot = Math.round(AVATAR * 0.34);
  const ring = px(1.8);
  return element(
    'div',
    { display: 'flex', position: 'relative', width: AVATAR, height: AVATAR, flexShrink: 0 },
    [
      image(pngAsset(`src/assets/agents/${agent}.png`), AVATAR, {
        borderRadius: Math.round(AVATAR * 0.29),
        boxShadow: 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.08)',
      }),
      element(
        'div',
        {
          display: 'flex',
          position: 'absolute',
          right: -Math.round(AVATAR * 0.1) - ring,
          bottom: -Math.round(AVATAR * 0.1) - ring,
          width: dot + ring * 2,
          height: dot + ring * 2,
          borderRadius: 999,
          backgroundColor: INK,
        },
        [element('div', { width: dot, height: dot, borderRadius: 999, backgroundColor: tint })]
      ),
    ]
  );
}

function sessionRow(session: Session): Node {
  return row(
    [
      agentAvatar(session.agent, session.tint),
      column([label(session.title, 15, TITLE, 600), label(session.project, 12, DETAIL)], {
        flex: 1,
        minWidth: 0,
      }),
      session.progress
        ? label(session.progress, 14, TRAILING, 500)
        : icon('IconCircleCheckFilled', px(16), COLORS.green4),
    ],
    { gap: px(12), padding: `${px(8)}px ${px(16)}px` }
  );
}

function divider(): Node {
  return element('div', { display: 'flex', height: 1, marginLeft: px(60), backgroundColor: DIVIDER });
}

export function agents(): Node {
  return column(
    SESSIONS.flatMap((session, index) =>
      index === 0 ? [sessionRow(session)] : [divider(), sessionRow(session)]
    ),
    {
      width: CARD_WIDTH,
      padding: `${px(6)}px 0`,
      borderRadius: px(22),
      backgroundColor: INK,
      boxShadow: SHADOWS.raised,
    }
  );
}
