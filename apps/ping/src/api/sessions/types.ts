export type SessionStatus = 'working' | 'waiting' | 'done' | 'failed';

export type Session = {
  id: string;
  title: string;
  body: string | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  status: SessionStatus;
  progress: number | null;
  stepCurrent: number | null;
  stepTotal: number | null;
  url: string | null;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
};

export type ActivitySession = {
  id: string;
  title: string;
  body?: string;
  agent?: string;
  project?: string;
  avatar?: string;
  status: SessionStatus;
  progress?: number;
  step?: { current: number; total: number };
  startedAt: string;
  updatedAt: string;
};

export type ActivityState = {
  version: number;
  headline: string;
  detail: string | null;
  status: SessionStatus;
  live: number;
  waiting: number;
  overflow: number;
  progress: number | null;
  sessions: ActivitySession[];
  updatedAt: string;
};
