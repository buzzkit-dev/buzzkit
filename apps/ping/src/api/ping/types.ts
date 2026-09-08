import type { SessionStatus } from '@buzzkit/ping/api/sessions/types';

export type PingInput = {
  title: string | null;
  body: string | null;
  session: string | null;
  status: SessionStatus | null;
  progress: number | null;
  step: { current: number; total: number } | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  url: string | null;
  silent: boolean;
  important: boolean;
  ttlSeconds: number | null;
  custom: Record<string, unknown> | null;
};

export type ActivityOutcome = 'started' | 'updated' | 'ended' | 'coalesced' | 'unchanged' | 'unavailable';

export type PingResult =
  | { ok: true; kind: 'notification'; id: string | null; delivered: boolean }
  | {
      ok: true;
      kind: 'session';
      session: string;
      status: SessionStatus;
      activity: ActivityOutcome;
      notice?: string;
    };
