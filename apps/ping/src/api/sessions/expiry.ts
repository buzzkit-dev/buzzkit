import { FAILED_SESSION_LINGER_MS, FINISHED_SESSION_LINGER_MS, SESSION_ABANDONED_MS } from './constants';
import type { Session } from './types';

export function sessionExpiresAt(session: Session): number | null {
  if (session.status === 'done') {
    return session.endedAt === null ? null : session.endedAt + FINISHED_SESSION_LINGER_MS;
  }
  if (session.status === 'failed') {
    return session.endedAt === null ? null : session.endedAt + FAILED_SESSION_LINGER_MS;
  }

  return session.updatedAt + SESSION_ABANDONED_MS;
}

export function isSessionExpired(session: Session, now: number): boolean {
  const expiry = sessionExpiresAt(session);
  return expiry !== null && expiry <= now;
}

export function resolveNextSessionWake(sessions: Session[], now: number): number | null {
  let next: number | null = null;

  for (const session of sessions) {
    const expiry = sessionExpiresAt(session);
    if (expiry === null || expiry <= now) continue;
    if (next === null || expiry < next) next = expiry;
  }

  return next;
}
