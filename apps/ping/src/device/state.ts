import { DurableObject } from 'cloudflare:workers';
import type { ActivityOutcome, DeliveryPolicy, PingInput, PingResult } from '@buzzkit/ping/api/ping/index';
import { PING_RATE_LIMIT, resolveDeliveryPolicy, resolveSubtitle } from '@buzzkit/ping/api/ping/index';
import type { ActivityState, Session, SessionStatus } from '@buzzkit/ping/api/sessions/index';
import {
  ACTIVITY_ATTRIBUTES_TYPE,
  ACTIVITY_STALE_MS,
  deriveActivity,
  FINISHED_SESSION_LINGER_MS,
  isSessionExpired,
  resolveActivityNotice,
  resolveNextSessionWake,
} from '@buzzkit/ping/api/sessions/index';
import {
  CONNECTED_BODY,
  CONNECTED_TITLE,
  serializeTimelineEvent,
  TIMELINE_CHANGED,
  TIMELINE_RETENTION_MS,
  type TimelineEvent,
  type TimelineEventWrite,
} from '@buzzkit/ping/api/timeline/index';
import { buzzkit } from '@buzzkit/ping/libs/buzzkit';
import { describeError, PingError, RateLimitedError, UnknownKeyError } from '@buzzkit/ping/libs/error';
import { log } from '@buzzkit/ping/libs/logger';
import { spendBudget } from '@buzzkit/ping/utils/budget';
import type { BuzzKit } from 'buzzkit';
import { resolveActivityPush } from './activity';
import { ACTIVITY_BIND_RETRY_MS, ACTIVITY_START_GRACE_MS } from './constants';
import type { DeviceRow, SessionWrite } from './store';
import { DeviceStore } from './store';
import type { DeviceOutcome } from './types';

export type DeviceSnapshot = {
  externalId: string;
  activityId: string | null;
  activity: ActivityState;
};

type ActivityAlert = { title: string; body?: string };

