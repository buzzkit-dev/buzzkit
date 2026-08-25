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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { toast } from '@buzzkit/ui/components/sonner';
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
import { SettingsRow, SettingsRows } from '@/app/components/settings/card';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { channelsAction } from '@/app/lib/actions/channels.server';
import { type Credential, listCredentials } from '@/app/lib/api.server';
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
  const credentials = await listCredentials({ request, env }, token, params.slug, tenant);
  return { credentials };
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

export default function ChannelsRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { credentials } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [removing, setRemoving] = useState<{ provider: ProviderEntry; credentials: Credential[] } | null>(
    null
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [target, setTarget] = useState<{ channel: ChannelEntry; provider: AvailableProvider } | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const { submit, pending } = useActionFetcher(() => setRemoveOpen(false));
  const location = useLocation();

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
