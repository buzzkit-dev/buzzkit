import { ConfigurationError } from '../core/errors';
import type { Page } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Attributes, Deleted } from '../resources/common';
import type { TrackedEvent } from '../resources/events';
import type { Subscriber } from '../resources/subscribers';
import type { Subscription } from '../resources/subscriptions';
import type { SubscriberPreference } from '../resources/topics';
import type { BrowserOptions, Identity, ResolvedBrowserOptions } from './options';
import { browserTransport, resolveBrowserOptions } from './options';

export type IdentifyParams = {
  attributes?: Attributes;
  email?: string;
  subscribe?: { email?: boolean };
  anonymousId?: string;
};

export type PreferenceChanges = Record<string, boolean | Partial<Record<'push' | 'email', boolean>>>;

export type SubscribeEmailParams = {
  address: string;
};

export class BuzzKitClient {
  private readonly options: ResolvedBrowserOptions;
  private readonly transport: Transport;

  constructor(options: BrowserOptions) {
    this.options = resolveBrowserOptions(options);
    this.transport = browserTransport(this.options);
  }

  get identity(): Identity | null {
    return this.options.identity;
  }

  as(identity: Identity): BuzzKitClient {
    return new BuzzKitClient({ ...this.options, identity });
  }

  async identify(params: IdentifyParams = {}): Promise<Subscriber> {
    const identity = this.requireIdentity();

    return await this.transport.request({
      method: 'POST',
      path: '/v1/client/identify',
      body: { ...params, externalId: identity.externalId, identityHash: identity.identityHash },
    });
  }

  async track(name: string, data?: Record<string, unknown>): Promise<TrackedEvent> {
    const identity = this.requireIdentity();

    const page = await this.transport.request<Page<TrackedEvent>>({
      method: 'POST',
      path: '/v1/client/events',
      body: {
        externalId: identity.externalId,
        identityHash: identity.identityHash,
        source: 'web',
        events: [{ name, data }],
      },
    });

    const [tracked] = page.items;
    if (!tracked) {
      throw new ConfigurationError(`The BuzzKit API accepted no event for '${name}'`);
    }

    return tracked;
  }

  async preferences(): Promise<SubscriberPreference[]> {
    this.requireIdentity();

    const page = await this.transport.request<Page<SubscriberPreference>>({
      method: 'GET',
      path: '/v1/client/preferences',
    });

    return page.items;
  }

  async updatePreferences(preferences: PreferenceChanges): Promise<SubscriberPreference[]> {
    this.requireIdentity();

    const page = await this.transport.request<Page<SubscriberPreference>>({
      method: 'PATCH',
      path: '/v1/client/preferences',
      body: { preferences },
    });

    return page.items;
  }

  async subscribeEmail(params: SubscribeEmailParams): Promise<Subscription> {
    const identity = this.requireIdentity();

    return await this.transport.request({
      method: 'POST',
      path: '/v1/client/subscriptions',
      body: {
        externalId: identity.externalId,
        identityHash: identity.identityHash,
        channel: 'email',
        address: params.address,
      },
    });
  }

  async updateSubscription(id: string, enabled: boolean): Promise<Subscription> {
    this.requireIdentity();

    return await this.transport.request({
      method: 'PATCH',
      path: `/v1/client/subscriptions/${encodeSegment(id)}`,
      body: { enabled },
    });
  }

  async removeSubscription(id: string): Promise<Deleted<Subscription>> {
    this.requireIdentity();

    return await this.transport.request({
      method: 'DELETE',
      path: `/v1/client/subscriptions/${encodeSegment(id)}`,
    });
  }

  private requireIdentity(): Identity {
    const { identity } = this.options;
    if (!identity) {
      throw new ConfigurationError(
        'No subscriber identity — pass { identity } to the BuzzKit client, or call client.as({ externalId })'
      );
    }

    return identity;
  }
}
