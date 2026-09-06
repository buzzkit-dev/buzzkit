export {
  AuthenticationError,
  BadRequestError,
  BuzzKitError,
  ConfigurationError,
  ConflictError,
  ConnectionError,
  type ErrorBody,
  isBuzzKitError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from '../core/errors';
export type { Channel } from '../resources/common';
export type { Subscriber } from '../resources/subscribers';
export type { Subscription } from '../resources/subscriptions';
export type { ChannelPreference, SubscriberPreference } from '../resources/topics';
export {
  BuzzKitClient,
  type IdentifyParams,
  type PreferenceChanges,
  type SubscribeEmailParams,
} from './buzzkit';
export type {
  BrowserOptions,
  Identity,
} from './options';
