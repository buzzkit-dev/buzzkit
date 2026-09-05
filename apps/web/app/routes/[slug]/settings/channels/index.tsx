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
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { toast } from '@buzzkit/ui/components/sonner';
import { Switch } from '@buzzkit/ui/components/switch';
import { useState } from 'react';
import { useLocation, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { CredentialStatusBadge, SandboxBadge } from '@/app/components/badges';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import {
  type AvailableProvider,
  CHANNELS,
  type ChannelEntry,
  type ProviderEntry,
} from '@/app/components/onboarding/catalog';
import { ProviderDialog } from '@/app/components/onboarding/provider-dialog';
import { SettingsCard, SettingsRow, SettingsRows } from '@/app/components/settings/card';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useCanManage } from '@/app/hooks/use-known-role';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { channelsAction } from '@/app/lib/actions/channels.server';
import {
  ApiError,
  type Credential,
  getTenant,
  getTenantIdentitySecret,
  listCredentials,
} from '@/app/lib/api.server';
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
  return {
    channels: (async () => {
      const [credentials, tenantDetail, secret] = await Promise.all([
        listCredentials({ request, env }, token, params.slug, tenant),
        getTenant({ request, env }, token, params.slug, tenant),
        getTenantIdentitySecret({ request, env }, token, params.slug, tenant).catch((error) => {
          if (error instanceof ApiError && error.status === 403) return null;
          throw error;
        }),
      ]);
      return {
        credentials,
        sendPolicy: tenantDetail.settings.sendPolicy,
        identity: { requireVerification: tenantDetail.settings.identity.requireVerification, secret },
      };
    })(),
  };
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
      <SettingsRows divided>
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
type Identity = Awaited<Route.ComponentProps['loaderData']['channels']>['identity'];

