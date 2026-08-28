import { env } from 'cloudflare:workers';
import Sqids from 'sqids';

export const s = new Sqids({
  minLength: 18,
  alphabet: env.SQIDS_ALPHABET,
});

export const subscriberSqids = new Sqids({
  minLength: 32,
  alphabet: env.SQIDS_ALPHABET,
});

export const ID_PREFIXES = {
  workspace: 'ws',
  member: 'mem',
  tenant: 'tnt',
  key: 'key',
  credential: 'crd',
  subscriber: 'sub',
  subscription: 'sbn',
  topic: 'tpc',
  message: 'msg',
  delivery: 'dlv',
  audit: 'aud',
  segment: 'seg',
  segmentVersion: 'sgv',
  campaign: 'cmp',
  workflow: 'wf',
  run: 'run',
  invite: 'inv',
  webhook: 'whk',
  webhookEvent: 'whe',
  webhookDelivery: 'whd',
  webhookAttempt: 'wha',
} as const;

export type IdEntity = keyof typeof ID_PREFIXES;

export const TARGET_ENTITIES: Record<string, IdEntity> = {
  workspace: 'workspace',
  member: 'member',
  tenant: 'tenant',
  key: 'key',
  credential: 'credential',
  invite: 'invite',
  subscriber: 'subscriber',
  subscription: 'subscription',
  topic: 'topic',
  message: 'message',
  audit: 'audit',
  webhook: 'webhook',
  segment: 'segment',
};

export function encodeBareId(entity: IdEntity | undefined, id: number): string {
  return entity === 'subscriber' ? subscriberSqids.encode([id]) : s.encode([id]);
}

export function encodeId(entity: IdEntity, id: number): string {
  return `${ID_PREFIXES[entity]}_${encodeBareId(entity, id)}`;
}

function stripPrefix(id: string): string {
  const underscore = id.indexOf('_');
  if (underscore === -1) return id;

  const prefix = id.slice(0, underscore);
  if ((Object.values(ID_PREFIXES) as string[]).includes(prefix)) {
    return id.slice(underscore + 1);
  }
  return id;
}

function createDecoder(sqids: Sqids) {
  return (id: string): number | undefined => {
    const bare = stripPrefix(id);
    const decoded = sqids.decode(bare);

    if (decoded?.length !== 1) {
      return undefined;
    }

    const num = decoded[0];

    if (num === undefined || num > Number.MAX_SAFE_INTEGER) {
      return undefined;
    }

    try {
      if (sqids.encode(decoded) !== bare) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    return num;
  };
}

export const decodeSqid = createDecoder(s);

export const decodeSubscriberSqid = createDecoder(subscriberSqids);

export function decodeEntityId(entity: IdEntity, id: string): number | undefined {
  const underscore = id.indexOf('_');
  if (underscore !== -1) {
    const prefix = id.slice(0, underscore);
    if ((Object.values(ID_PREFIXES) as string[]).includes(prefix) && prefix !== ID_PREFIXES[entity]) {
      return undefined;
    }
  }
  return entity === 'subscriber' ? decodeSubscriberSqid(id) : decodeSqid(id);
}
