import { env } from 'cloudflare:workers';
import Sqids from 'sqids';

export const s = new Sqids({
  minLength: 18,
  alphabet: env.SQIDS_ALPHABET,
});

/**
 * Subscriber IDs only: extra-long so the highest-volume, most exposed IDs are
 * not practically enumerable. Everything else uses the 18-char default.
 */
export const subscriberSqids = new Sqids({
  minLength: 32,
  alphabet: env.SQIDS_ALPHABET,
});

/**
 * Stripe-style ID prefixes — one per table/object. The prefixed form is the
 * canonical OUTPUT everywhere (payloads, responses, URLs we emit); INPUT
 * accepts both prefixed and bare forms.
 */
export const ID_PREFIXES = {
  workspace: 'ws',
  member: 'mem',
  tenant: 'tnt',
  key: 'key',
  credential: 'crd',
  subscriber: 'sub',
  device: 'dev',
  message: 'msg',
  delivery: 'dlv',
  event: 'evt',
  segment: 'seg',
  campaign: 'cmp',
  workflow: 'wf',
  run: 'run',
  invite: 'inv',
} as const;

export type IdEntity = keyof typeof ID_PREFIXES;

export function encodeId(entity: IdEntity, id: number): string {
  const encoded = entity === 'subscriber' ? subscriberSqids.encode([id]) : s.encode([id]);
  return `${ID_PREFIXES[entity]}_${encoded}`;
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

    // Check if number exceeds safe integer range (would cause encode to throw)
    if (num === undefined || num > Number.MAX_SAFE_INTEGER) {
      return undefined;
    }

    // Verify the sqid is canonical (re-encoding produces same result)
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

export const encodeSubscriberSqid = (id: number): string => encodeId('subscriber', id);
export const decodeSubscriberSqid = createDecoder(subscriberSqids);

/**
 * Entity-aware decode: bare ids are accepted, correctly-prefixed ids are
 * accepted, and a KNOWN-but-wrong prefix is rejected — `dev_x` can never
 * resolve at a messages endpoint even though all ids share one number
 * space. Unknown underscore-y garbage falls through to canonical rejection.
 */
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