function IdentityCard({ identity, canManage }: { identity: Identity; canManage: boolean }) {
  const { submit, pending } = useActionFetcher(() => setRotateOpen(false));
  const secret = identity.secret?.identitySecret ?? null;
  const [revealed, setRevealed] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const copySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Unable to copy', { description: 'Reveal the secret and copy it manually.' })
    );
  };

  return (
    <SettingsCard
      title='Identity verification'
      description='Prove which subscriber a client call belongs to.'
      footer={
        canManage
          ? 'Your backend signs each subscriber id with the secret and the app sends the hash on every call.'
          : 'Only admins and owners can change identity verification.'
      }
    >
      <SettingsRows divided>
        <SettingsRow
          title='Require verification'
          subtitle='Client calls without a valid identity hash are refused.'
          end={
            <Switch
              checked={identity.requireVerification}
              disabled={!canManage || pending}
              onCheckedChange={(checked) => submit('identity', { require: String(checked) })}
            />
          }
        />
        <SettingsRow
          title='Identity secret'
          subtitle={
            identity.secret === null ? (
              'Only admins and owners can see the identity secret.'
            ) : secret === null ? (
              'No secret yet. Create one to start verifying.'
            ) : revealed ? (
              <span className='font-mono'>{secret}</span>
            ) : (
              '••••••••••••••••••••••••••••••••'
            )
          }
          end={
            canManage ? (
              <>
                {secret !== null && (
                  <Button variant='ghost' size='xs' onClick={() => setRevealed((current) => !current)}>
                    {revealed ? 'Hide' : 'Reveal'}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        icon='IconDotGrid1x3Horizontal'
                        aria-label='Identity secret actions'
                      />
                    }
                  />
                  <DropdownMenuContent align='end'>
                    {secret !== null && <DropdownMenuItem onClick={copySecret}>Copy secret</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => setRotateOpen(true)}>
                      {secret === null ? 'Create secret' : 'Rotate secret'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : undefined
          }
        />
      </SettingsRows>
      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {secret === null ? 'Create the identity secret?' : 'Rotate the identity secret?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {secret === null
                ? 'Your backend can start signing subscriber ids with it right away.'
                : 'Hashes made with the current secret stop verifying immediately.'}
              {secret !== null && <span className='block'>This cannot be undone.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => submit('rotate-identity-secret', {})}>
              {secret === null ? 'Create secret' : 'Rotate secret'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}

function ChannelsContent({
  data,
  canManage,
  params,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['channels']>;
  canManage: boolean;
  params: Route.ComponentProps['params'];
}) {
  const location = useLocation();
  const { submit, pending } = useActionFetcher(() => setRemoveOpen(false));
  const { credentials, sendPolicy } = data;
  const [removing, setRemoving] = useState<{ provider: ProviderEntry; credentials: Credential[] } | null>(
    null
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [target, setTarget] = useState<{ channel: ChannelEntry; provider: AvailableProvider } | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      <SendPolicyCard policy={sendPolicy} canManage={canManage} />
      <IdentityCard identity={data.identity} canManage={canManage} />

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
    </>
  );
}

function ProviderRowSkeleton({ provider }: { provider: ProviderEntry }) {
  return (
    <SettingsRow
      dimmed={!provider.available}
      start={<IconTile icon={provider.icon} size='sm' />}
      title={
        <span className='flex items-center gap-1.5'>
          {provider.name}
          {!provider.available && <Badge size='sm'>Soon</Badge>}
        </span>
      }
      subtitle={<Skeleton className='inline-block h-3 w-72 align-middle' />}
      end={<Skeleton className='h-[26px] w-[74px] rounded-[10px]' />}
    />
  );
}

function ChannelCardSkeleton({ channel }: { channel: ChannelEntry }) {
  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>{channel.name}</CardTitle>
        <CardDescription>{channel.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsRows>
          {channel.providers.map((provider) => (
            <ProviderRowSkeleton key={provider.id} provider={provider} />
          ))}
        </SettingsRows>
      </CardContent>
    </Card>
  );
}

function ChannelsSkeleton() {
  const manage = useCanManage(null);

  return (
    <>
      <SettingsCard
        title='Send policy'
        description='Limits that apply to every send on this tenant.'
        footer={
          manage === false
            ? 'Only admins and owners can edit the send policy.'
            : 'A send with policy set to ignore always passes through.'
        }
        action={
          manage === false ? undefined : (
            <Button size='xs' disabled>
              Save
            </Button>
          )
        }
      >
        <SettingsRows divided>
          <SettingsRow
            title='Quiet hours'
            subtitle='Sends inside the window wait for the next allowed time.'
            end={<Switch aria-label='Quiet hours' disabled />}
          />
          <SettingsRow
            title='Daily cap'
            subtitle='Per subscriber per day in their own timezone; sends past it fail as capped.'
            end={<Switch aria-label='Daily cap' disabled />}
          />
        </SettingsRows>
      </SettingsCard>
      <SettingsCard
        title='Identity verification'
        description='Prove which subscriber a client call belongs to.'
        footer={
          manage === false
            ? 'Only admins and owners can change identity verification.'
            : 'Your backend signs each subscriber id with the secret and the app sends the hash on every call.'
        }
      >
        <SettingsRows divided>
          <SettingsRow
            title='Require verification'
            subtitle='Client calls without a valid identity hash are refused.'
            end={<Switch aria-label='Require verification' disabled />}
          />
          <SettingsRow
            title='Identity secret'
            subtitle={<Skeleton className='inline-block h-3 w-56 align-middle' />}
            end={
              <Button
                variant='ghost'
                size='icon-xs'
                icon='IconDotGrid1x3Horizontal'
                aria-label='Identity secret actions'
                disabled
              />
            }
          />
        </SettingsRows>
      </SettingsCard>
      {CHANNELS.filter((channel) => channel.available).map((channel) => (
        <ChannelCardSkeleton key={channel.id} channel={channel} />
      ))}
    </>
  );
}

export default function ChannelsRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { channels } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <div className='flex w-full flex-col gap-5'>
      <ChannelsHeader />

      <Deferred resolve={channels}>
        {(data) =>
          data === undefined ? (
            <ChannelsSkeleton />
          ) : (
            <ChannelsContent data={data} canManage={canManage} params={params} />
          )
        }
      </Deferred>
    </div>
  );
}

function ChannelsHeader() {
  return <PageHeader title='Channels' description='Manage the providers this workspace sends through.' />;
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex w-full flex-col gap-5'>
      <ChannelsHeader />
      <ChannelsSkeleton />
    </div>
  ),
};
