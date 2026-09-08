import type { Session, SessionStatus } from '@buzzkit/ping/api/sessions/index';
import { TIMELINE_LIMIT, type TimelineEventWrite, type TimelineRow } from '@buzzkit/ping/api/timeline/index';
import type { Budget } from '@buzzkit/ping/utils/budget';
import { DEVICE_SCHEMA } from './schema';

type Sql = DurableObjectState['storage']['sql'];

export type DeviceRow = {
  external_id: string;
  activity_id: string | null;
  activity_started_at: number | null;
  last_push_at: number;
  present_until: number | null;
  created_at: number;
};

type SessionRow = {
  id: string;
  title: string;
  body: string | null;
  agent: string | null;
  project: string | null;
  avatar: string | null;
  status: string;
  progress: number | null;
  step_current: number | null;
  step_total: number | null;
  url: string | null;
  started_at: number;
  updated_at: number;
  ended_at: number | null;
};

export type SessionWrite = {
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
  now: number;
  endedAt: number | null;
};

export class DeviceStore {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
    this.sql.exec(DEVICE_SCHEMA);
    this.migrateEvents();
  }

  private migrateEvents(): void {
    const eventColumns = this.sql
      .exec<{ name: string }>('PRAGMA table_info(events)')
      .toArray()
      .map((column) => column.name);
    if (!eventColumns.includes('duration_ms')) {
      this.sql.exec('ALTER TABLE events ADD COLUMN duration_ms INTEGER');
    }
    if (!eventColumns.includes('avatar')) this.sql.exec('ALTER TABLE events ADD COLUMN avatar TEXT');

    const sessionColumns = this.sql
      .exec<{ name: string }>('PRAGMA table_info(sessions)')
      .toArray()
      .map((column) => column.name);
    if (!sessionColumns.includes('avatar')) this.sql.exec('ALTER TABLE sessions ADD COLUMN avatar TEXT');
  }

  readDevice(): DeviceRow | null {
    const [row] = this.sql.exec<DeviceRow>('SELECT * FROM device WHERE id = 1').toArray();
    return row ?? null;
  }

  writeDevice(externalId: string, now: number): void {
    this.sql.exec(
      `INSERT INTO device (id, external_id, created_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET external_id = excluded.external_id`,
      externalId,
      now
    );
  }

  writeActivityStart(now: number): void {
    this.sql.exec('UPDATE device SET activity_id = NULL, activity_started_at = ? WHERE id = 1', now);
  }

  writeActivityId(activityId: string): void {
    this.sql.exec('UPDATE device SET activity_id = ? WHERE id = 1', activityId);
  }

  writeActivityEnded(): void {
    this.sql.exec('UPDATE device SET activity_id = NULL, activity_started_at = NULL WHERE id = 1');
  }

  writePresence(until: number | null): void {
    this.sql.exec('UPDATE device SET present_until = ? WHERE id = 1', until);
  }

  writeLastPush(now: number): void {
    this.sql.exec('UPDATE device SET last_push_at = ? WHERE id = 1', now);
  }

  readSessions(): Session[] {
    return this.sql.exec<SessionRow>('SELECT * FROM sessions').toArray().map(resolveSession);
  }

  writeSession(input: SessionWrite): void {
    this.sql.exec(
      `INSERT INTO sessions (id, title, body, agent, project, avatar, status, progress, step_current, step_total, url, started_at, updated_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         title = excluded.title,
         body = COALESCE(excluded.body, sessions.body),
         agent = COALESCE(excluded.agent, sessions.agent),
         project = COALESCE(excluded.project, sessions.project),
         avatar = COALESCE(excluded.avatar, sessions.avatar),
         status = excluded.status,
         progress = COALESCE(excluded.progress, sessions.progress),
         step_current = COALESCE(excluded.step_current, sessions.step_current),
         step_total = COALESCE(excluded.step_total, sessions.step_total),
         url = COALESCE(excluded.url, sessions.url),
         updated_at = excluded.updated_at,
         ended_at = excluded.ended_at`,
      input.id,
      input.title,
      input.body,
      input.agent,
      input.project,
      input.avatar,
      input.status,
      input.progress,
      input.stepCurrent,
      input.stepTotal,
      input.url,
      input.now,
      input.now,
      input.endedAt
    );
  }

  readSessionStatus(id: string): SessionStatus | null {
    const [row] = this.sql.exec<{ status: string }>('SELECT status FROM sessions WHERE id = ?', id).toArray();
    return row ? (row.status as SessionStatus) : null;
  }

  removeSessions(ids: string[]): void {
    for (const id of ids) {
      this.sql.exec('DELETE FROM sessions WHERE id = ?', id);
    }
  }

  removeAllSessions(): void {
    this.sql.exec('DELETE FROM sessions');
  }

  insertEvent(event: TimelineEventWrite): void {
    this.sql.exec(
      `INSERT INTO events (kind, session_id, title, body, status, agent, project, avatar, url, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.kind,
      event.sessionId,
      event.title,
      event.body,
      event.status,
      event.agent,
      event.project,
      event.avatar,
      event.url,
      event.durationMs,
      event.now
    );
    this.sql.exec(
      `DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT ?)`,
      TIMELINE_LIMIT
    );
  }

  readEvents(): TimelineRow[] {
    return this.sql.exec<TimelineRow>('SELECT * FROM events ORDER BY created_at DESC, id DESC').toArray();
  }

  removeEventsBefore(before: number): void {
    this.sql.exec('DELETE FROM events WHERE created_at < ?', before);
  }

  removeAllEvents(): void {
    this.sql.exec('DELETE FROM events');
  }

  readBudget(): Budget | null {
    const [row] = this.sql
      .exec<{ tokens: number; refilled_at: number }>('SELECT * FROM budget WHERE id = 1')
      .toArray();
    return row ? { tokens: row.tokens, refilledAt: row.refilled_at } : null;
  }

  writeBudget(budget: Budget): void {
    this.sql.exec(
      `INSERT INTO budget (id, tokens, refilled_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET tokens = excluded.tokens, refilled_at = excluded.refilled_at`,
      budget.tokens,
      budget.refilledAt
    );
  }
}

function resolveSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    agent: row.agent,
    project: row.project,
    avatar: row.avatar,
    status: row.status as SessionStatus,
    progress: row.progress,
    stepCurrent: row.step_current,
    stepTotal: row.step_total,
    url: row.url,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
  };
}
