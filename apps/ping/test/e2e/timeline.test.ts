import { describe, expect, it } from 'vitest';
import type { Claimed, Minted } from '../utils/api';
import { call, messagesFor, pair, ping, readJson } from '../utils/api';

type Timeline = {
  ok: true;
  events: Array<{
    id: number;
    kind: string;
    title: string;
    body: string | null;
    status: string | null;
    session: string | null;
    durationMs: number | null;
  }>;
};

async function timeline(key: string): Promise<Timeline['events']> {
  return (await readJson<Timeline>(await call(`/${key}/timeline`))).events;
}

describe('timeline', () => {
  it('starts empty and records notifications newest first', async () => {
    const { key } = await pair();
    expect(await timeline(key)).toEqual([]);

    await ping(key, { title: 'Tests passed', body: '142 passed' });
    await ping(key, { title: 'Deploy finished' });

    const events = await timeline(key);
    expect(events.map((event) => event.title)).toEqual(['Deploy finished', 'Tests passed']);
    expect(events[1]).toMatchObject({ kind: 'notification', body: '142 passed' });
  });

  it('records a session only when its status changes', async () => {
    const { key } = await pair();

    await ping(key, { session: 'build', title: 'Building', progress: 0.1 });
    await ping(key, { session: 'build', title: 'Building', progress: 0.5 });
    await ping(key, { session: 'build', title: 'Built', status: 'done' });

    const events = await timeline(key);
    expect(events.map((event) => [event.kind, event.status])).toEqual([
      ['session', 'done'],
      ['session', 'working'],
    ]);
    expect(events[0]?.session).toBe('build');
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(events[1]?.durationMs).toBeNull();
  });

  it('records a waiting session as a status change', async () => {
    const { key } = await pair();
    await ping(key, { session: 'blocked', title: 'Approve the migration?', status: 'waiting' });

    const [event] = await timeline(key);
    expect(event).toMatchObject({ kind: 'session', status: 'waiting', session: 'blocked' });
  });

  it('records the agent connecting and tells the phone', async () => {
    const { key, buzzkit } = await pair();
    const minted = await readJson<Minted>(await call(`/${key}/code`, { method: 'POST' }));
    const claimed = await readJson<Claimed>(
      await call('/pair/claim', {
        method: 'POST',
        body: JSON.stringify({ code: minted.code, agent: 'claude-code' }),
      })
    );
    expect(claimed.key).toBe(key);

    const [event] = await timeline(key);
    expect(event).toMatchObject({ kind: 'connected', title: 'Agent connected', agent: 'claude-code' });
    expect((await messagesFor(buzzkit.externalId))[0]).toMatchObject({
      title: 'Agent connected',
      subtitle: 'Claude Code',
      data: { agent: 'claude-code' },
    });
  });

  it('clears everything on request', async () => {
    const { key } = await pair();
    await ping(key, { title: 'Tests passed' });
    expect(await timeline(key)).toHaveLength(1);

    const response = await call(`/${key}/timeline`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(await timeline(key)).toEqual([]);
  });

  it('rejects an unknown key', async () => {
    const response = await call('/bz_00000000000000000000000/timeline');
    expect(response.status).toBe(404);
  });
});
