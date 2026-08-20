import type { subscriptionPlatform } from '@buzzkit/database';
import { apnsProvider } from './apns/index';
import { fcmProvider } from './fcm/index';
import { resendProvider } from './resend/index';
import type { ProviderDefinition, ProviderName } from './types';

export type {
  DeliveryErrorCode,
  MessagePayload,
  ProviderChannel,
  ProviderDefinition,
  ProviderEnvironment,
  ProviderName,
  ProviderResponse,
  ProviderSendInput,
  ProviderSendResult,
  ProviderValidationInput,
  ProviderValidationResult,
} from './types';

export const PROVIDERS: Record<ProviderName, ProviderDefinition> = {
  apns: apnsProvider,
  fcm: fcmProvider,
  resend: resendProvider,
};

export const PUSH_PROVIDER_BY_PLATFORM: Record<
  (typeof subscriptionPlatform.enumValues)[number],
  ProviderName
> = {
  ios: 'apns',
  android: 'fcm',
};
