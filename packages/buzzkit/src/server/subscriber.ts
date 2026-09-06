import { BuzzKitError } from '../core/errors';
import type { PageParams, PagePromise } from '../core/pagination';
import type { Deleted } from '../resources/common';
import type { EventRecord, EventsResource, TrackedEvent } from '../resources/events';
import type { Message, MessagesResource, SendMessageParams } from '../resources/messages';
import type { Run } from '../resources/runs';
import type {
  PreferenceChanges,
  Subscriber,
  SubscriberDelivery,
  SubscribersResource,
  SubscriberTimelineParams,
  SubscriberWithSubscriptions,
  UpsertSubscriberParams,
} from '../resources/subscribers';
import type {
  CreateSubscriptionParams,
  Subscription,
  SubscriptionsResource,
} from '../resources/subscriptions';
import type { SubscriberPreference } from '../resources/topics';

export type SubscriberSend = Omit<SendMessageParams, 'to' | 'segment' | 'where'>;

export type SubscriberSubscribe = Omit<CreateSubscriptionParams, 'externalId'>;

type Resources = {
  subscribers: SubscribersResource;
  subscriptions: SubscriptionsResource;
  messages: MessagesResource;
  events: EventsResource;
};

export class SubscriberScope<TData extends Subscriber | null = Subscriber | null> {
  readonly externalId: string;
  readonly data: TData;

  private readonly resources: Resources;

  constructor(resources: Resources, externalId: string, data: TData) {
    this.resources = resources;
    this.externalId = externalId;
    this.data = data;
  }

  async identify(params: UpsertSubscriberParams = {}): Promise<SubscriberScope<Subscriber>> {
    const subscriber = await this.resources.subscribers.upsert(this.externalId, params);
    return new SubscriberScope(this.resources, this.externalId, subscriber);
  }

  retrieve(): Promise<SubscriberWithSubscriptions> {
    return this.resources.subscribers.retrieve(this.externalId);
  }

  remove(): Promise<Deleted<Subscriber>> {
    return this.resources.subscribers.remove(this.externalId);
  }

  send(params: SubscriberSend): Promise<Message> {
    return this.resources.messages.send({ ...params, to: this.externalId });
  }

  async track(name: string, data?: Record<string, unknown>): Promise<TrackedEvent> {
    const page = await this.resources.events.track({ externalId: this.externalId, name, data });

    const [tracked] = page.items;
    if (!tracked) {
      throw new BuzzKitError(`The BuzzKit API accepted no event for '${name}'`, {
        status: null,
        code: 'event_not_tracked',
      });
    }

    return tracked;
  }

  subscribe(params: SubscriberSubscribe): Promise<Subscription> {
    return this.resources.subscriptions.create({ ...params, externalId: this.externalId });
  }

  subscriptions(): PagePromise<Subscription> {
    return this.resources.subscribers.subscriptions(this.externalId);
  }

  preferences(): PagePromise<SubscriberPreference> {
    return this.resources.subscribers.preferences(this.externalId);
  }

  updatePreferences(changes: PreferenceChanges): PagePromise<SubscriberPreference> {
    return this.resources.subscribers.updatePreferences(this.externalId, changes);
  }

  deliveries(params: PageParams = {}): PagePromise<SubscriberDelivery> {
    return this.resources.subscribers.deliveries(this.externalId, params);
  }

  timeline(params: SubscriberTimelineParams = {}): PagePromise<EventRecord> {
    return this.resources.subscribers.timeline(this.externalId, params);
  }

  runs(): PagePromise<Run> {
    return this.resources.subscribers.runs(this.externalId);
  }
}
