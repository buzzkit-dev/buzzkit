import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@buzzkit/ui/components/alert-dialog';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem } from '@buzzkit/ui/components/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Input } from '@buzzkit/ui/components/input';
import { toast } from '@buzzkit/ui/components/sonner';
import { Switch } from '@buzzkit/ui/components/switch';
import { useState } from 'react';
import { useLocation, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { CredentialStatusBadge, SandboxBadge } from '@/app/components/badges';
import {
  type AvailableProvider,
  CHANNELS,
  type ChannelEntry,
  type ProviderEntry,
} from '@/app/components/onboarding/catalog';
import { ProviderDialog } from '@/app/components/onboarding/provider-dialog';
import { SettingsCard, SettingsRow, SettingsRows } from '@/app/components/settings/card';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { channelsAction } from '@/app/lib/actions/channels.server';
import { type Credential, getTenant, listCredentials } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const DETAIL_LABELS: Record<string, string> = {
  teamId: 'Team ID',
  keyId: 'Key ID',
  bundleId: 'Bundle ID',
  projectId: 'Project',
  clientEmail: 'Service account',
};

export function meta() {
  return [{ title: 'Channels · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const [credentials, tenantDetail] = await Promise.all([
    listCredentials({ request, env }, token, params.slug, tenant),
    getTenant({ request, env }, token, params.slug, tenant),
  ]);
  return { credentials, sendPolicy: tenantDetail.settings.sendPolicy };
}

export const action = channelsAction;

function worstStatus(credentials: Credential[]): Credential['status'] {
  if (credentials.some((credential) => credential.status === 'invalid')) return 'invalid';
  if (credentials.some((credential) => credential.status === 'unvalidated')) return 'unvalidated';
  return 'active';
}

function detailsOf(credentials: Credential[]): string | null {
  const details = (credentials[0]?.details ?? {}) as Record<string, string>;
  const parts = Object.entries(details)
    .filter(([key]) => key in DETAIL_LABELS)
    .map(([key, value]) => `${DETAIL_LABELS[key]} ${value}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function ProviderRow({
  channel,
  provider,
  credentials,
  canManage,
  onConnect,
  onRemove,
}: {
  channel: ChannelEntry;
  provider: ProviderEntry;
  credentials: Credential[];
  canManage: boolean;
  onConnect: (channel: ChannelEntry, provider: AvailableProvider) => void;
  onRemove: (provider: ProviderEntry, credentials: Credential[]) => void;
}) {
  const { submit, pending } = useActionFetcher(() =>
    toast.success(`${provider.name} is connected`, { description: 'The provider accepted the credential.' })
  );
  const connected = credentials.length > 0;
  const status = worstStatus(credentials);
  const checked = credentials
    .map((credential) => credential.validatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const error = credentials.find((credential) => credential.lastError)?.lastError;
  const ids = credentials.map((credential) => credential.id).join(',');

  return (
    <SettingsRow
      dimmed={!provider.available}
      start={<IconTile icon={provider.icon} size='sm' />}
      title={
        <span className='flex items-center gap-1.5'>
          {provider.name}
          {credentials.some((credential) => credential.environment === 'sandbox') && (
            <SandboxBadge environment='sandbox' />
          )}
          {!provider.available && <Badge size='sm'>Soon</Badge>}
        </span>
      }
      subtitle={connected ? (error ?? detailsOf(credentials) ?? provider.description) : provider.description}
      end={
        connected ? (
          <>
            {checked && !error && (
              <span className='text-fg-2 text-xs'>
                Checked <TimeAgo at={checked} />
              </span>
            )}
            <CredentialStatusBadge status={status} />
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      icon='IconDotGrid1x3Horizontal'
                      aria-label={`${provider.name} actions`}
                      disabled={pending}
                    />
                  }
                />
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => submit('validate', { provider: provider.id, ids })}>
                    Validate again
                  </DropdownMenuItem>
                  {provider.available && (
                    <DropdownMenuItem onClick={() => onConnect(channel, provider as AvailableProvider)}>
                      Replace
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant='destructive' onClick={() => onRemove(provider, credentials)}>
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        ) : provider.available && canManage ? (
          <Button variant='soft' size='xs' onClick={() => onConnect(channel, provider as AvailableProvider)}>
            Connect
          </Button>
        ) : undefined
      }
    />
  );
}

const SUBSCRIBER_ZONE_LABEL = "Subscriber's timezone";

function policyZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone');
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [SUBSCRIBER_ZONE_LABEL, ...new Set([local, 'UTC', ...(supported ?? [])])];
}

function SendPolicyCard({
  policy,
  canManage,
}: {
  policy: { quietHours: { from: string; to: string; timezone: string } | null; dailyCap: number | null };
  canManage: boolean;
}) {
  const { submit, pending } = useActionFetcher();
  const [quietEnabled, setQuietEnabled] = useState(policy.quietHours !== null);
  const [from, setFrom] = useState(policy.quietHours?.from ?? '22:00');
  const [to, setTo] = useState(policy.quietHours?.to ?? '08:00');
  const [zone, setZone] = useState(
    policy.quietHours && policy.quietHours.timezone !== 'subscriber'
      ? policy.quietHours.timezone
      : SUBSCRIBER_ZONE_LABEL
  );
  const [zones] = useState(policyZones);
  const [capEnabled, setCapEnabled] = useState(policy.dailyCap !== null);
  const [cap, setCap] = useState(String(policy.dailyCap ?? 3));

  const storedZone = policy.quietHours?.timezone ?? 'subscriber';
  const zoneValue = zone === SUBSCRIBER_ZONE_LABEL ? 'subscriber' : zone;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const fromValid = timePattern.test(from);
  const toValid = timePattern.test(to);
  const quietValid = !quietEnabled || (fromValid && toValid && from !== to);
  const capNumber = Number(cap);
  const capValid =
    !capEnabled ||
    (/^\d+$/.test(cap.trim()) && Number.isInteger(capNumber) && capNumber >= 1 && capNumber <= 50);
  const dirty =
    quietEnabled !== (policy.quietHours !== null) ||
    capEnabled !== (policy.dailyCap !== null) ||
    (quietEnabled &&
      (from !== (policy.quietHours?.from ?? '22:00') ||
        to !== (policy.quietHours?.to ?? '08:00') ||
        zoneValue !== storedZone)) ||
    (capEnabled && cap !== String(policy.dailyCap ?? 3));

  const save = () =>
    submit('policy', {
      quietEnabled: String(quietEnabled),
      from,
      to,
      timezone: zoneValue,
      capEnabled: String(capEnabled),
      cap,
    });

  return (
    <SettingsCard
      title='Send policy'
      description='Limits that apply to every send on this tenant.'
      footer={
        canManage
          ? 'A send with policy set to ignore always passes through.'
          : 'Only admins and owners can edit the send policy.'
      }
      action={
        canManage ? (
          <Button size='xs' disabled={!dirty || !quietValid || !capValid || pending} onClick={save}>
            Save
          </Button>
        ) : undefined
      }
    >
      <SettingsRows>
        <SettingsRow
          title='Quiet hours'
          subtitle='Sends inside the window wait for the next allowed time.'
          end={
            <span className='flex items-center gap-2'>
              {quietEnabled && (
                <>
                  <Input
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className='w-[74px]'
                    placeholder='22:00'
                    aria-invalid={!fromValid || (toValid && from === to) ? true : undefined}
                    disabled={!canManage}
                  />
                  <span className='text-fg-2 text-xs'>to</span>
                  <Input
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className='w-[74px]'
                    placeholder='08:00'
                    aria-invalid={!toValid || (fromValid && from === to) ? true : undefined}
                    disabled={!canManage}
                  />
                  <Combobox
                    items={zones}
                    value={zone}
                    onValueChange={(next) => {
                      if (typeof next === 'string') setZone(next);
                    }}
                  >
                    <ComboboxInput
                      className='w-48'
                      placeholder='Search timezones'
                      autoComplete='off'
                      spellCheck={false}
                      disabled={!canManage}
                    />
                    <ComboboxContent>
                      {(label: string) => (
                        <ComboboxItem key={label} value={label}>
                          {label}
                        </ComboboxItem>
                      )}
                    </ComboboxContent>
                  </Combobox>
                </>
              )}
              <Switch checked={quietEnabled} onCheckedChange={setQuietEnabled} disabled={!canManage} />
            </span>
          }
        />
        <SettingsRow
          title='Daily cap'
          subtitle='Per subscriber per day in their own timezone; sends past it fail as capped.'
          end={
            <span className='flex items-center gap-2'>
              {capEnabled && (
                <Input
                  value={cap}
                  onChange={(event) => setCap(event.target.value)}
                  className='w-16'
                  inputMode='numeric'
                  aria-invalid={capValid ? undefined : true}
                  disabled={!canManage}
                />
              )}
              <Switch checked={capEnabled} onCheckedChange={setCapEnabled} disabled={!canManage} />
            </span>
          }
        />
      </SettingsRows>
    </SettingsCard>
  );
}

export default function ChannelsRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const location = useLocation();
  const { submit, pending } = useActionFetcher(() => setRemoveOpen(false));
  const { credentials, sendPolicy } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [removing, setRemoving] = useState<{ provider: ProviderEntry; credentials: Credential[] } | null>(
    null
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [target, setTarget] = useState<{ channel: ChannelEntry; provider: AvailableProvider } | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Channels
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage the providers this workspace sends through.
          </p>
        </div>
      </header>

      <SendPolicyCard policy={sendPolicy} canManage={canManage} />

      {CHANNELS.filter((channel) => channel.available).map((channel) => (
        <Card key={channel.id} className='shrink-0'>
          <CardHeader>
            <CardTitle>{channel.name}</CardTitle>
            <CardDescription>{channel.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsRows>
              {channel.providers.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  channel={channel}
                  provider={provider}
                  credentials={credentials.filter((credential) => credential.provider === provider.id)}
                  canManage={canManage}
                  onConnect={(targetChannel, targetProvider) => {
                    setTarget({ channel: targetChannel, provider: targetProvider });
                    setConnectOpen(true);
                  }}
                  onRemove={(targetProvider, targetCredentials) => {
                    setRemoving({ provider: targetProvider, credentials: targetCredentials });
                    setRemoveOpen(true);
                  }}
                />
              ))}
            </SettingsRows>
          </CardContent>
        </Card>
      ))}

      {target && (
        <ProviderDialog
          workspaceSlug={params.slug}
          channel={target.channel}
          provider={target.provider}
          credentials={credentials}
          open={connectOpen}
          onOpenChange={setConnectOpen}
          action={location.pathname}
        />
      )}

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.provider.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sends through it stop immediately. Topics and subscribers stay. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() =>
                removing &&
                submit('remove', { ids: removing.credentials.map((credential) => credential.id).join(',') })
              }
            >
              Remove provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
