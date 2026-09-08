import type { SessionStatus } from '@buzzkit/ping/api/sessions/index';

export const TIMELINE_LIMIT = 50;

export const TIMELINE_RETENTION_MS = 7 * 86_400_000;

export const TIMELINE_CHANGED = 'timeline';

export const CONNECTED_TITLE = 'Agent connected';

export const CONNECTED_BODY = 'A coding agent claimed your endpoint.';

export type TimelineKind = 'connected' | 'notification' | 'session';

export type TimelineRow = {
  id: number;
  kind: string;
  session_id: string | null;
  title: string;
  body: string | null;
  status: string | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  url: string | null;
  duration_ms: number | null;
  created_at: number;
};

export type TimelineEventWrite = {
  kind: TimelineKind;
  sessionId: string | null;
  title: string;
  body: string | null;
  status: SessionStatus | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  url: string | null;
  durationMs: number | null;
  now: number;
};

export type TimelineEvent = {
  id: number;
  kind: TimelineKind;
  title: string;
  body: string | null;
  status: SessionStatus | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  session: string | null;
  url: string | null;
  durationMs: number | null;
  at: string;
};

export function serializeTimelineEvent(row: TimelineRow): TimelineEvent {
  return {
    id: row.id,
    kind: row.kind as TimelineKind,
    title: row.title,
    body: row.body,
    status: row.status as SessionStatus | null,
    agent: row.agent,
    project: row.project,
    avatar: row.avatar,
    session: row.session_id,
    url: row.url,
    durationMs: row.duration_ms,
    at: new Date(row.created_at).toISOString(),
  };
}
