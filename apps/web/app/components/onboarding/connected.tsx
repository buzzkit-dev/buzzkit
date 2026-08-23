import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Link, type useFetcher } from 'react-router';
import type { ChannelEntry, ProviderEntry } from '@/app/components/onboarding/catalog';
import type { OnboardingSlots } from '@/app/components/onboarding/layout';
import type { Credential } from '@/app/lib/api.server';

const DETAIL_LABELS: Record<string, string> = {
  teamId: 'Team ID',
  keyId: 'Key ID',
  bundleId: 'Bundle ID',
  projectId: 'Project',
  clientEmail: 'Service account',
};

const ENVIRONMENT_LABELS: Record<Credential['environment'], string> = {
  production: 'Production',
  sandbox: 'Sandbox',
};

export function connectedSlots({
  credentials,
  provider,
  channel,
  workspaceSlug,
  otherChannels,
  fetcher,
}: {
  credentials: Credential[];
  provider: ProviderEntry;
  channel: ChannelEntry;
  workspaceSlug: string;
  otherChannels: number;
  fetcher: ReturnType<typeof useFetcher>;
}): OnboardingSlots {
  const validating = fetcher.state !== 'idle';
  const first = credentials[0]!;
  const active = credentials.every((credential) => credential.status === 'active');
  const unverified = credentials.find((credential) => credential.status !== 'active');
  const details = Object.entries((first.details ?? {}) as Record<string, string>).filter(
    ([key]) => key in DETAIL_LABELS
  );
  const environments = credentials
    .map((credential) => ENVIRONMENT_LABELS[credential.environment])
    .join(' & ');

  return {
    title: (
      <span className='flex items-center gap-3'>
        <IconTile icon={provider.icon} />
        <span className='flex min-w-0 flex-col gap-0.5'>
          <span className='font-medium text-fg-4 text-sm leading-tighter'>
            {active ? `${provider.name} is connected` : `${provider.name} is saved`}
          </span>
          <span className='text-pretty font-normal text-fg-2 text-xs'>
            {active
              ? `${channel.name} can go out through ${provider.name} right away.`
              : `${provider.name} could not be reached to verify the key, so it is stored as unverified. Validate it again in a moment.`}
          </span>
        </span>
      </span>
    ),
    content: (
      <CardContent className='gap-0 pb-2'>
        <ul className='-mx-4 flex flex-col divide-y divide-bg-3'>
          <li className='flex min-h-10 items-center gap-3 px-4 py-1.5'>
            <span className='flex-1 font-medium text-fg-4 text-sm'>Status</span>
            <Badge variant={active ? 'green' : 'amber'} size='sm'>
              {active ? 'Active' : 'Unverified'}
            </Badge>
          </li>
          {first.provider === 'apns' && (
            <li className='flex min-h-10 items-center gap-3 px-4 py-1.5'>
              <span className='flex-1 font-medium text-fg-4 text-sm'>Environment</span>
              <span className='text-fg-2 text-sm'>{environments}</span>
            </li>
          )}
          {details.map(([key, value]) => (
            <li key={key} className='flex min-h-10 items-center gap-3 px-4 py-1.5'>
              <span className='shrink-0 font-medium text-fg-4 text-sm'>{DETAIL_LABELS[key]}</span>
              <span className='min-w-0 flex-1 truncate text-right text-fg-2 text-xs'>{value}</span>
            </li>
          ))}
          {unverified?.lastError && (
            <li className='flex flex-col gap-0.5 px-4 py-2.5'>
              <span className='font-medium text-fg-4 text-sm'>Last check</span>
              <span className='text-pretty text-fg-2 text-xs'>{unverified.lastError}</span>
            </li>
          )}
        </ul>
      </CardContent>
    ),
    footer: (
      <>
        {!active ? (
          <fetcher.Form method='post'>
            <input type='hidden' name='intent' value='validate' />
            <input
              type='hidden'
              name='ids'
              value={credentials.map((credential) => credential.id).join(',')}
            />
            <Button type='submit' variant='ghost' size='xs' className='-ml-2' disabled={validating}>
              {validating && <Spinner aria-label='Validating' />}
              Validate again
            </Button>
          </fetcher.Form>
        ) : otherChannels > 0 ? (
          <Button
            variant='ghost'
            size='xs'
            className='-ml-2'
            nativeButton={false}
            render={<Link to={`/${workspaceSlug}/onboarding`} />}
          >
            Add another channel
          </Button>
        ) : (
          <span />
        )}
        <Button size='xs' nativeButton={false} render={<Link to={`/${workspaceSlug}`} />}>
          Go to the dashboard
        </Button>
      </>
    ),
  };
}
