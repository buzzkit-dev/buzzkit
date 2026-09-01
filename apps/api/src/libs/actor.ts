import { env } from 'cloudflare:workers';
import type { SubscriberActor } from '@buzzkit/api/actor/subscriber';
import { getAgentByName } from 'agents';

export function subscriberActorName(tenantId: number, subscriberId: number): string {
  return `${tenantId}:${subscriberId}`;
}

export function subscriberActor(tenantId: number, subscriberId: number) {
  return getAgentByName<Env, SubscriberActor>(
    env.SUBSCRIBER_ACTOR,
    subscriberActorName(tenantId, subscriberId)
  );
}