export class DeviceState extends DurableObject<Env> {
  private readonly store: DeviceStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new DeviceStore(ctx.storage.sql);
  }

  pair(externalId: string): void {
    this.store.writeDevice(externalId, Date.now());
  }

  markPresent(until: number | null): void {
    this.store.writePresence(until);
  }

  async bindActivity(activityId: string | null): Promise<DeviceOutcome<void>> {
    return await this.guard(async () => {
      const now = Date.now();
      if (!activityId) {
        this.store.writeActivityEnded();
        return;
      }

      this.store.writeActivityId(activityId);
      await this.pushActivity(this.findDevice(), now, true);
      await this.scheduleWake(now, now + ACTIVITY_BIND_RETRY_MS);
    });
  }

  async snapshot(): Promise<DeviceOutcome<DeviceSnapshot>> {
    return await this.guard(() => {
      const device = this.findDevice();
      const now = Date.now();
      this.pruneSessions(now);

      return {
        externalId: device.external_id,
        activityId: device.activity_id,
        activity: deriveActivity(this.store.readSessions(), now),
      };
    });
  }

  async reset(): Promise<DeviceOutcome<void>> {
    return await this.guard(async () => {
      const device = this.findDevice();
      const now = Date.now();
      this.store.removeAllSessions();
      this.broadcastTimeline();
      await this.pushActivity(device, now, true);
    });
  }

  async ping(input: PingInput): Promise<DeviceOutcome<PingResult>> {
    return await this.guard(async () => await this.runPing(input));
  }

  async recordConnection(agent: string | null = null): Promise<DeviceOutcome<void>> {
    return await this.guard(async () => {
      const device = this.findDevice();
      const now = Date.now();
      const subtitle = resolveSubtitle({ agent, project: null });
      this.recordEvent({
        kind: 'connected',
        sessionId: null,
        title: CONNECTED_TITLE,
        body: CONNECTED_BODY,
        status: null,
        agent,
        project: null,
        avatar: null,
        url: null,
        durationMs: null,
        now,
      });

      try {
        await buzzkit().messages.send({
          to: device.external_id,
          title: CONNECTED_TITLE,
          body: CONNECTED_BODY,
          ...(subtitle ? { subtitle } : {}),
          interruptionLevel: 'active',
          ...(agent ? { data: { agent } } : {}),
        });
      } catch (error) {
        log.warn('[Ping] Connected notification failed', {
          externalId: device.external_id,
          error: describeError(error),
        });
      }
    });
  }

  async timeline(): Promise<DeviceOutcome<TimelineEvent[]>> {
    return await this.guard(() => {
      this.findDevice();
      return this.store.readEvents().map((row) => serializeTimelineEvent(row));
    });
  }

  async clearTimeline(): Promise<DeviceOutcome<void>> {
    return await this.guard(() => {
      this.findDevice();
      this.store.removeAllEvents();
      this.broadcastTimeline();
    });
  }

  override fetch(request: Request): Response {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!this.store.readDevice()) return new Response('Unknown device', { status: 404 });

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override webSocketMessage(): void {}

  override webSocketClose(socket: WebSocket, code: number): void {
    socket.close(code, 'Closing');
  }

  override webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Error');
  }

  private broadcastTimeline(): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(TIMELINE_CHANGED);
      } catch (error) {
        log.warn('[Ping] Timeline broadcast failed', { error: describeError(error) });
      }
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.pruneSessions(now);
    this.store.removeEventsBefore(now - TIMELINE_RETENTION_MS);

    const device = this.store.readDevice();
    if (device) await this.pushActivity(device, now, true);
  }

  private async runPing(input: PingInput): Promise<PingResult> {
    const now = Date.now();
    const spend = spendBudget(this.store.readBudget(), now, PING_RATE_LIMIT);
    this.store.writeBudget(spend.budget);
    if (!spend.allowed) throw new RateLimitedError(spend.retryAfterSeconds);

    const device = this.findDevice();
    this.pruneSessions(now);

    if (input.session) return await this.recordSession(device, input, now);

    return await this.recordNotification(device, input);
  }

  private recordEvent(event: TimelineEventWrite): void {
    this.store.insertEvent(event);
    this.broadcastTimeline();
  }

  private async guard<T>(run: () => T | Promise<T>): Promise<DeviceOutcome<T>> {
    try {
      return { ok: true, value: await run() };
    } catch (thrown) {
      if (!(thrown instanceof PingError)) throw thrown;

      return {
        ok: false,
        status: thrown.status,
        code: thrown.code,
        message: thrown.message,
        ...(thrown instanceof RateLimitedError ? { retryAfterSeconds: thrown.retryAfterSeconds } : {}),
      };
    }
  }

  private async recordNotification(device: DeviceRow, input: PingInput): Promise<PingResult> {
    const policy = resolveDeliveryPolicy({
      kind: 'notification',
      session: null,
      status: null,
      statusChanged: false,
      silent: input.silent,
      present: isPresent(device, Date.now()),
      hasActivity: false,
    });

    this.recordEvent({
      ...resolveEventFromPing(input, 'notification', input.title ?? ''),
      sessionId: null,
      status: null,
      durationMs: null,
      now: Date.now(),
    });

    if (!policy.notify) return { ok: true, kind: 'notification', id: null, delivered: false };

    const message = await buzzkit().messages.send({
      to: device.external_id,
      title: input.title ?? '',
      ...(input.body ? { body: input.body } : {}),
      ...resolveSubtitleField(input),
      ...(input.url ? { deepLink: input.url } : {}),
      ...(input.ttlSeconds !== null ? { ttlSeconds: input.ttlSeconds } : {}),
      interruptionLevel: policy.interruptionLevel,
      data: resolvePingMetadata(input),
    });

    return { ok: true, kind: 'notification', id: message.id, delivered: true };
  }

  private async recordSession(device: DeviceRow, input: PingInput, now: number): Promise<PingResult> {
    const sessionId = input.session as string;
    const status = input.status ?? 'working';
    const previous = this.store.readSessionStatus(sessionId);
    const finished = status === 'done' || status === 'failed';

    this.store.writeSession({
      ...resolveWriteFromPing(input, sessionId, input.title ?? sessionId),
      status,
      now,
      endedAt: finished ? now : null,
    });

    const changed = previous !== status;
    if (changed) {
      const startedAt = this.selectSession(sessionId)?.startedAt ?? now;
      this.recordEvent({
        ...resolveEventFromPing(input, 'session', input.title ?? sessionId),
        sessionId,
        status,
        durationMs: finished ? now - startedAt : null,
        now,
      });
    }
    const alert = changed && !input.silent ? resolveSessionAlert(input, status) : null;
    const activity = await this.pushActivity(device, now, changed, alert);

    const policy = resolveDeliveryPolicy({
      kind: 'session',
      session: sessionId,
      status,
      statusChanged: changed,
      silent: input.silent,
      present: isPresent(device, now),
      hasActivity: CARRIED_BY_ACTIVITY.has(activity),
    });
    if (policy.notify) await this.notifySession(device, input, sessionId, status, policy);

    const notice = resolveActivityNotice(input.title, input.body);

    return { ok: true, kind: 'session', session: sessionId, status, activity, ...(notice ? { notice } : {}) };
  }

  private async notifySession(
    device: DeviceRow,
    input: PingInput,
    sessionId: string,
    status: SessionStatus,
    policy: DeliveryPolicy
  ): Promise<void> {
    await buzzkit().messages.send({
      to: device.external_id,
      title: input.title ?? sessionId,
      ...(input.body ? { body: input.body } : {}),
      ...resolveSubtitleField(input),
      ...(input.url ? { deepLink: input.url } : {}),
      ...(policy.collapseId ? { collapseId: policy.collapseId } : {}),
      ...(policy.threadId ? { threadId: policy.threadId } : {}),
      interruptionLevel: policy.interruptionLevel,
      data: { ...resolvePingMetadata(input), buzzStatus: status },
    });
  }

  private async pushActivity(
    device: DeviceRow,
    now: number,
    force: boolean,
    alert: ActivityAlert | null = null
  ): Promise<ActivityOutcome> {
    const sessions = this.store.readSessions();
    const decision = resolveActivityPush({
      activityId: device.activity_id,
      activityStartedAt: device.activity_started_at,
      lastPushAt: device.last_push_at,
      sessionCount: sessions.length,
      now,
      force,
    });

    if (decision.action === 'none') return 'unchanged';

    if (decision.action === 'wait') {
      await this.scheduleWake(now, decision.at);
      return 'coalesced';
    }

    const state = deriveActivity(sessions, now);

    if (decision.action === 'end') {
      await this.sendActivity(device, 'end', decision.activityId, state, now, null, force);
      this.store.writeActivityEnded();
      return 'ended';
    }

    if (decision.action === 'start') {
      const started = await this.sendActivity(
        device,
        'start',
        null,
        state,
        now,
        alert ?? resolveStartAlert(state),
        true
      );
      if (!started) return 'unavailable';

      this.store.writeActivityStart(now);
      this.store.writeLastPush(now);
      await this.scheduleWake(now, now + ACTIVITY_START_GRACE_MS);
      return 'started';
    }

    const updated = await this.sendActivity(device, 'update', decision.activityId, state, now, alert, force);
    if (!updated) return 'unavailable';

    this.store.writeLastPush(now);
    await this.scheduleWake(now, null);
    return 'updated';
  }

  private async sendActivity(
    device: DeviceRow,
    event: BuzzKit.LiveActivityEvent,
    activityId: string | null,
    state: ActivityState,
    now: number,
    alert: ActivityAlert | null,
    high: boolean
  ): Promise<boolean> {
    try {
      await buzzkit().liveActivities.send({
        to: device.external_id,
        event,
        ...(activityId ? { activityId } : {}),
        ...(event === 'start' ? { attributesType: ACTIVITY_ATTRIBUTES_TYPE, attributes: {} } : {}),
        contentState: state as unknown as Record<string, unknown>,
        ...(alert ? { alert } : {}),
        staleDate: new Date(now + ACTIVITY_STALE_MS).toISOString(),
        ...(event === 'end'
          ? { dismissalDate: new Date(now + FINISHED_SESSION_LINGER_MS).toISOString() }
          : {}),
        priority: high ? 'high' : 'normal',
        timestamp: Math.floor(now / 1000),
      });
      return true;
    } catch (error) {
      log.warn('[Ping] Live activity push failed', {
        event,
        activityId,
        externalId: device.external_id,
        error: describeError(error),
      });
      return false;
    }
  }

  private pruneSessions(now: number): void {
    const stale = this.store.readSessions().filter((session) => isSessionExpired(session, now));
    if (stale.length > 0) this.store.removeSessions(stale.map((session) => session.id));
  }

  private async scheduleWake(now: number, at: number | null): Promise<void> {
    const sessionExpiry = resolveNextSessionWake(this.store.readSessions(), now);
    const candidates = [at, sessionExpiry].filter((value): value is number => value !== null);
    if (candidates.length === 0) return;

    const next = Math.min(...candidates);
    const current = await this.ctx.storage.getAlarm();
    if (current !== null && current <= next) return;

    await this.ctx.storage.setAlarm(next);
  }

  private selectSession(id: string): Session | null {
    return this.store.readSessions().find((session) => session.id === id) ?? null;
  }

  private findDevice(): DeviceRow {
    const device = this.store.readDevice();
    if (!device) throw new UnknownKeyError();

    return device;
  }
}

