import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { useState } from 'react';
import { data, Link, redirect, type ShouldRevalidateFunctionArgs, useNavigate } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import {
  CHANNELS,
  findChannel,
  findProvider,
  resolveOnboardingPath,
} from '@/app/components/onboarding/catalog';
import { ChoiceRow, ChoiceRows } from '@/app/components/onboarding/choice-row';
import { connectedSlots } from '@/app/components/onboarding/connected';
import { GUIDES } from '@/app/components/onboarding/guides';
import { OnboardingLayout, type OnboardingSlots } from '@/app/components/onboarding/layout';
import { useProviderGuide } from '@/app/components/onboarding/provider-guide';
import type { StepKind } from '@/app/components/onboarding/transition';
import { ImportForm } from '@/app/components/subscribers/import';
import { connectProviderAction } from '@/app/lib/actions/connect.server';
import { ApiError, getProfile, getWorkspace, listCredentials } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Set up ${loaderData.workspace.name} · BuzzKit` : 'Set up · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const { channel, provider } = resolveOnboardingPath(params['*']);
  const stepParam = Number(new URL(request.url).searchParams.get('step') ?? '1');
  const initialStep = Number.isInteger(stepParam) && stepParam > 0 ? stepParam - 1 : 0;

  try {
    const [workspace, profile, credentials] = await Promise.all([
      getWorkspace(ctx, token, params.slug),
      getProfile(ctx, token),
      listCredentials(ctx, token, params.slug, 'default'),
    ]);
    if (credentials.length > 0) throw redirect(`/${params.slug}`);
    return {
      workspace,
      profile,
      credentials,
      channelId: channel?.id ?? null,
      providerId: provider?.id ?? null,
      initialStep,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      throw data(null, { status: error.status });
    }
    throw error;
  }
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false;
  if (actionResult && typeof actionResult === 'object' && 'ok' in actionResult && actionResult.ok)
    return false;
  return defaultShouldRevalidate;
}

export const action = connectProviderAction;

const CURRENT_STEP_FILL = 0.08;

const VIEW_POSITIONS = {
  channels: 0,
  providers: 100,
  guide: 200,
  connected: 900,
  migrate: 950,
  import: 1000,
} as const;

type OnboardingView = keyof typeof VIEW_POSITIONS;

type ConnectedStage = 'connected' | 'migrate' | 'import';

function resolveView(state: {
  connected: boolean;
  stage: ConnectedStage;
  provider: boolean;
  channel: boolean;
}): OnboardingView {
  if (state.connected) return state.stage;
  if (state.provider) return 'guide';
  return state.channel ? 'providers' : 'channels';
}

export default function OnboardingRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { workspace, credentials, channelId, providerId, initialStep } = loaderData;
  const channel = channelId ? findChannel(channelId)! : null;
  const provider = channel && providerId ? findProvider(channel.id, providerId)! : null;
  const base = `/${workspace.slug}/onboarding`;

  const existing = provider
    ? (credentials.find((credential) => credential.provider === provider.id) ?? null)
    : null;
  const guide = useProviderGuide({
    guide: provider ? GUIDES[provider.id] : null,
    providerId: provider?.id ?? '',
    existing,
    back: channel ? `${base}/${channel.id}` : base,
    initialStep: provider ? Math.min(initialStep, GUIDES[provider.id].steps.length - 1) : 0,
    storageKey: `buzzkit:onboarding:${workspace.slug}:${provider?.id ?? ''}`,
  });

  const connected = guide.connected
    ? guide.connected.map(
        (created) => credentials.find((credential) => credential.id === created.id) ?? created
      )
    : null;

  const [stage, setStage] = useState<ConnectedStage>('connected');
  const view = resolveView({
    connected: connected !== null,
    stage,
    provider: !!provider,
    channel: !!channel,
  });
  const position = VIEW_POSITIONS[view] + (view === 'guide' ? guide.current : 0);
  const transitionKey = `${view}:${channel?.id ?? ''}:${provider?.id ?? ''}:${guide.current}`;

  const kind: StepKind =
    view === 'channels' || view === 'providers' || view === 'migrate' ? 'rows' : 'preview';
  const [nav, setNav] = useState({ key: transitionKey, position, kind, from: kind, direction: 1 });
  if (nav.key !== transitionKey) {
    setNav({
      key: transitionKey,
      position,
      kind,
      from: nav.kind,
      direction: position >= nav.position ? 1 : -1,
    });
  }

  const step = { channels: 1, providers: 2, guide: 3, connected: 3, migrate: 4, import: 4 }[view];
  const connectProgress =
    view === 'connected' ? 1 : view === 'guide' && guide.total > 0 ? guide.current / guide.total : 0;
  const progress = [0, 1, 2, 3, 4].map((index) => {
    if (index < step) return 1;
    if (index > step) return 0;
    return index === 3 ? Math.max(CURRENT_STEP_FILL, connectProgress) : CURRENT_STEP_FILL;
  });

  const connectedChannels = new Set<string>(credentials.map((credential) => credential.channel));
  const connectedProviders = new Set<string>(credentials.map((credential) => credential.provider));
  const otherChannels = CHANNELS.filter(
    (entry) => entry.available && entry.id !== channel?.id && !connectedChannels.has(entry.id)
  ).length;

  let slots: OnboardingSlots;
  if (view === 'import' && connected) {
    slots = {
      title: 'Bring your subscribers',
      description: 'Upload the export from your previous provider and every device keeps receiving.',
      content: (
        <CardContent className='pt-2.5'>
          <ImportForm
            target={{ action: `/${workspace.slug}/subscribers`, tenant: 'default' }}
            sandbox={connected.some((credential) => credential.environment === 'sandbox')}
            onDone={() => void navigate(`/${workspace.slug}/subscribers`)}
          />
        </CardContent>
      ),
      footer: (
        <Button variant='ghost' size='xs' className='-ml-2' onClick={() => setStage('migrate')}>
          Back
        </Button>
      ),
    };
  } else if (view === 'migrate') {
    slots = {
      title: 'Migrating from another provider?',
      description: 'Bring your subscribers along, or start with an empty audience.',
      content: (
        <CardContent className='pb-2'>
          <ChoiceRows>
            <ChoiceRow
              onClick={() => setStage('import')}
              icon='IconCloudUploadFilled'
              title='Import subscribers'
              description='Upload the export from your previous provider.'
            />
            <ChoiceRow
              to={`/${workspace.slug}`}
              icon='IconTeamFilled'
              title='Start fresh'
              description='Subscribers appear as your app identifies them.'
            />
          </ChoiceRows>
        </CardContent>
      ),
      footer: (
        <Button variant='ghost' size='xs' className='-ml-2' onClick={() => setStage('connected')}>
          Back
        </Button>
      ),
    };
  } else if (view === 'connected' && connected && provider && channel) {
    slots = connectedSlots({
      credentials: connected,
      provider,
      channel,
      fetcher: guide.fetcher,
      more: otherChannels > 0 ? `/${workspace.slug}/settings/channels` : null,
      done: { label: 'Continue', onClick: () => setStage('migrate') },
    });
  } else if (view === 'guide' && guide.slots) {
    slots = guide.slots;
  } else if (view === 'providers' && channel) {
    slots = {
      title: `Choose ${channel.noun === 'email' || channel.noun === 'SMS' ? 'an' : 'a'} ${channel.noun} provider`,
      description: 'Each provider needs its own key.',
      content: (
        <CardContent className='pb-2'>
          <ChoiceRows>
            {channel.providers.map((entry) => (
              <ChoiceRow
                key={entry.id}
                to={`${base}/${channel.id}/${entry.id}`}
                icon={entry.icon}
                title={entry.name}
                badges={entry.badges}
                description={entry.description}
                state={
                  !entry.available ? 'soon' : connectedProviders.has(entry.id) ? 'connected' : 'available'
                }
              />
            ))}
          </ChoiceRows>
        </CardContent>
      ),
      footer: (
        <Button variant='ghost' size='xs' className='-ml-2' nativeButton={false} render={<Link to={base} />}>
          Back
        </Button>
      ),
    };
  } else {
    slots = {
      title: 'Connect a channel',
      description: 'Start with one. You can add the rest later.',
      content: (
        <CardContent className='pb-2'>
          <ChoiceRows>
            {CHANNELS.map((entry) => (
              <ChoiceRow
                key={entry.id}
                to={`${base}/${entry.id}`}
                icon={entry.icon}
                title={entry.name}
                description={entry.description}
                state={!entry.available ? 'soon' : 'available'}
              />
            ))}
          </ChoiceRows>
        </CardContent>
      ),
    };
  }

  return (
    <OnboardingLayout
      progress={progress}
      transitionKey={transitionKey}
      motion={{ direction: nav.direction, from: nav.from, to: kind }}
      slots={slots}
    />
  );
}
