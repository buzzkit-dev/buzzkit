import type { Session } from '@buzzkit/ping/api/sessions/index';

export const NOW = 1_760_000_000_000;

export function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'demo',
    title: 'Working',
    body: null,
    agent: null,
    project: null,
    avatar: null,
    status: 'working',
    progress: null,
    stepCurrent: null,
    stepTotal: null,
    url: null,
    startedAt: NOW - 60_000,
    updatedAt: NOW - 1_000,
    endedAt: null,
    ...overrides,
  };
}