const CARRIED_BY_ACTIVITY = new Set<ActivityOutcome>(['started', 'updated', 'coalesced']);

function isPresent(device: DeviceRow, now: number): boolean {
  return device.present_until !== null && device.present_until > now;
}

function resolveStartAlert(state: ActivityState): ActivityAlert {
  return { title: state.headline, ...(state.detail ? { body: state.detail } : {}) };
}

function resolveSessionAlert(input: PingInput, status: SessionStatus): ActivityAlert | null {
  if (status === 'working' || status === 'waiting') return null;

  return {
    title: input.title ?? (status === 'failed' ? 'Failed' : 'Done'),
    ...(input.body ? { body: input.body } : {}),
  };
}

function resolveSubtitleField(input: PingInput): { subtitle?: string } {
  const subtitle = resolveSubtitle(input);
  return subtitle ? { subtitle } : {};
}

function resolvePingMetadata(input: PingInput): Record<string, unknown> {
  return {
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.project ? { project: input.project } : {}),
    ...(input.avatar ? { avatar: input.avatar } : {}),
    ...(input.session ? { session: input.session } : {}),
    ...(input.custom ?? {}),
  };
}

function resolveEventFromPing(
  input: PingInput,
  kind: TimelineEventWrite['kind'],
  title: string
): Pick<TimelineEventWrite, 'kind' | 'title' | 'body' | 'agent' | 'project' | 'avatar' | 'url'> {
  return {
    kind,
    title,
    body: input.body,
    agent: input.agent,
    project: input.project,
    avatar: input.avatar,
    url: input.url,
  };
}

function resolveWriteFromPing(
  input: PingInput,
  id: string,
  title: string
): Omit<SessionWrite, 'status' | 'now' | 'endedAt'> {
  return {
    id,
    title,
    body: input.body,
    agent: input.agent,
    project: input.project,
    avatar: input.avatar,
    progress: input.progress,
    stepCurrent: input.step?.current ?? null,
    stepTotal: input.step?.total ?? null,
    url: input.url,
  };
}
