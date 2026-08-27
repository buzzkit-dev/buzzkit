import type { ActorEventInput, ActorIngestInput, ActorIngestOutcome } from '@buzzkit/api/actor/types';
import { recordRegistration } from '@buzzkit/api/api/subscribers/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/actor', () => ({ subscriberActor: vi.fn() }));
vi.mock('@buzzkit/api/libs/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@buzzkit/api/libs/telemetry')>()),
  currentTraceparent: () => undefined,
}));

const ingest = vi.fn(
  async (input: ActorIngestInput): Promise<ActorIngestOutcome[]> =>
    input.events.map((event, index) => ({ id: event.id, sequence: index + 1, status: 'accepted' as const }))
);
const ingestedEvents = (call = 0): ActorEventInput[] => ingest.mock.calls[call]![0].events;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(subscriberActor).mockImplementation(() => ({ ingest }) as never);
});

describe('recordRegistration', () => {
  const subscription = { id: 1, channel: 'push', platform: 'ios', endpoint: 'tok' } as never;
  const subscriber = { id: 9, externalId: 'user_new', attributes: { plan: 'pro' } } as never;
  const registration = (overrides: Record<string, unknown>) =>
    ({
      subscription,
      subscriber,
      subscriptionCreated: false,
      subscriptionRegistered: false,
      subscriberCreated: false,
      movedFrom: null,
      ...overrides,
    }) as never;

  it('records nothing for a refresh that created and registered nothing', async () => {
    await recordRegistration(3, registration({}));
    expect(subscriberActor).not.toHaveBeenCalled();
  });

  it('records the creation before the registration on the new subscriber', async () => {
    await recordRegistration(3, registration({ subscriberCreated: true, subscriptionRegistered: true }));
    expect(subscriberActor).toHaveBeenCalledTimes(1);
    expect(subscriberActor).toHaveBeenCalledWith(3, 9);
    expect(ingestedEvents().map((event) => event.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
    ]);
    expect(ingestedEvents()[0]!.data).toEqual({ externalId: 'user_new', attributes: { plan: 'pro' } });
    expect(ingestedEvents()[1]!.data).toEqual({
      externalId: 'user_new',
      channel: 'push',
      platform: 'ios',
      endpoint: 'tok',
    });
  });

  it("keeps the caller's preceding events between the creation and the registration", async () => {
    await recordRegistration(3, registration({ subscriberCreated: true, subscriptionRegistered: true }), [
      { name: 'identify', data: { attributes: {} } },
    ]);
    expect(ingestedEvents().map((event) => event.name)).toEqual([
      '$subscriber.created',
      '$identify',
      '$subscription.registered',
    ]);
  });

  it('records a removal on the previous owner, described as that owner held it', async () => {
    const previous = { id: 1, channel: 'push', platform: 'android', endpoint: 'tok' } as never;
    await recordRegistration(
      3,
      registration({
        subscriptionRegistered: true,
        movedFrom: {
          subscriber: { id: 12, externalId: 'user_old', attributes: null } as never,
          subscription: previous,
        },
      })
    );
    expect(subscriberActor).toHaveBeenNthCalledWith(1, 3, 9);
    expect(subscriberActor).toHaveBeenNthCalledWith(2, 3, 12);
    const removal = (
      ingest.mock.calls[1]![0] as { events: { name: string; source: string; data: unknown }[] }
    ).events;
    expect(removal).toEqual([
      expect.objectContaining({
        name: '$subscription.removed',
        source: 'system',
        data: { externalId: 'user_old', channel: 'push', platform: 'android', endpoint: 'tok' },
      }),
    ]);
  });
});
