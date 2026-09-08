import { describe, expect, it } from 'vitest';
import type { Failure, NotificationResult } from '../utils/api';
import { call, messagesFor, pair, ping, readJson } from '../utils/api';

describe('notifications', () => {
  it('sends a notification from a title alone', async () => {
    const { key, buzzkit } = await pair();
    const response = await ping(key, { title: 'Tests passed', body: '142 in 38s' });
    const body = await readJson<NotificationResult>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, kind: 'notification' });
    expect(body.id).toBeTruthy();

    const [message] = await messagesFor(buzzkit.externalId);
    expect(message).toMatchObject({
      title: 'Tests passed',
      body: '142 in 38s',
      interruptionLevel: 'active',
    });
  });

  it('accepts a bare string body as the title', async () => {
    const { key, buzzkit } = await pair();
    const response = await call(`/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('  Build finished  '),
    });

    expect(response.status).toBe(200);
    expect((await messagesFor(buzzkit.externalId))[0]).toMatchObject({ title: 'Build finished' });
  });

  it('carries the deep link, ttl and agent metadata through', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, {
      title: 'Done',
      url: 'cursor://open',
      ttl: 60,
      agent: 'claude-code',
      project: 'buzzkit',
      custom: { runId: 'r-1' },
    });

    const [message] = await messagesFor(buzzkit.externalId);
    expect(message).toMatchObject({ deepLink: 'cursor://open', ttlSeconds: 60 });
    expect(message.data).toMatchObject({ agent: 'claude-code', project: 'buzzkit', runId: 'r-1' });
  });

  it('delivers a silent ping without interrupting', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { title: 'Quiet', silent: true });

    expect((await messagesFor(buzzkit.externalId))[0]).toMatchObject({ interruptionLevel: 'passive' });
  });

  it('never groups a plain notification', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { title: 'Standalone' });

    const [message] = await messagesFor(buzzkit.externalId);
    expect(message.collapseId).toBeUndefined();
    expect(message.threadId).toBeUndefined();
  });

  it('refuses a ping without a title', async () => {
    const { key } = await pair();
    const response = await ping(key, { body: 'orphaned' });

    expect(response.status).toBe(400);
    expect((await readJson<Failure>(response)).error.code).toBe('title_missing');
  });

  it('refuses a payload that breaks the schema', async () => {
    const { key } = await pair();
    const response = await ping(key, { title: 'x', progress: 4 });

    expect(response.status).toBe(400);
    expect((await readJson<Failure>(response)).error.code).toBe('invalid_payload');
  });

  it('refuses an unknown key with a useful code', async () => {
    const response = await ping('bz_zzzzzzzzzzzzzzzzzzzzzzzz', { title: 'x' });

    expect(response.status).toBe(404);
    expect((await readJson<Failure>(response)).error.code).toBe('unknown_key');
  });

  it('refuses a key that is not shaped like one', async () => {
    expect((await ping('not-a-key', { title: 'x' })).status).toBe(404);
  });

  it('rate limits a device once its burst is spent', async () => {
    const { key } = await pair();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 14; attempt += 1) {
      statuses.push((await ping(key, { title: `Ping ${attempt}` })).status);
    }

    expect(statuses).toContain(429);
  });

  it('tells a rate limited caller when to come back', async () => {
    const { key } = await pair();
    let limited: Response | undefined;

    for (let attempt = 0; attempt < 14 && !limited; attempt += 1) {
      const response = await ping(key, { title: `Ping ${attempt}` });
      if (response.status === 429) limited = response;
    }

    if (!limited) throw new Error('the rate limit never engaged');

    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await readJson<Failure>(limited)).error.code).toBe('rate_limited');
  });
});
