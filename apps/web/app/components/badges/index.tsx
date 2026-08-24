import { Badge } from '@buzzkit/ui/components/badge';

type Tone = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'sky' | 'pink';
type Entry = { label: string; tone: Tone };

const KEY_KINDS: Record<'workspace' | 'tenant' | 'client', Entry> = {
  workspace: { label: 'Workspace', tone: 'blue' },
  tenant: { label: 'Tenant', tone: 'purple' },
  client: { label: 'Client', tone: 'green' },
};

const PLATFORMS: Record<'ios' | 'android', Entry> = {
  ios: { label: 'iOS', tone: 'blue' },
  android: { label: 'Android', tone: 'purple' },
};

const CHANNELS: Record<'push' | 'email' | 'sms', Entry> = {
  push: { label: 'Push', tone: 'sky' },
  email: { label: 'Email', tone: 'amber' },
  sms: { label: 'SMS', tone: 'pink' },
};

const CREDENTIAL_STATUSES: Record<'active' | 'unvalidated' | 'invalid', Entry> = {
  active: { label: 'Active', tone: 'green' },
  unvalidated: { label: 'Unverified', tone: 'amber' },
  invalid: { label: 'Invalid', tone: 'red' },
};

function Typed({ entry }: { entry: Entry }) {
  return (
    <Badge size='sm' variant={entry.tone}>
      {entry.label}
    </Badge>
  );
}

export function KeyKindBadge({ kind }: { kind: keyof typeof KEY_KINDS }) {
  return <Typed entry={KEY_KINDS[kind]} />;
}

export function PlatformBadge({ platform }: { platform: keyof typeof PLATFORMS }) {
  return <Typed entry={PLATFORMS[platform]} />;
}

export function ChannelBadge({ channel }: { channel: string }) {
  const entry = CHANNELS[channel as keyof typeof CHANNELS];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{channel}</Badge>;
}

export function CredentialStatusBadge({ status }: { status: keyof typeof CREDENTIAL_STATUSES }) {
  return <Typed entry={CREDENTIAL_STATUSES[status]} />;
}

const DELIVERY_STATUSES: Record<string, Entry> = {
  pending: { label: 'Pending', tone: 'amber' },
  retrying: { label: 'Retrying', tone: 'amber' },
  sent: { label: 'Sent', tone: 'green' },
  delivered: { label: 'Delivered', tone: 'green' },
  bounced: { label: 'Bounced', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' },
  invalid: { label: 'Invalid', tone: 'red' },
};

export function DeliveryStatusBadge({ status }: { status: string }) {
  const entry = DELIVERY_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? <Typed entry={{ label: 'Verified', tone: 'green' }} /> : null;
}

export function RevokedBadge({ revoked }: { revoked: boolean }) {
  return revoked ? <Typed entry={{ label: 'Revoked', tone: 'red' }} /> : null;
}

export function SandboxBadge({ environment }: { environment: string }) {
  return environment === 'sandbox' ? <Typed entry={{ label: 'Sandbox', tone: 'amber' }} /> : null;
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return status === 'invalid' ? <Typed entry={{ label: 'Invalid', tone: 'red' }} /> : null;
}
