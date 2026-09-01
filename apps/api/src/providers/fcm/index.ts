import type { ProviderDefinition } from '../types';
import { send } from './send';
import { validate } from './validate';

export { type FcmServiceAccount, parseServiceAccount } from './account';
export { classify } from './classify';
export { buildFcmMessage } from './payload';

export const fcmProvider: ProviderDefinition = {
  name: 'fcm',
  channel: 'push',
  displayName: 'Firebase',
  validate,
  send,
};
