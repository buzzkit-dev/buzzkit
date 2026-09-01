import { SOURCE_PRESETS, type SourceProvider } from '@buzzkit/schema/sources';
import { Badge } from '@buzzkit/ui/components/badge';
import { cn } from '@buzzkit/ui/lib/utils';
import { providerLabel } from '@/app/components/sources/describe';
import { ProviderLogo } from '@/app/components/sources/logo';

type Tone = 'default' | 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'sky' | 'pink';
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
  pending: { label: 'Pending', tone: 'purple' },
  retrying: { label: 'Retrying', tone: 'amber' },
  sent: { label: 'Sent', tone: 'green' },
  delivered: { label: 'Delivered', tone: 'green' },
  bounced: { label: 'Bounced', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' },
  invalid: { label: 'Invalid', tone: 'red' },
};

const MESSAGE_STATUSES: Record<string, Entry> = {
  scheduled: { label: 'Scheduled', tone: 'sky' },
  queued: { label: 'Queued', tone: 'amber' },
  processing: { label: 'Sending', tone: 'purple' },
  completed: { label: 'Completed', tone: 'green' },
  canceled: { label: 'Canceled', tone: 'default' },
};

export function MessageStatusBadge({ status }: { status: string }) {
  const entry = MESSAGE_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

const ATTEMPT_OUTCOMES: Record<string, Entry> = {
  sent: { label: 'Sent', tone: 'green' },
  retry: { label: 'Retry', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  invalid: { label: 'Invalid', tone: 'red' },
};

export function AttemptOutcomeBadge({ outcome }: { outcome: string }) {
  const entry = ATTEMPT_OUTCOMES[outcome];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{outcome}</Badge>;
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  const entry = DELIVERY_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

const SOURCES: Record<string, Entry> = {
  server: { label: 'Server', tone: 'blue' },
  ios: { label: 'iOS', tone: 'sky' },
  android: { label: 'Android', tone: 'purple' },
  web: { label: 'Web', tone: 'amber' },
  system: { label: 'System', tone: 'default' },
  webhook: { label: 'Webhook', tone: 'purple' },
};

const WEBHOOK_STATUSES: Record<string, Entry> = {
  pending: { label: 'Pending', tone: 'purple' },
  success: { label: 'Delivered', tone: 'green' },
  failed: { label: 'Retrying', tone: 'amber' },
  exhausted: { label: 'Failed', tone: 'red' },
};

export function WebhookStatusBadge({ status }: { status: string }) {
  const entry = WEBHOOK_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

export function WebhookAttemptBadge({ status }: { status: number | null }) {
  if (status === null) return <Typed entry={{ label: 'No response', tone: 'red' }} />;
  if (status >= 200 && status < 300) return <Typed entry={{ label: 'Delivered', tone: 'green' }} />;
  return <Typed entry={{ label: 'Failed', tone: 'red' }} />;
}

export function EndpointStatusBadge({ enabled, failing }: { enabled: boolean; failing: boolean }) {
  if (!enabled) return <Typed entry={{ label: 'Disabled', tone: 'default' }} />;
  if (failing) return <Typed entry={{ label: 'Failing', tone: 'red' }} />;
  return <Typed entry={{ label: 'Active', tone: 'green' }} />;
}

const SOURCE_STATUSES: Record<string, Entry> = {
  unverified: { label: 'Unverified', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  paused: { label: 'Paused', tone: 'default' },
};

export function SourceStatusBadge({ status }: { status: string }) {
  const entry = SOURCE_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

const INGEST_OUTCOMES: Record<string, Entry> = {
  event: { label: 'Event', tone: 'green' },
  duplicate: { label: 'Duplicate', tone: 'default' },
  dropped: { label: 'Dropped', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
  unverified: { label: 'Unverified', tone: 'amber' },
};

export function IngestOutcomeBadge({ outcome }: { outcome: string }) {
  const entry = INGEST_OUTCOMES[outcome];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{outcome}</Badge>;
}

export function EventSourceBadge({
  source,
  provider,
  className,
}: {
  source: string;
  provider?: unknown;
  className?: string;
}) {
  if (source !== 'webhook') return <SourceBadge source={source} className={className} />;
  if (typeof provider === 'string' && provider !== 'custom' && SOURCE_PRESETS[provider as SourceProvider]) {
    return (
      <Badge size='sm' className={cn('pl-1.5', className)}>
        <ProviderLogo provider={provider} className='size-3 rounded-[3px]' />
        {providerLabel(provider)}
      </Badge>
    );
  }
  return <Typed entry={{ label: 'Webhook', tone: 'purple' }} />;
}

function SourceBadge({ source, className }: { source: string; className?: string }) {
  const entry = SOURCES[source];
  if (!entry) return <Badge size='sm'>{source}</Badge>;
  return (
    <Badge size='sm' variant={entry.tone} className={className}>
      {entry.label}
    </Badge>
  );
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

const ROLES: Record<'owner' | 'admin' | 'member', Entry> = {
  owner: { label: 'Owner', tone: 'purple' },
  admin: { label: 'Admin', tone: 'blue' },
  member: { label: 'Member', tone: 'default' },
};

export function RoleBadge({ role }: { role: string }) {
  const entry = ROLES[role as keyof typeof ROLES] ?? { label: role, tone: 'default' as const };
  return <Typed entry={entry} />;
}

export function DefaultTenantBadge({ isDefault }: { isDefault: boolean }) {
  return isDefault ? <Typed entry={{ label: 'Default', tone: 'default' }} /> : null;
}

export function OptInBadge({ optedIn }: { optedIn: boolean }) {
  return (
    <Typed entry={optedIn ? { label: 'Opted in', tone: 'green' } : { label: 'Opted out', tone: 'default' }} />
  );
}

const WORKFLOW_STATUSES: Record<string, Entry> = {
  draft: { label: 'Draft', tone: 'default' },
  active: { label: 'Active', tone: 'green' },
  paused: { label: 'Paused', tone: 'amber' },
};

export function WorkflowStatusBadge({ status }: { status: string }) {
  const entry = WORKFLOW_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}

const RUN_STATUSES: Record<string, Entry> = {
  running: { label: 'Running', tone: 'blue' },
  sleeping: { label: 'Sleeping', tone: 'sky' },
  waiting: { label: 'Waiting', tone: 'purple' },
  completed: { label: 'Completed', tone: 'green' },
  canceled: { label: 'Canceled', tone: 'default' },
  failed: { label: 'Failed', tone: 'red' },
};

export function RunStatusBadge({ status }: { status: string }) {
  const entry = RUN_STATUSES[status];
  return entry ? <Typed entry={entry} /> : <Badge size='sm'>{status}</Badge>;
}
