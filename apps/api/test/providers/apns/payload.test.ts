import {
  buildApnsPayload,
  buildLiveActivityPayload,
  isSilentPayload,
  resolveCategoryId,
  resolveEnvelope,
  resolvePushType,
} from '@buzzkit/api/providers/apns/index';
import { describe, expect, it } from 'vitest';

describe('buildApnsPayload', () => {
  it('maps the cross-platform fields and lets apns.payload override', () => {
    const payload = buildApnsPayload({
      title: 'T',
      subtitle: 'S',
      body: 'B',
      badge: 3,
      sound: 'ping',
      imageUrl: 'https://x/y.png',
      data: { deepLink: 'app://x' },
      apns: { payload: { extra: 'raw' } },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps.alert).toEqual({ title: 'T', subtitle: 'S', body: 'B' });
    expect(aps.badge).toBe(3);
    expect(aps.sound).toBe('ping');
    expect(aps['mutable-content']).toBe(1);
    expect(payload.deepLink).toBe('app://x');
    expect(payload.extra).toBe('raw');

    const overridden = buildApnsPayload({ title: 'T', apns: { payload: { aps: { alert: 'custom' } } } });
    expect(overridden.aps).toEqual({ alert: 'custom' });
  });

  it('carries the bk envelope alongside untouched customer data', () => {
    const payload = buildApnsPayload({
      title: 'Hey',
      body: 'There',
      imageUrl: 'https://cdn.example.com/a.png',
      data: { plan: 'pro' },
      bk: { messageId: 'msg_1', image: 'https://cdn.example.com/a.png' },
    });
    expect(payload.bk).toEqual({ messageId: 'msg_1', image: 'https://cdn.example.com/a.png' });
    expect(payload.plan).toBe('pro');
    expect(payload.imageUrl).toBe('https://cdn.example.com/a.png');
    expect((payload.aps as Record<string, unknown>)['mutable-content']).toBe(1);
  });

  it('keeps a plain message without bk exactly as before', () => {
    const payload = buildApnsPayload({ title: 'Hey', data: { a: 1 } });
    expect(payload.bk).toBeUndefined();
    expect(payload.aps).toEqual({ alert: { title: 'Hey' } });
  });

  it('turns deliver local into a silent push carrying the plan', () => {
    const payload = buildApnsPayload({
      title: 'Time to move',
      body: 'Your workout is waiting.',
      data: { kind: 'reminder' },
      deliver: 'local',
      local: { id: 'run_1:remind', at: '2026-09-01T19:00:00', cancelOn: ['workout.completed'] },
      bk: { messageId: 'msg_2' },
    });
    expect(payload.aps).toEqual({ 'content-available': 1 });
    expect(payload.title).toBeUndefined();
    const bk = payload.bk as Record<string, unknown>;
    expect(bk.messageId).toBe('msg_2');
    expect(bk.local).toEqual({
      id: 'run_1:remind',
      at: '2026-09-01T19:00:00',
      cancelOn: ['workout.completed'],
      title: 'Time to move',
      body: 'Your workout is waiting.',
      data: { kind: 'reminder' },
    });
  });

  it('builds a silent cancel push carrying only the cancel envelope', () => {
    const payload = buildApnsPayload({ silent: true, bk: { cancel: { id: 'run_1' } } });
    expect(payload.aps).toEqual({ 'content-available': 1 });
    expect(payload.bk).toEqual({ cancel: { id: 'run_1' } });
    expect(isSilentPayload({ silent: true })).toBe(true);
    expect(isSilentPayload({ deliver: 'local' })).toBe(true);
    expect(isSilentPayload({ title: 'x' })).toBe(false);
  });

  it('rides threads, interruption level, relevance, and target content in aps', () => {
    const payload = buildApnsPayload({
      title: 'Score update',
      threadId: 'game-42',
      interruptionLevel: 'timeSensitive',
      relevanceScore: 0.8,
      targetContentId: 'window-1',
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps['thread-id']).toBe('game-42');
    expect(aps['interruption-level']).toBe('time-sensitive');
    expect(aps['relevance-score']).toBe(0.8);
    expect(aps['target-content-id']).toBe('window-1');
  });

  it('gives actions a stable derived category, forces mutable content, and rides them in bk', () => {
    const actions = [
      { id: 'accept', title: 'Accept', foreground: true },
      { id: 'decline', title: 'Decline', destructive: true },
    ];
    const first = buildApnsPayload({ title: 'Invite', actions });
    const second = buildApnsPayload({ title: 'Invite', actions });
    const aps = first.aps as Record<string, unknown>;
    expect(aps.category).toMatch(/^bk\./);
    expect(aps.category).toBe((second.aps as Record<string, unknown>).category);
    expect(aps['mutable-content']).toBe(1);
    const bk = first.bk as Record<string, unknown>;
    expect(bk.actions).toEqual(actions);
    expect(bk.category).toBe(aps.category);
    expect(buildApnsPayload({ title: 'Invite', actions, category: 'custom' }).aps).toMatchObject({
      category: 'custom',
    });
    expect(resolveCategoryId({ title: 'x' })).toBeUndefined();
    expect(resolveCategoryId({ title: 'x', actions: [] })).toBeUndefined();
  });
});

describe('resolveEnvelope', () => {
  it('is empty for plain payloads', () => {
    expect(resolveEnvelope({ title: 'x' })).toBeUndefined();
  });

  it('collects deep link and action into the envelope', () => {
    const envelope = resolveEnvelope({
      title: 'x',
      deepLink: 'app://settings',
      action: { name: 'open', data: { tab: 'billing' } },
    });
    expect(envelope).toEqual({
      deepLink: 'app://settings',
      action: { name: 'open', data: { tab: 'billing' } },
    });
  });
});

describe('live activities', () => {
  it('builds the liveactivity shape and push type', () => {
    const payload = buildApnsPayload({
      liveActivity: {
        event: 'update',
        contentState: { score: 3 },
        alert: { title: 'Goal', body: '3 to 1', sound: 'default' },
        staleDate: '2026-09-01T19:00:00.000Z',
      },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps.event).toBe('update');
    expect(aps['content-state']).toEqual({ score: 3 });
    expect(aps['stale-date']).toBe(Math.floor(Date.parse('2026-09-01T19:00:00.000Z') / 1000));
    expect((aps.alert as Record<string, unknown>).title).toBe('Goal');
    expect(resolvePushType({ liveActivity: { event: 'update', contentState: {} } })).toBe('liveactivity');
    expect(resolvePushType({ deliver: 'local' })).toBe('background');
    expect(resolvePushType({ title: 'x' })).toBe('alert');
  });

  it('carries the attributes type and attributes on a start event', () => {
    const payload = buildApnsPayload({
      liveActivity: {
        event: 'start',
        contentState: { score: 0 },
        attributesType: 'MatchAttributes',
        attributes: { matchId: 'm_1' },
      },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps['attributes-type']).toBe('MatchAttributes');
    expect(aps.attributes).toEqual({ matchId: 'm_1' });
  });

  it('drops unparseable stale and dismissal dates and defaults the timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const payload = buildLiveActivityPayload({
      liveActivity: { event: 'end', contentState: {}, staleDate: 'garbage', dismissalDate: 'also-garbage' },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps['stale-date']).toBeUndefined();
    expect(aps['dismissal-date']).toBeUndefined();
    expect(aps.timestamp as number).toBeGreaterThanOrEqual(before);
    expect(buildLiveActivityPayload({ title: 'x' })).toEqual({});
  });

  it('honors an explicit dismissal date and timestamp', () => {
    const payload = buildLiveActivityPayload({
      liveActivity: {
        event: 'end',
        contentState: {},
        dismissalDate: '2026-09-01T20:00:00.000Z',
        timestamp: 1234,
      },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps['dismissal-date']).toBe(Math.floor(Date.parse('2026-09-01T20:00:00.000Z') / 1000));
    expect(aps.timestamp).toBe(1234);
  });
});
