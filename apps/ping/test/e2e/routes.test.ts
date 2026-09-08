import { describe, expect, it } from 'vitest';
import type { Failure, Health, SessionResult, Snapshot } from '../utils/api';
import {
  activitiesFor,
  bindActivity,
  call,
  messagesFor,
  PING_URL,
  pair,
  ping,
  readJson,
  snapshot,
  withoutLiveActivities,
} from '../utils/api';

describe('presence', () => {
  it('sends nothing to the phone while the human is at their desk', async () => {
    const { key, buzzkit } = await pair();
    await call(`/${key}/presence`, { method: 'POST' });

    await ping(key, { title: 'Done' });

    expect(await messagesFor(buzzkit.externalId)).toHaveLength(0);
  });

  it('goes back to interrupting once presence is cleared', async () => {
    const { key, buzzkit } = await pair();
    await call(`/${key}/presence`, { method: 'POST' });
    await call(`/${key}/presence`, { method: 'DELETE' });

    await ping(key, { title: 'Done' });

    expect((await messagesFor(buzzkit.externalId))[0]).toMatchObject({ interruptionLevel: 'active' });
  });

  it('refuses a presence window longer than an hour', async () => {
    const { key } = await pair();
    const response = await call(`/${key}/presence`, {
      method: 'POST',
      body: JSON.stringify({ seconds: 99_999 }),
    });

    expect(response.status).toBe(400);
  });
});

describe('activity binding', () => {
  it('binds and unbinds the activity the device reports', async () => {
    const { key } = await pair();
    await ping(key, { session: 'build', title: 'Building' });

    const bound = await call(`/${key}/activity`, {
      method: 'POST',
      body: JSON.stringify({ activityId: 'a-1' }),
    });
    expect((await readJson<Snapshot>(bound)).activityId).toBe('a-1');
    expect((await snapshot(key)).activityId).toBe('a-1');

    await call(`/${key}/activity`, { method: 'DELETE' });
    expect((await snapshot(key)).activityId).toBeNull();
  });

  it('refuses an empty activity id', async () => {
    const { key } = await pair();
    const response = await call(`/${key}/activity`, {
      method: 'POST',
      body: JSON.stringify({ activityId: '' }),
    });

    expect(response.status).toBe(400);
  });

  it('accepts the same activity id twice without complaining', async () => {
    const { key } = await pair();
    await ping(key, { session: 'build', title: 'Building' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await call(`/${key}/activity`, {
        method: 'POST',
        body: JSON.stringify({ activityId: 'a-repeat' }),
      });
      expect(response.status).toBe(200);
    }

    expect((await snapshot(key)).activityId).toBe('a-repeat');
  });

  it('replaces the binding when the device reports a new activity', async () => {
    const { key } = await pair();
    await ping(key, { session: 'build', title: 'Building' });
    await bindActivity(key, 'a-first');
    await bindActivity(key, 'a-second');

    expect((await snapshot(key)).activityId).toBe('a-second');
  });

  it('starts a fresh activity after the device unbinds', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'build', title: 'Building' });
    await bindActivity(key, 'a-gone');
    await call(`/${key}/activity`, { method: 'DELETE' });

    const response = await ping(key, { session: 'build', title: 'Still building' });
    expect((await readJson<SessionResult>(response)).activity).toBe('started');

    const events = (await activitiesFor(buzzkit.externalId)).map((entry) => entry.event);
    expect(events.filter((event) => event === 'start').length).toBeGreaterThanOrEqual(2);
  });

  it('reports the activity as unavailable when the device cannot show one', async () => {
    const { key, buzzkit } = await pair();
    await withoutLiveActivities(buzzkit.externalId);

    const response = await ping(key, { session: 'build', title: 'Building' });
    expect((await readJson<SessionResult>(response)).activity).toBe('unavailable');
    expect((await snapshot(key)).activityId).toBeNull();
  });
});

describe('the agent skill', () => {
  it('serves the generic skill as markdown', async () => {
    const response = await fetch(`${PING_URL}/skill.md`);
    const text = await response.text();

    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(text).toContain('name: buzz');
    expect(text).toContain('YOUR_KEY');
    expect(text).toContain('Report progress with a session');
  });

  it('fills the key in when one is given', async () => {
    const { key } = await pair();
    const text = await (await call(`/${key}/skill.md`)).text();

    expect(text).toContain(key);
    expect(text).not.toContain('YOUR_KEY');
  });

  it('documents every capability an agent needs', async () => {
    const text = await (await fetch(`${PING_URL}/skill.md`)).text();

    for (const capability of ['session', 'presence', 'status', 'waiting']) {
      expect(text).toContain(capability);
    }
  });

  it('refuses a skill for an unknown key', async () => {
    expect((await call('/bz_zzzzzzzzzzzzzzzzzzzzzzzz/skill.md')).status).toBe(404);
  });
});

describe('routing', () => {
  it('reports health', async () => {
    const body = await readJson<Health>(await fetch(`${PING_URL}/health`));

    expect(body).toMatchObject({ ok: true, status: 'healthy' });
  });

  it('redirects the root to the product page', async () => {
    const response = await fetch(`${PING_URL}/`, { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/buzz');
  });

  it('answers an unknown route with the error envelope', async () => {
    const response = await fetch(`${PING_URL}/nope/nope`);

    expect(response.status).toBe(404);
    expect((await readJson<Failure>(response)).error.code).toBe('not_found');
  });

  it('keeps reserved paths from being read as keys', async () => {
    for (const path of ['/health', '/skill.md']) {
      expect((await fetch(`${PING_URL}${path}`)).status).toBe(200);
    }

    const paired = await call('/pair', { method: 'POST' });
    expect(paired.status).toBe(201);
  });
});
