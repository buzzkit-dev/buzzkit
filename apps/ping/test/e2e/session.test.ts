import { describe, expect, it } from 'vitest';
import type { SessionResult } from '../utils/api';
import {
  activitiesFor,
  bindActivity,
  call,
  messagesFor,
  pair,
  ping,
  readJson,
  snapshot,
  withoutLiveActivities,
} from '../utils/api';

describe('sessions', () => {
  it('starts a Live Activity on the first session ping', async () => {
    const { key, buzzkit } = await pair();
    const response = await ping(key, { session: 'build', title: 'Building', progress: 0.1 });
    const body = await readJson<SessionResult>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ kind: 'session', session: 'build', status: 'working', activity: 'started' });

    const [activity] = await activitiesFor(buzzkit.externalId);
    expect(activity).toMatchObject({ event: 'start', attributesType: 'BuzzActivityAttributes' });
    expect(activity.contentState).toMatchObject({ headline: 'Building', live: 1, version: 1 });
    expect(body.notice).toBeUndefined();
  });

  it('returns a notice when the session text is too long for a Live Activity', async () => {
    const { key } = await pair();
    const body = await readJson<SessionResult>(await ping(key, { session: 'chatty', title: 'T'.repeat(80) }));

    expect(body.notice).toContain('Lock Screen');
    expect(body.notice).toContain('title');
  });

  it('does not also send a banner while the activity is carrying it', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'build', title: 'Building' });

    expect(await messagesFor(buzzkit.externalId)).toHaveLength(0);
  });

  it('carries a custom avatar url into the activity and the push', async () => {
    const { key, buzzkit } = await pair();
    const avatar = 'https://example.com/nightly-bot.png';

    await withoutLiveActivities(buzzkit.externalId);
    await ping(key, { session: 'nightly', title: 'Nightly run', agent: 'nightly-bot', avatar });

    const state = await snapshot(key);
    const nightly = state.activity.sessions.find((entry) => entry.id === 'nightly');
    expect(nightly?.avatar).toBe(avatar);

    const messages = await messagesFor(buzzkit.externalId);
    expect(messages.some((message) => (message.data as Record<string, unknown>)?.avatar === avatar)).toBe(
      true
    );
  });

  it('merges several sessions into one activity', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'a', title: 'First', project: 'alpha' });
    await ping(key, { session: 'b', title: 'Second', project: 'beta' });
    await ping(key, { session: 'c', title: 'Third', project: 'gamma' });

    const state = await snapshot(key);
    expect(state.activity).toMatchObject({ headline: '3 agents working', live: 3 });
    expect(state.activity.sessions).toHaveLength(3);

    expect(await activitiesFor(buzzkit.externalId)).toHaveLength(1);
  });

  it('coalesces the pings that land inside the push interval', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'build', title: 'One' });
    const second = await ping(key, { session: 'build', title: 'Two' });

    expect((await readJson<SessionResult>(second)).activity).toBe('coalesced');
    expect(await activitiesFor(buzzkit.externalId)).toHaveLength(1);
  });

  it('floats a waiting session above working ones', async () => {
    const { key } = await pair();
    await ping(key, { session: 'work', title: 'Working' });
    await ping(key, { session: 'blocked', title: 'Approve the migration?', status: 'waiting' });

    const state = await snapshot(key);

    expect(state.activity.headline).toBe('Waiting on you');
    expect(state.activity.sessions[0]?.id).toBe('blocked');
  });

  it('updates in place once the device reports its activity id', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'build', title: 'Building' });
    await bindActivity(key, 'activity-1');

    await ping(key, { session: 'build', title: 'Still building', status: 'working' });

    const activities = await activitiesFor(buzzkit.externalId);
    const updates = activities.filter((entry) => entry.event === 'update');

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)).toMatchObject({ activityId: 'activity-1' });
  });

  it('ends the activity when the last session finishes', async () => {
    const { key, buzzkit } = await pair();
    await ping(key, { session: 'build', title: 'Building' });
    await bindActivity(key, 'activity-2');
    await ping(key, { session: 'build', title: 'Built', status: 'done' });

    await call(`/${key}`, { method: 'DELETE' });

    const events = (await activitiesFor(buzzkit.externalId)).map((entry) => entry.event);
    expect(events).toContain('end');
  });

  it('falls back to a collapsing banner when the device has no Live Activities', async () => {
    const { key, buzzkit } = await pair();
    await withoutLiveActivities(buzzkit.externalId);

    const response = await ping(key, { session: 'build', title: 'Building', status: 'working' });
    expect((await readJson<SessionResult>(response)).activity).toBe('unavailable');

    const [message] = await messagesFor(buzzkit.externalId);
    expect(message).toMatchObject({
      title: 'Building',
      collapseId: 'build',
      threadId: 'build',
    });
  });

  it('collapses repeated progress onto one banner id and keeps it passive', async () => {
    const { key, buzzkit } = await pair();
    await withoutLiveActivities(buzzkit.externalId);

    await ping(key, { session: 'build', title: 'Step 1' });
    await ping(key, { session: 'build', title: 'Step 2' });
    await ping(key, { session: 'build', title: 'Step 3' });

    const messages = await messagesFor(buzzkit.externalId);
    expect(messages).toHaveLength(3);
    expect(new Set(messages.map((message) => message.collapseId))).toEqual(new Set(['build']));
    expect(messages.slice(1).map((message) => message.interruptionLevel)).toEqual(['passive', 'passive']);
  });

  it('breaks through when the session finishes', async () => {
    const { key, buzzkit } = await pair();
    await withoutLiveActivities(buzzkit.externalId);

    await ping(key, { session: 'build', title: 'Working' });
    await ping(key, { session: 'build', title: 'Done', status: 'done' });

    const messages = await messagesFor(buzzkit.externalId);
    expect(messages.at(-1)).toMatchObject({ interruptionLevel: 'active', title: 'Done' });
  });

  it('reports the merged state through the snapshot', async () => {
    const { key } = await pair();
    await ping(key, { session: 'one', title: 'One' });
    await ping(key, { session: 'two', title: 'Two' });

    const state = await snapshot(key);

    expect(state.activity).toMatchObject({ live: 2, headline: '2 agents working' });
    expect(state.externalId).toMatch(/^buzz_/);
  });

  it('clears every session on reset', async () => {
    const { key } = await pair();
    await ping(key, { session: 'one', title: 'One' });

    expect((await call(`/${key}`, { method: 'DELETE' })).status).toBe(200);

    const state = await snapshot(key);
    expect(state.activity.live).toBe(0);
    expect(state.activity.headline).toBe('All clear');
  });
});
