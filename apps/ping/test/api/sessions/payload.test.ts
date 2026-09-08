import { ACTIVITY_BODY_LIMIT, ACTIVITY_TITLE_LIMIT, deriveActivity } from '@buzzkit/ping/api/sessions/index';
import { describe, expect, it } from 'vitest';
import { NOW, session } from '../../utils/session';

const APNS_PAYLOAD_LIMIT = 4_096;

function crowded() {
  return Array.from({ length: 12 }, (_, index) =>
    session({
      id: `session-${index}`.padEnd(64, 'x'),
      title: 'T'.repeat(200),
      body: 'B'.repeat(2_000),
      agent: 'A'.repeat(60),
      project: 'P'.repeat(80),
      url: `https://example.com/${'u'.repeat(400)}`,
      status: 'waiting',
    })
  );
}

describe('the activity payload', () => {
  it('stays inside the APNs limit at the worst case the schemas allow', () => {
    const state = deriveActivity(crowded(), NOW);
    const encoded = new TextEncoder().encode(JSON.stringify(state)).length;

    expect(encoded).toBeLessThan(APNS_PAYLOAD_LIMIT);
  });

  it('clips the fields a Lock Screen cannot show anyway', () => {
    const state = deriveActivity(crowded(), NOW);
    const [first] = state.sessions;

    expect(first.title.length).toBeLessThanOrEqual(ACTIVITY_TITLE_LIMIT);
    expect(first.body?.length).toBeLessThanOrEqual(ACTIVITY_BODY_LIMIT);
    expect(state.headline.length).toBeLessThanOrEqual(ACTIVITY_TITLE_LIMIT);
  });

  it('marks a clipped value so it does not read as the whole string', () => {
    const state = deriveActivity([session({ title: 'T'.repeat(200) })], NOW);

    expect(state.sessions[0].title.endsWith('…')).toBe(true);
  });

  it('leaves a short value untouched', () => {
    const state = deriveActivity([session({ title: 'Running migrations', body: '3 of 7' })], NOW);

    expect(state.sessions[0].title).toBe('Running migrations');
    expect(state.sessions[0].body).toBe('3 of 7');
  });
});
