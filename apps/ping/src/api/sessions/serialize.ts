import { ACTIVITY_BODY_LIMIT, ACTIVITY_LABEL_LIMIT, ACTIVITY_TITLE_LIMIT } from './constants';
import type { ActivitySession, Session } from './types';

export function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

export function serializeSession(session: Session): ActivitySession {
  return {
    id: session.id,
    title: clip(session.title, ACTIVITY_TITLE_LIMIT),
    status: session.status,
    startedAt: new Date(session.startedAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
    ...(session.body ? { body: clip(session.body, ACTIVITY_BODY_LIMIT) } : {}),
    ...(session.agent ? { agent: clip(session.agent, ACTIVITY_LABEL_LIMIT) } : {}),
    ...(session.project ? { project: clip(session.project, ACTIVITY_LABEL_LIMIT) } : {}),
    ...(session.avatar ? { avatar: session.avatar } : {}),
    ...(session.progress !== null ? { progress: session.progress } : {}),
    ...(session.stepCurrent !== null && session.stepTotal !== null
      ? { step: { current: session.stepCurrent, total: session.stepTotal } }
      : {}),
  };
}
