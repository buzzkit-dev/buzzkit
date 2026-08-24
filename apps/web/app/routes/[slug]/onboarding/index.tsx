import { Button } from '@buzzkit/ui/components/button';
import { CardContent } from '@buzzkit/ui/components/card';
import { useState } from 'react';
import { data, Link, redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
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

export default function OnboardingRoute({ loaderData }: Route.ComponentProps) {
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
    backTo: channel ? `${base}/${channel.id}` : base,
    initialStep: provider ? Math.min(initialStep, GUIDES[provider.id].steps.length - 1) : 0,
    storageKey: `buzzkit:onboarding:${workspace.slug}:${provider?.id ?? ''}`,
  });

  const connected = guide.connected
    ? guide.connected.map(
        (created) => credentials.find((credential) => credential.id === created.id) ?? created
      )
    : null;

  const view = connected ? 'connected' : provider ? 'guide' : channel ? 'providers' : 'channels';
  const position =
    { channels: 0, providers: 100, guide: 200, connected: 900 }[view] +
    (view === 'guide' ? guide.current : 0);
  const transitionKey = `${view}:${channel?.id ?? ''}:${provider?.id ?? ''}:${guide.current}`;

  const kind: StepKind = view === 'channels' || view === 'providers' ? 'rows' : 'preview';
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

  const step = view === 'channels' ? 1 : view === 'providers' ? 2 : 3;
  const connectProgress =
    view === 'connected' ? 1 : view === 'guide' && guide.total > 0 ? guide.current / guide.total : 0;
  const progress = [0, 1, 2, 3].map((index) => {
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
  if (view === 'connected' && connected && provider && channel) {
    slots = connectedSlots({
      credentials: connected,
      provider,
      channel,
      workspaceSlug: workspace.slug,
      otherChannels,
      fetcher: guide.fetcher,
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
