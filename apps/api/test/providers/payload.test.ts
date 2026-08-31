import {
  buildApnsPayload,
  isSilentPayload,
  resolveEnvelope,
  resolvePushType,
} from '@buzzkit/api/providers/apns/index';
import { buildFcmMessage } from '@buzzkit/api/providers/fcm/index';
import { describe, expect, it } from 'vitest';

describe('provider payloads', () => {
  it('APNs: carries the bk envelope alongside untouched customer data', () => {
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

  it('APNs: a plain message without bk stays exactly as before', () => {
    const payload = buildApnsPayload({ title: 'Hey', data: { a: 1 } });
    expect(payload.bk).toBeUndefined();
    expect(payload.aps).toEqual({ alert: { title: 'Hey' } });
  });

  it('APNs: deliver local becomes a silent push carrying the plan', () => {
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

  it('APNs: a cancel push is silent and carries only the cancel envelope', () => {
    const payload = buildApnsPayload({ silent: true, bk: { cancel: { id: 'run_1' } } });
    expect(payload.aps).toEqual({ 'content-available': 1 });
    expect(payload.bk).toEqual({ cancel: { id: 'run_1' } });
    expect(isSilentPayload({ silent: true })).toBe(true);
    expect(isSilentPayload({ deliver: 'local' })).toBe(true);
    expect(isSilentPayload({ title: 'x' })).toBe(false);
  });

  it('APNs: resolveEnvelope is empty for plain payloads', () => {
    expect(resolveEnvelope({ title: 'x' })).toBeUndefined();
  });

  it('FCM: the bk envelope rides in data as JSON and local drops the notification', () => {
    const { message } = buildFcmMessage(
      'token',
      {
        title: 'Time to move',
        deliver: 'local',
        local: { id: 'run_1:remind', at: '2026-09-01T19:00:00' },
        bk: { messageId: 'msg_3' },
      },
      null
    );
    expect(message.notification).toBeUndefined();
    const bk = JSON.parse((message.data as Record<string, string>).bk);
    expect(bk.messageId).toBe('msg_3');
    expect(bk.local.id).toBe('run_1:remind');
    expect(bk.local.title).toBe('Time to move');
  });

  it('FCM: a plain message keeps its notification and gains data.bk when stamped', () => {
    const { message } = buildFcmMessage('token', { title: 'Hey', bk: { messageId: 'msg_4' } }, null);
    expect((message.notification as Record<string, unknown>).title).toBe('Hey');
    expect(JSON.parse((message.data as Record<string, string>).bk).messageId).toBe('msg_4');
  });
});

describe('rich push features', () => {
  it('APNs: threads, interruption level, relevance, and target content ride in aps', () => {
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

  it('APNs: actions set a stable category, force mutable content, and ride in bk', () => {
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
  });

  it('APNs: a live activity payload builds the liveactivity shape and push type', () => {
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

  it('APNs: a start event carries the attributes type and attributes', () => {
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
});
