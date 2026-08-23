import type { IconName } from '@buzzkit/ui/components/icon';
import { data } from 'react-router';

export type ChannelId = 'push' | 'email' | 'sms' | 'web-push';
export type ProviderId = 'apns' | 'fcm' | 'resend';
export type UpcomingProviderId = 'postmark' | 'sendgrid';

export type ProviderEntry = {
  id: ProviderId | UpcomingProviderId;
  name: string;
  description: string;
  badges: string[];
  icon: IconName;
  available: boolean;
};

export type AvailableProvider = ProviderEntry & { id: ProviderId; available: true };

export type ChannelEntry = {
  id: ChannelId;
  name: string;
  noun: string;
  description: string;
  icon: IconName;
  available: boolean;
  providers: ProviderEntry[];
};

export const CHANNELS: ChannelEntry[] = [
  {
    id: 'push',
    name: 'Push notifications',
    noun: 'push',
    description: 'Reach iOS and Android through Apple and Google.',
    icon: 'IconBellFilled',
    available: true,
    providers: [
      {
        id: 'apns',
        name: 'Apple',
        description: 'APNs for iPhone, iPad, Mac and Watch, with a .p8 key.',
        badges: [],
        icon: 'IconAppleFilled',
        available: true,
      },
      {
        id: 'fcm',
        name: 'Firebase Cloud Messaging',
        description: 'FCM for Android, with a Firebase service account.',
        badges: [],
        icon: 'IconGooglePlayStoreFilled',
        available: false,
      },
    ],
  },
  {
    id: 'email',
    name: 'Email',
    noun: 'email',
    description: 'Transactional email through your own sending provider.',
    icon: 'IconEmail2Filled',
    available: true,
    providers: [
      {
        id: 'resend',
        name: 'Resend',
        description: 'An API key with sending access.',
        badges: [],
        icon: 'IconResend',
        available: true,
      },
      {
        id: 'postmark',
        name: 'Postmark',
        description: 'A server token from your Postmark account.',
        badges: [],
        icon: 'IconEmail2Filled',
        available: false,
      },
      {
        id: 'sendgrid',
        name: 'SendGrid',
        description: 'An API key from your SendGrid account.',
        badges: [],
        icon: 'IconEmail2Filled',
        available: false,
      },
    ],
  },
  {
    id: 'sms',
    name: 'SMS',
    noun: 'SMS',
    description: 'Text messages through Twilio or Vonage.',
    icon: 'IconBubbleTextFilled',
    available: false,
    providers: [],
  },
  {
    id: 'web-push',
    name: 'Web push',
    noun: 'web push',
    description: 'Browser notifications for your web app.',
    icon: 'IconGlobeFilled',
    available: false,
    providers: [],
  },
];

export function findChannel(id: string): ChannelEntry | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}

export function findProvider(channelId: string, providerId: string): AvailableProvider | undefined {
  const provider = findChannel(channelId)?.providers.find((entry) => entry.id === providerId);
  return provider?.available ? (provider as AvailableProvider) : undefined;
}

export function channelOfProvider(providerId: string): ChannelEntry | undefined {
  return CHANNELS.find((channel) => channel.providers.some((provider) => provider.id === providerId));
}

export function resolveOnboardingPath(splat: string | undefined) {
  const [channelId, providerId] = (splat ?? '').split('/').filter(Boolean);
  const channel = channelId ? findChannel(channelId) : null;
  if (channelId && !channel?.available) throw data(null, { status: 404 });
  const provider = providerId && channelId ? findProvider(channelId, providerId) : null;
  if (providerId && !provider) throw data(null, { status: 404 });
  return { channel, provider };
}
