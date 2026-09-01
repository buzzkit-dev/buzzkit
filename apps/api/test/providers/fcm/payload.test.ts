import { buildFcmMessage } from '@buzzkit/api/providers/fcm/index';
import { describe, expect, it } from 'vitest';

describe('buildFcmMessage', () => {
  it('keeps the notification and stamps data.bk on a plain message', () => {
    const { message } = buildFcmMessage('token', { title: 'Hey', bk: { messageId: 'msg_4' } }, null);
    expect((message.notification as Record<string, unknown>).title).toBe('Hey');
    expect(JSON.parse((message.data as Record<string, string>).bk).messageId).toBe('msg_4');
  });

  it('rides the bk envelope in data as JSON and drops the notification for local delivery', () => {
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

  it('stringifies non-string data values and leaves strings alone', () => {
    const { message } = buildFcmMessage(
      'token',
      { title: 'x', data: { a: 'raw', b: 2, c: { d: true } } },
      null
    );
    const data = message.data as Record<string, string>;
    expect(data.a).toBe('raw');
    expect(data.b).toBe('2');
    expect(data.c).toBe('{"d":true}');
  });

  it('maps priority, collapse key, sound, and ttl into android options', () => {
    const expiresAt = new Date(Date.now() + 90_000);
    const { message } = buildFcmMessage(
      'token',
      { title: 'x', priority: 'normal', collapseId: 'thread', sound: 'ping' },
      expiresAt
    );
    const android = message.android as Record<string, unknown>;
    expect(android.priority).toBe('NORMAL');
    expect(android.collapse_key).toBe('thread');
    expect((android.notification as Record<string, unknown>).sound).toBe('ping');
    expect(String(android.ttl)).toMatch(/^(89|90)s$/);
  });

  it('defaults to high priority and lets fcm overrides win', () => {
    const { message } = buildFcmMessage(
      'token',
      {
        title: 'x',
        fcm: { android: { priority: 'NORMAL' }, payload: { fcm_options: { analytics_label: 'a' } } },
      },
      null
    );
    expect((message.android as Record<string, unknown>).priority).toBe('NORMAL');
    expect((message as Record<string, unknown>).fcm_options).toEqual({ analytics_label: 'a' });
  });

  it('carries actions with their category through the envelope', () => {
    const actions = [{ id: 'open', title: 'Open' }];
    const { message } = buildFcmMessage('token', { title: 'x', actions, category: 'custom' }, null);
    const bk = JSON.parse((message.data as Record<string, string>).bk);
    expect(bk.actions).toEqual(actions);
    expect(bk.category).toBe('custom');
  });
});
