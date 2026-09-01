import type { ProviderDefinition } from '../types';
import { send } from './send';
import { validate } from './validate';

export { classify } from './classify';
export {
  buildApnsPayload,
  buildLiveActivityPayload,
  isSilentPayload,
  resolveCategoryId,
  resolveEnvelope,
  resolvePushType,
} from './payload';
export { createApnsJwt } from './tokens';

export const apnsProvider: ProviderDefinition = {
  name: 'apns',
  channel: 'push',
  displayName: 'APNs',
  validate,
  send,
};
