import {
  ACTIVITY_BODY_LIMIT,
  ACTIVITY_SCHEMA_VERSION,
  ACTIVITY_TITLE_LIMIT,
  DISPLAYED_SESSIONS,
} from './constants';
import { clip, serializeSession } from './serialize';
import type { ActivityState, Session, SessionStatus } from './types';

const STATUS_PRIORITY: Record<SessionStatus, number> = {
  waiting: 0,
  failed: 1,
  done: 2,
  working: 3,
};

export function deriveActivity(sessions: Session[], now: number): ActivityState {
  const ordered = [...sessions].sort(compareSessions);
  const waiting = ordered.filter((session) => session.status === 'waiting');
  const working = ordered.filter((session) => session.status === 'working');
  const failed = ordered.filter((session) => session.status === 'failed');
  const displayed = ordered.slice(0, DISPLAYED_SESSIONS);

  return {
    version: ACTIVITY_SCHEMA_VERSION,
    headline: clip(
      resolveHeadline(ordered, waiting.length, working.length, failed.length),
      ACTIVITY_TITLE_LIMIT
    ),
    detail: resolveDetail(ordered),
    status: ordered[0]?.status ?? 'done',
    live: waiting.length + working.length,
    waiting: waiting.length,
    overflow: ordered.length - displayed.length,
    progress: resolveProgress(working),
    sessions: displayed.map(serializeSession),
    updatedAt: new Date(now).toISOString(),
  };
}

function compareSessions(left: Session, right: Session): number {
  const byStatus = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
  if (byStatus !== 0) return byStatus;
  if (left.status === 'working') return left.startedAt - right.startedAt;

  return right.updatedAt - left.updatedAt;
}

function resolveHeadline(ordered: Session[], waiting: number, working: number, failed: number): string {
  if (ordered.length === 0) return 'All clear';
  if (ordered.length === 1) return ordered[0].title;

  if (waiting > 0) return waiting === 1 ? 'Waiting on you' : `${waiting} waiting on you`;
  if (failed > 0) return `${failed} failed`;
  if (working > 0) return `${working} ${working === 1 ? 'agent' : 'agents'} working`;

  return 'Done';
}

function resolveDetail(ordered: Session[]): string | null {
  if (ordered.length === 0) return null;
  if (ordered.length === 1)
    return ordered[0].body === null ? null : clip(ordered[0].body, ACTIVITY_BODY_LIMIT);

  const leader = ordered[0];
  const detail = leader.project ? `${leader.project} · ${leader.title}` : leader.title;

  return clip(detail, ACTIVITY_BODY_LIMIT);
}

function resolveProgress(working: Session[]): number | null {
  const measured = working.map(sessionProgress).filter((value): value is number => value !== null);
  if (measured.length === 0) return null;

  const total = measured.reduce((sum, value) => sum + value, 0);
  return Math.round((total / measured.length) * 100) / 100;
}

function sessionProgress(session: Session): number | null {
  if (session.progress !== null) return session.progress;
  if (session.stepTotal === null || session.stepCurrent === null) return null;
  if (session.stepTotal <= 0) return null;

  return Math.min(1, session.stepCurrent / session.stepTotal);
}
