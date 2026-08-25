export type Channel = 'push' | 'email';

export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: 'push', label: 'Push' },
  { value: 'email', label: 'Email' },
];

export function channelLabel(channel: string): string {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

/**
 * The channels a tenant can actually use: the ones it holds a credential for,
 * in catalog order. Every channel picker, filter and column in the dashboard
 * derives from this list, so nothing offers push to a workspace that never
 * connected a push provider.
 */
export function connectedChannels(credentials: { channel: string }[]): Channel[] {
  return CHANNEL_OPTIONS.map((option) => option.value).filter((channel) =>
    credentials.some((credential) => credential.channel === channel)
  );
}
