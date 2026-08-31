import { ENDPOINT_HORIZON_CLOCK_SKEW_MS, endpointReceives } from '@buzzkit/api/api/webhooks/endpoints';
import { describe, expect, it } from 'vitest';

function endpoint(createdAt: Date, events: string[] = ['*']) {
  return { createdAt, events } as Parameters<typeof endpointReceives>[0];
}

describe('endpoint horizon', () => {
  const created = new Date('2026-08-31T12:00:00.000Z');

  it('is exact by default: events from before the endpoint never deliver', () => {
    expect(endpointReceives(endpoint(created), 'topic.created', new Date(created.getTime() - 1))).toBe(false);
    expect(endpointReceives(endpoint(created), 'topic.created', created)).toBe(true);
    expect(endpointReceives(endpoint(created), 'topic.created', new Date(created.getTime() + 1))).toBe(true);
  });

  it('tolerates cross-clock skew only when asked, and only within the window', () => {
    const skew = ENDPOINT_HORIZON_CLOCK_SKEW_MS;
    const justBefore = new Date(created.getTime() - skew + 1);
    const beyond = new Date(created.getTime() - skew - 1);
    expect(endpointReceives(endpoint(created), '$app.opened', justBefore, skew)).toBe(true);
    expect(endpointReceives(endpoint(created), '$app.opened', beyond, skew)).toBe(false);
    expect(endpointReceives(endpoint(created), '$app.opened', justBefore)).toBe(false);
  });

  it('still honors the subscription filter under skew', () => {
    expect(
      endpointReceives(
        endpoint(created, ['$subscription.*']),
        '$app.opened',
        created,
        ENDPOINT_HORIZON_CLOCK_SKEW_MS
      )
    ).toBe(false);
  });
});
