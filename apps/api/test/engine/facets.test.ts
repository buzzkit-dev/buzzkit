import { applySubscriberFacets } from '@buzzkit/api/engine/facets';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn() }));
vi.mock('@buzzkit/api/api/topics/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listPreferences: vi.fn(),
}));

import { listPreferences } from '@buzzkit/api/api/topics/index';
import { stepDb } from '@buzzkit/api/libs/database';

const needingSpec: WorkflowSpec = {
  trigger: { event: 'signup' },
  steps: [
    {
      name: 'route',
      branch: [{ name: 'push', when: { ref: 'subscriber.channels.push', eq: true }, steps: [] }],
    },
  ],
};

beforeEach(() => {
  vi.mocked(stepDb).mockReset();
  vi.mocked(listPreferences).mockReset();
});

describe('applySubscriberFacets', () => {
  it('does nothing when the spec never reads channels or topics', async () => {
    const { context } = createHarness({ trigger: { event: 'signup' }, steps: [] });

    await applySubscriberFacets(context);

    expect(stepDb).not.toHaveBeenCalled();
  });

  it('loads connected channels and opted-in topics into the scope', async () => {
    const rows = [{ channel: 'push' }];
    vi.mocked(stepDb).mockReturnValue({
      selectDistinct: () => ({ from: () => ({ where: async () => rows }) }),
    } as never);
    vi.mocked(listPreferences).mockResolvedValue([
      { slug: 'promos', channels: { push: { optedIn: true } } },
      { slug: 'digest', channels: { push: { optedIn: false } } },
    ] as never);
    const { context } = createHarness(needingSpec);

    await applySubscriberFacets(context);

    const subscriber = context.scope().subscriber as { channels: unknown; topics: unknown };
    expect(subscriber.channels).toEqual({ push: true });
    expect(subscriber.topics).toEqual({ promos: true, digest: false });
  });

  it('applies empty facets for a run without a subscriber', async () => {
    const { context } = createHarness(needingSpec, { subscriberId: 0 });

    await applySubscriberFacets(context);

    expect(stepDb).not.toHaveBeenCalled();
    expect((context.scope().subscriber as { channels: unknown }).channels).toEqual({});
  });
});
