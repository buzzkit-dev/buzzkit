import {
  FAILED_SESSION_LINGER_MS,
  FINISHED_SESSION_LINGER_MS,
  isSessionExpired,
  resolveNextSessionWake,
  SESSION_ABANDONED_MS,
  sessionExpiresAt,
} from '@buzzkit/ping/api/sessions/index';
import { describe, expect, it } from 'vitest';
import { NOW, session } from '../../utils/session';

describe('session expiry', () => {
  it('keeps a working session until it is abandoned', () => {
    const working = session({ status: 'working', updatedAt: NOW });

    expect(sessionExpiresAt(working)).toBe(NOW + SESSION_ABANDONED_MS);
    expect(isSessionExpired(working, NOW)).toBe(false);
    expect(isSessionExpired(working, NOW + SESSION_ABANDONED_MS)).toBe(true);
  });

  it('lingers a finished session for the finished window', () => {
    expect(sessionExpiresAt(session({ status: 'done', endedAt: NOW }))).toBe(
      NOW + FINISHED_SESSION_LINGER_MS
    );
  });

  it('lingers a failed session longer than a finished one', () => {
    expect(sessionExpiresAt(session({ status: 'failed', endedAt: NOW }))).toBe(
      NOW + FAILED_SESSION_LINGER_MS
    );
    expect(FAILED_SESSION_LINGER_MS).toBeGreaterThan(FINISHED_SESSION_LINGER_MS);
  });

  it('never expires a finished session that has no end time', () => {
    expect(sessionExpiresAt(session({ status: 'done', endedAt: null }))).toBeNull();
  });

  it('schedules the earliest wake across sessions', () => {
    const wake = resolveNextSessionWake(
      [
        session({ id: 'a', status: 'working', updatedAt: NOW }),
        session({ id: 'b', status: 'done', endedAt: NOW }),
      ],
      NOW
    );

    expect(wake).toBe(NOW + FINISHED_SESSION_LINGER_MS);
  });

  it('ignores sessions already past their deadline', () => {
    const past = session({ status: 'done', endedAt: NOW - FINISHED_SESSION_LINGER_MS - 1 });

    expect(resolveNextSessionWake([past], NOW)).toBeNull();
  });

  it('has nothing to schedule with no sessions', () => {
    expect(resolveNextSessionWake([], NOW)).toBeNull();
  });
});
