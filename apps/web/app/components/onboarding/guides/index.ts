import type { ProviderId } from '@/app/components/onboarding/catalog';
import { apnsGuide } from '@/app/components/onboarding/guides/apns';
import { fcmGuide } from '@/app/components/onboarding/guides/fcm';
import { resendGuide } from '@/app/components/onboarding/guides/resend';
import type { GuideDefinition } from '@/app/components/onboarding/guides/types';

export const GUIDES: Record<ProviderId, GuideDefinition> = {
  apns: apnsGuide,
  fcm: fcmGuide,
  resend: resendGuide,
};

export type { GuideDefinition, GuideField, GuideStepDefinition } from './types';
