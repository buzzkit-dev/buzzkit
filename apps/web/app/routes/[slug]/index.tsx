import { Avatar } from '@buzzkit/ui/components/avatar';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterRange } from '@buzzkit/ui/components/filter-bar';
import { Flag } from '@buzzkit/ui/components/flag';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useRouteLoaderData,
  useSearchParams,
} from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, MessageStatusBadge, PlatformBadge } from '@/app/components/badges';
import { EventName } from '@/app/components/events/name';
import { IntegratePanel } from '@/app/components/integrate/panel';
import { type CreatedKey, CreatedKeyDialog } from '@/app/components/keys/created';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import {
  CAPPED_LINE,
  ChartCardSkeleton,
  DELIVERY_LINES,
  dayOf,
  EVENT_LINES,
  Key,
  ListCardSkeleton,
  PeriodChart,
  RUN_LINES,
  Tile,
  TileSkeleton,
} from '@/app/components/overview/charts';
import { SettingsRow, SettingsRows } from '@/app/components/settings/card';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { LiveRuns } from '@/app/components/workflows/live-runs';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { RANGES, resolveInterval, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { useQuickStart } from '@/app/hooks/use-quick-start';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { quickStartAction } from '@/app/lib/actions/quick-start.server';
import {
  getStats,
  getTenant,
  listCredentials,
  listKeys,
  listMessages,
  listSubscribers,
  type Message,
  type Stats,
  type Subscriber,
} from '@/app/lib/api.server';
import { type Channel, channelLabel, connectedChannels } from '@/app/lib/channels';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { loader as layoutLoader, WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const DEFAULT_RANGE = '7d';

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const range = requestUrl(request).searchParams.get('range') ?? DEFAULT_RANGE;
  const window = resolveRange(range);

  return {
    overview: (async () => {
      const [credentials, stats, messages, subscribers] = await Promise.all([
        listCredentials(ctx, token, params.slug, tenant),
        getStats(ctx, token, params.slug, tenant, window.from ? window : resolveRange(DEFAULT_RANGE)),
        listMessages(ctx, token, params.slug, tenant, { limit: 5 }),
        listSubscribers(ctx, token, params.slug, tenant, { limit: 5 }),
      ]);

      let clientKey: string | null = null;
      let hasWorkspaceKey = false;
      if (messages.items.length === 0) {
        const [clientKeys, workspaceKeys, current] = await Promise.all([
          listKeys(ctx, token, params.slug, { kind: 'client' }),
          listKeys(ctx, token, params.slug, { kind: 'workspace' }),
          getTenant(ctx, token, params.slug, tenant),
        ]);
        clientKey =
          clientKeys.items.find((key) => !key.revokedAt && key.tenantId === current.id)?.token ?? null;
        hasWorkspaceKey = workspaceKeys.items.some((key) => !key.revokedAt);
      }

      return {
        connected: connectedChannels(credentials),
        stats,
        messages: messages.items,
        subscribers: subscribers.items,
        clientKey,
        hasWorkspaceKey,
      };
    })(),
  };
}

export const action = quickStartAction;

function sendSnippet(apiUrl: string, channel: Channel, secret: string | null) {
  const body =
    channel === 'push'
      ? '{ "to": "user_42", "title": "Hello from BuzzKit", "body": "Your first message." }'
      : `{ "to": "user_42", "channel": "${channel}", "title": "Hello from BuzzKit", "body": "Your first message." }`;
  return [
    `curl -X POST ${apiUrl}/v1/messages \\`,
    `  -H 'Authorization: Bearer ${secret ?? 'bk_ws_…'}' \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d '${body}'`,
  ].join('\n');
}

function resolveSendChannel(connected: Channel[]): Channel {
  return connected.includes('push') ? 'push' : (connected[0] ?? 'push');
}

function TopEventRow({ event, base }: { event: Stats['topEvents'][number]; base: string }) {
  return (
    <TableRow>
      <TableCell className='max-w-0 py-2'>
        <Link
          to={`${base}/events/${encodeURIComponent(event.name)}`}
          className='flex min-w-0 outline-none focus-visible:underline'
        >
          <EventName name={event.name} />
        </Link>
      </TableCell>
      <TableCell className='w-0 text-right tabular-nums'>{event.count.toLocaleString('en-US')}</TableCell>
    </TableRow>
  );
}

function WorkflowRow({ workflow, base }: { workflow: Stats['workflows'][number]; base: string }) {
  return (
    <TableRow>
      <TableCell className='max-w-0 py-2'>
        <Link
          to={`${base}/workflows/${workflow.slug}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate className='font-medium text-fg-4'>{workflow.name}</Truncate>
          <Truncate className='text-fg-2 text-xs'>{workflow.slug}</Truncate>
        </Link>
      </TableCell>
      <TableCell className='w-0'>
        <LiveRuns runs={workflow} />
      </TableCell>
      <TableCell className='w-0 whitespace-nowrap'>
        {workflow.lastRunAt ? <TimeAgo at={workflow.lastRunAt} /> : <span className='text-fg-2'>Never</span>}
      </TableCell>
    </TableRow>
  );
}

function MessageRow({ message, base }: { message: Message; base: string }) {
  const payload = message.payload as { title?: string; body?: string };
  return (
    <TableRow>
      <TableCell className='max-w-0 py-2'>
        <Link
          to={`${base}/messages/${message.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate className='font-medium text-fg-4'>{payload.title ?? 'Untitled'}</Truncate>
          {payload.body && <Truncate className='text-fg-2 text-xs'>{payload.body}</Truncate>}
        </Link>
      </TableCell>
      <TableCell className='w-0'>
        <MessageStatusBadge status={message.status} />
      </TableCell>
      <TableCell className='w-0'>
        <TimeAgo at={message.createdAt} />
      </TableCell>
    </TableRow>
  );
}

function SubscriberRow({ subscriber, base }: { subscriber: Subscriber; base: string }) {
  const name = attribute(subscriber, 'name');
  const email = attribute(subscriber, 'email');
  const country = attribute(subscriber, '$country');
  const secondary = name && email ? email : (email ?? name);
  return (
    <TableRow>
      <TableCell className='max-w-0 py-2'>
        <Link
          to={`${base}/subscribers/${encodeURIComponent(subscriber.externalId)}`}
          className='flex items-center gap-2.5 outline-none focus-visible:underline'
        >
          <Avatar name={subscriber.externalId} label={name ?? subscriber.externalId} />
          <span className='flex min-w-0 flex-col'>
            <span className='flex items-center gap-1.5 font-medium text-fg-4'>
              <Truncate>{name ?? subscriber.externalId}</Truncate>
              {country && (
                <Tooltip>
                  <TooltipTrigger render={<span className='flex' />}>
                    <Flag code={country} />
                  </TooltipTrigger>
                  <TooltipContent>{countryName(country)}</TooltipContent>
                </Tooltip>
              )}
            </span>
            <Truncate className='text-fg-2 text-xs'>{name ? subscriber.externalId : secondary}</Truncate>
          </span>
        </Link>
      </TableCell>
      <TableCell className='w-0'>
        {subscriber.channels.length > 0 ? (
          <span className='flex items-center gap-1'>
            {subscriber.platforms.includes('ios') && <PlatformBadge platform='ios' />}
            {subscriber.platforms.includes('android') && <PlatformBadge platform='android' />}
            {subscriber.channels.includes('email') && <ChannelBadge channel='email' />}
          </span>
        ) : (
          <span className='text-fg-2'>None</span>
        )}
      </TableCell>
      <TableCell className='w-0'>
        <Time at={subscriber.createdAt} />
      </TableCell>
    </TableRow>
  );
}
const QUICK_START_PROVIDERS = CHANNELS.flatMap((channel) =>
  channel.available ? channel.providers.filter((provider) => provider.available) : []
);

type AppGuide = {
  description: string;
  waiting: string;
  done: string;
  footer: string;
  guide: { label: string; href: string };
};

const APP_GUIDES: Record<'setup' | 'push' | 'email' | 'mixed', AppGuide> = {
  setup: {
    description:
      'Add the SDK and identify your users. The first subscriber appears under Subscribers and completes this step.',
    waiting: 'Waiting for the first subscriber',
    done: 'Subscriber registered',
    footer: 'Every SDK starts with the client key above.',
    guide: { label: 'Read the docs', href: 'https://docs.buzzkit.dev' },
  },
  push: {
    description:
      'Identify the user and register for push. The first device appears under Subscribers and completes this step.',
    waiting: 'Waiting for the first device',
    done: 'Device registered',
    footer: 'Adding the SDK by hand takes four lines of Swift.',
    guide: { label: 'Read the iOS guide', href: 'https://docs.buzzkit.dev/sdks/ios/overview' },
  },
  email: {
    description:
      'Identify your users with their email address. The first subscriber appears under Subscribers and completes this step.',
    waiting: 'Waiting for the first subscriber',
    done: 'Subscriber registered',
    footer: 'The server SDK is one npm install.',
    guide: { label: 'Read the quickstart', href: 'https://docs.buzzkit.dev/quickstart' },
  },
  mixed: {
    description:
      'Identify your users and register their devices and addresses. The first subscription appears under Subscribers and completes this step.',
    waiting: 'Waiting for the first subscription',
    done: 'Subscription registered',
    footer: 'Every SDK starts with the client key above.',
    guide: { label: 'Read the docs', href: 'https://docs.buzzkit.dev' },
  },
};

function resolveAppGuide(connected: Channel[]): AppGuide {
  if (connected.length === 0) return APP_GUIDES.setup;
  if (connected.length > 1) return APP_GUIDES.mixed;
  if (connected[0] === 'email') return APP_GUIDES.email;
  return APP_GUIDES.push;
}

type FirstSubscription = { externalId: string; channel: Channel };

function resolveFirstSubscription(subscribers: Subscriber[], connected: Channel[]): FirstSubscription | null {
  for (const subscriber of subscribers) {
    const channel = connected.find((entry) => subscriber.channels.includes(entry));
    if (channel) return { externalId: subscriber.externalId, channel };
  }
  return null;
}

function AppCard({
  connected,
  registered,
  clientKey,
  apiUrl,
  loading = false,
}: {
  connected: Channel[];
  registered: boolean;
  clientKey: string | null;
  apiUrl: string;
  loading?: boolean;
}) {
  const guide = resolveAppGuide(connected);

  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>Add BuzzKit to your app</CardTitle>
        <CardDescription>{guide.description}</CardDescription>
        {registered ? (
          <CardAction>
            <Badge variant='green' size='sm'>
              {guide.done}
            </Badge>
          </CardAction>
        ) : (
          connected.length > 0 && (
            <CardAction className='gap-1.5 py-0.5 pl-1 text-fg-2 text-xs'>
              <LivePing />
              {guide.waiting}
            </CardAction>
          )
        )}
      </CardHeader>
      <CardContent>
        <IntegratePanel apiUrl={apiUrl} clientKey={clientKey} loading={loading} fit />
      </CardContent>
      <CardFooter>
        <span className='text-pretty text-fg-2 text-xs'>{guide.footer}</span>
        <Button
          variant='ghost'
          size='xs'
          className='-mr-2'
          nativeButton={false}
          render={<a href={guide.guide.href} target='_blank' rel='noreferrer' />}
        >
          {guide.guide.label}
        </Button>
      </CardFooter>
    </Card>
  );
}

function KeyCard({
  hasKey,
  pending,
  onCreate,
  base,
  loading = false,
}: {
  hasKey: boolean;
  pending: boolean;
  onCreate: () => void;
  base: string;
  loading?: boolean;
}) {
  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>Create a workspace key</CardTitle>
        <CardDescription>
          Your backend sends with a workspace key. It is shown once, so keep it where your server reads it.
        </CardDescription>
        {hasKey && (
          <CardAction>
            <Badge variant='green' size='sm'>
              Key created
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter>
        <span className='text-pretty text-fg-2 text-xs'>
          {hasKey
            ? 'Every key is listed under API keys.'
            : 'Full access, named “Backend”. Rename or narrow it under API keys.'}
        </span>
        {hasKey ? (
          <Button
            variant='ghost'
            size='xs'
            className='-mr-2'
            nativeButton={false}
            render={<Link to={`${base}/keys`} />}
          >
            Open API keys
          </Button>
        ) : (
          <Button size='xs' disabled={loading} loading={pending} onClick={onCreate}>
            Create workspace key
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function SendCard({
  apiUrl,
  connected,
  first,
  secret,
  pending,
  onSend,
}: {
  apiUrl: string;
  connected: Channel[];
  first: FirstSubscription | null;
  secret: string | null;
  pending: boolean;
  onSend: () => void;
}) {
  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>Send your first message</CardTitle>
        <CardDescription>
          A real message to the first subscriber that registered, or the same call from your backend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CodeBlock code={sendSnippet(apiUrl, resolveSendChannel(connected), secret)} className='w-full' />
      </CardContent>
      <CardFooter>
        <span className='text-pretty text-fg-2 text-xs'>
          {first ? (
            <>
              Goes to <span className='text-fg-4'>{first.externalId}</span> on{' '}
              {channelLabel(first.channel).toLowerCase()}.
            </>
          ) : secret ? (
            'The snippet carries your new key until you leave this page.'
          ) : (
            'Enabled once the first subscriber has registered.'
          )}
        </span>
        <Button size='xs' disabled={first === null} loading={pending} onClick={onSend}>
          Send test message
        </Button>
      </CardFooter>
    </Card>
  );
}

function QuickStart({
  connected,
  first,
  hasWorkspaceKey,
  clientKey,
  apiUrl,
  base,
  sending,
}: {
  connected: Channel[];
  first: FirstSubscription | null;
  hasWorkspaceKey: boolean;
  clientKey: string | null;
  apiUrl: string;
  base: string;
  sending: Sending;
}) {
  const creating = useActionFetcher((data) => {
    if (typeof data.secret === 'string') {
      setCreated({ secret: data.secret, kind: 'workspace' });
      setSecret(data.secret);
    }
  });
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const createWorkspaceKey = () => {
    void creating.submit('create-key', { name: 'Backend', kind: 'workspace', scopes: JSON.stringify(['*']) });
  };

  const sendFirstMessage = () => {
    if (!first) return;
    void sending.submit('send', {
      channel: first.channel,
      target: 'subscriber',
      to: first.externalId,
      title: 'Hello from BuzzKit',
      body: 'Your first message arrived.',
    });
  };

  return (
    <>
      {connected.length === 0 && (
        <Card className='shrink-0'>
          <CardHeader>
            <CardTitle>Connect a channel</CardTitle>
            <CardDescription>Nothing can be sent before a provider credential is connected.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsRows divided>
              {QUICK_START_PROVIDERS.map((provider) => (
                <SettingsRow
                  key={provider.id}
                  start={<IconTile icon={provider.icon} size='sm' />}
                  title={provider.name}
                  subtitle={provider.description}
                  end={
                    <Button
                      variant='soft'
                      size='xs'
                      nativeButton={false}
                      render={<Link to={`${base}/settings/channels`} />}
                    >
                      Connect
                    </Button>
                  }
                />
              ))}
            </SettingsRows>
          </CardContent>
        </Card>
      )}

      <AppCard connected={connected} registered={first !== null} clientKey={clientKey} apiUrl={apiUrl} />
      <KeyCard
        hasKey={hasWorkspaceKey}
        pending={creating.pending}
        onCreate={createWorkspaceKey}
        base={base}
      />
      <SendCard
        apiUrl={apiUrl}
        connected={connected}
        first={first}
        secret={secret}
        pending={sending.pending}
        onSend={sendFirstMessage}
      />
      <CreatedKeyDialog created={created} apiUrl={apiUrl} onDone={() => setCreated(null)} />
    </>
  );
}

function QuickStartSkeleton() {
  const { slug } = useParams();
  const { connected } = useQuickStart();
  const layout = useRouteLoaderData<typeof layoutLoader>('routes/[slug]/layout');
  const apiUrl = layout?.apiUrl ?? '';
  const base = `/${slug}`;

  return (
    <>
      <AppCard connected={connected} registered={false} clientKey={null} apiUrl={apiUrl} loading />
      <KeyCard hasKey={false} pending={false} onCreate={() => {}} base={base} loading />
      <SendCard
        apiUrl={apiUrl}
        connected={connected}
        first={null}
        secret={null}
        pending={false}
        onSend={() => {}}
      />
    </>
  );
}

type Sending = ReturnType<typeof useActionFetcher>;

function OverviewContent({
  data,
  apiUrl,
  base,
  sending,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['overview']>;
  apiUrl: string;
  base: string;
  sending: Sending;
}) {
  const { connected, stats, messages, subscribers, clientKey, hasWorkspaceKey } = data;
  const hasChannel = connected.length > 0;

  if (messages.length === 0) {
    return (
      <QuickStart
        connected={connected}
        first={resolveFirstSubscription(subscribers, connected)}
        hasWorkspaceKey={hasWorkspaceKey}
        clientKey={clientKey}
        apiUrl={apiUrl}
        base={base}
        sending={sending}
      />
    );
  }

  const delivered = stats.deliveries.delivered;
  const failed = stats.deliveries.failed + stats.deliveries.invalid;
  const deliveryLines = stats.deliveries.capped > 0 ? [...DELIVERY_LINES, CAPPED_LINE] : DELIVERY_LINES;
  const points = (pick: (day: Stats['series'][number]) => number) =>
    stats.series.map((day) => ({ date: dayOf(day.date), value: pick(day) }));
  let running = 0;
  const growth = stats.series.map((day) => {
    running += day.subscribers;
    return { date: dayOf(day.date), value: running };
  });

  return (
    <>
      {!hasChannel && (
        <Card className='flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center'>
          <IconTile icon='IconPaperPlaneTopRightFilled' size='sm' className='text-fg-2' />
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='font-medium text-fg-4 text-sm'>No channel connected</span>
            <span className='text-pretty text-fg-2 text-sm'>
              Connect a channel before this tenant can send.
            </span>
          </span>
          <Button
            size='sm'
            className='shrink-0'
            nativeButton={false}
            render={<Link to={`${base}/settings/channels`} />}
          >
            Connect channel
          </Button>
        </Card>
      )}

      <div className='grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3'>
        <Tile
          label='Subscribers'
          value={stats.subscribers.total}
          tone='sky'
          points={growth}
          delta={{
            current: stats.subscribers.total,
            previous: stats.subscribers.total - stats.subscribers.added,
            upIsGood: true,
          }}
        />
        <Tile
          label='Messages'
          value={stats.messages.total}
          tone='purple'
          points={points((day) => day.messages)}
          delta={{ current: stats.messages.total, previous: stats.previous.messages.total, upIsGood: true }}
        />
        <Tile
          label='Delivered'
          value={delivered}
          tone='blue'
          points={points((day) => day.delivered)}
          delta={{ current: delivered, previous: stats.previous.deliveries.delivered, upIsGood: true }}
        />
        <Tile
          label='Failed'
          value={failed}
          tone='red'
          points={points((day) => day.failed + day.invalid)}
          delta={{
            current: failed,
            previous: stats.previous.deliveries.failed + stats.previous.deliveries.invalid,
            upIsGood: false,
          }}
        />
        <Tile
          label='Events'
          value={stats.events.total}
          tone='amber'
          points={points((day) => day.events)}
          delta={{ current: stats.events.total, previous: stats.previous.events.total, upIsGood: true }}
        />
        <Tile
          label='Runs'
          value={stats.runs.started}
          tone='blue'
          points={points((day) => day.runsStarted)}
          delta={{ current: stats.runs.started, previous: stats.previous.runs.started, upIsGood: true }}
        />
      </div>

      {stats.scheduled.count > 0 && (
        <Card className='flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center'>
          <IconTile icon='IconCalendarClockFilled' size='sm' className='text-fg-2' />
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='font-medium text-fg-4 text-sm'>
              {stats.scheduled.count === 1
                ? '1 message scheduled'
                : `${stats.scheduled.count.toLocaleString('en-US')} messages scheduled`}
            </span>
            {stats.scheduled.nextAt && (
              <span className='text-pretty text-fg-2 text-sm'>
                The next one goes out <Time at={stats.scheduled.nextAt} />.
              </span>
            )}
          </span>
          <Button
            variant='soft'
            size='sm'
            className='shrink-0'
            nativeButton={false}
            render={<Link to={`${base}/messages?status=scheduled`} />}
          >
            View scheduled
          </Button>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>Sent and failed deliveries per {stats.interval}.</CardDescription>
          {stats.deliveries.total > 0 && (
            <CardAction className='gap-3'>
              <Key tone='green'>Sent</Key>
              <Key tone='blue'>Delivered</Key>
              <Key tone='red'>Failed</Key>
              {stats.deliveries.capped > 0 && <Key tone='amber'>Capped</Key>}
            </CardAction>
          )}
        </CardHeader>
        {stats.deliveries.total === 0 ? (
          <EmptyState
            size='sm'
            className='pt-0'
            icon='IconPaperPlaneTopRightFilled'
            title='No deliveries in this period'
          />
        ) : (
          <CardContent className='pt-1 pb-3'>
            <PeriodChart series={stats.series} interval={stats.interval} lines={deliveryLines} />
          </CardContent>
        )}
      </Card>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Events tracked per {stats.interval}.</CardDescription>
          </CardHeader>
          {stats.events.total === 0 ? (
            <EmptyState size='sm' className='pt-0' icon='IconZapFilled' title='No events in this period' />
          ) : (
            <CardContent className='pt-1 pb-3'>
              <PeriodChart
                series={stats.series}
                interval={stats.interval}
                lines={EVENT_LINES}
                height='12rem'
              />
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Runs</CardTitle>
            <CardDescription>Workflow runs started per {stats.interval}.</CardDescription>
            {stats.runs.started > 0 && (
              <CardAction className='gap-3'>
                <Key tone='blue'>Started</Key>
                <Key tone='green'>Completed</Key>
                <Key tone='red'>Failed</Key>
              </CardAction>
            )}
          </CardHeader>
          {stats.runs.started === 0 ? (
            <EmptyState size='sm' className='pt-0' icon='IconAgentsFilled' title='No runs in this period' />
          ) : (
            <CardContent className='pt-1 pb-3'>
              <PeriodChart series={stats.series} interval={stats.interval} lines={RUN_LINES} height='12rem' />
            </CardContent>
          )}
        </Card>
      </div>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Recent messages</CardTitle>
            {messages.length > 0 && (
              <CardAction>
                <Button
                  variant='ghost'
                  size='xs'
                  nativeButton={false}
                  render={<Link to={`${base}/messages`} />}
                >
                  View all
                </Button>
              </CardAction>
            )}
          </CardHeader>
          {messages.length === 0 ? (
            <EmptyState size='sm' icon='IconPaperPlaneTopRightFilled' title='No messages yet' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <MessageRow key={message.id} message={message} base={base} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>New subscribers</CardTitle>
            {subscribers.length > 0 && (
              <CardAction>
                <Button
                  variant='ghost'
                  size='xs'
                  nativeButton={false}
                  render={<Link to={`${base}/subscribers`} />}
                >
                  View all
                </Button>
              </CardAction>
            )}
          </CardHeader>
          {subscribers.length === 0 ? (
            <EmptyState size='sm' icon='IconTeamFilled' title='No subscribers yet' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Subscribed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((subscriber) => (
                  <SubscriberRow key={subscriber.id} subscriber={subscriber} base={base} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Top events</CardTitle>
            {stats.topEvents.length > 0 && (
              <CardAction>
                <Button
                  variant='ghost'
                  size='xs'
                  nativeButton={false}
                  render={<Link to={`${base}/events`} />}
                >
                  View all
                </Button>
              </CardAction>
            )}
          </CardHeader>
          {stats.topEvents.length === 0 ? (
            <EmptyState size='sm' icon='IconZapFilled' title='No events in this period' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className='text-right'>Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topEvents.map((event) => (
                  <TopEventRow key={event.name} event={event} base={base} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Active workflows</CardTitle>
            {stats.workflows.length > 0 && (
              <CardAction>
                <Button
                  variant='ghost'
                  size='xs'
                  nativeButton={false}
                  render={<Link to={`${base}/workflows`} />}
                >
                  View all
                </Button>
              </CardAction>
            )}
          </CardHeader>
          {stats.workflows.length === 0 ? (
            <EmptyState size='sm' icon='IconAgentsFilled' title='No active workflows' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Live runs</TableHead>
                  <TableHead>Last run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.workflows.map((workflow) => (
                  <WorkflowRow key={workflow.slug} workflow={workflow} base={base} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

const TILE_LABELS = ['Subscribers', 'Messages', 'Delivered', 'Failed', 'Events', 'Runs'];

function OverviewSkeleton() {
  const [params] = useSearchParams();
  const hinted = useQuickStart();
  const requested = resolveRange(params.get('range'));
  const interval = resolveInterval(requested.from ? requested : resolveRange(DEFAULT_RANGE));

  if (hinted.quickstart) return <QuickStartSkeleton />;

  return (
    <>
      <div className='grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3'>
        {TILE_LABELS.map((label) => (
          <TileSkeleton key={label} label={label} />
        ))}
      </div>
      <ChartCardSkeleton
        title='Deliveries'
        description={`Sent and failed deliveries per ${interval}.`}
        height='h-56'
      />
      <div className='grid gap-5 lg:grid-cols-2'>
        <ChartCardSkeleton title='Events' description={`Events tracked per ${interval}.`} height='h-40' />
        <ChartCardSkeleton
          title='Runs'
          description={`Workflow runs started per ${interval}.`}
          height='h-40'
        />
      </div>
      <div className='grid gap-5 lg:grid-cols-2'>
        <ListCardSkeleton
          title='Recent messages'
          columns={[
            { label: 'Message', fill: 'h-4 w-40' },
            { label: 'Status', fill: 'h-5 w-16 rounded-full' },
            { label: 'Sent', fill: 'h-4 w-20' },
          ]}
        />
        <ListCardSkeleton
          title='New subscribers'
          columns={[
            { label: 'Subscriber', fill: 'h-4 w-36' },
            { label: 'Channels', fill: 'h-5 w-16 rounded-full' },
            { label: 'Subscribed', fill: 'h-4 w-20' },
          ]}
        />
        <ListCardSkeleton
          title='Top events'
          columns={[
            { label: 'Event', fill: 'h-4 w-40' },
            { label: 'Count', className: 'text-right', fill: 'ml-auto h-4 w-10' },
          ]}
        />
        <ListCardSkeleton
          title='Active workflows'
          columns={[
            { label: 'Workflow', fill: 'h-4 w-36' },
            { label: 'Live runs', fill: 'h-4 w-10' },
            { label: 'Last run', fill: 'h-4 w-20' },
          ]}
        />
      </div>
    </>
  );
}

export default function OverviewRoute({ loaderData }: Route.ComponentProps) {
  const { workspace, apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { overview } = loaderData;
  const base = `/${workspace.slug}`;
  const navigate = useNavigate();
  const sending = useActionFetcher((data) => {
    if (typeof data.id === 'string') void navigate(`${base}/messages/${data.id}`);
  });
  const [view, setView] = useState<OverviewView>('cold');

  return (
    <div className='flex w-full flex-col gap-6'>
      <OverviewHeader
        cold={view === 'cold'}
        quickstart={view === 'cold' ? undefined : view === 'quickstart'}
      />

      <Deferred resolve={overview}>
        {(data) => (
          <OverviewBody data={data} apiUrl={apiUrl} base={base} sending={sending} onView={setView} />
        )}
      </Deferred>
    </div>
  );
}

type OverviewView = 'cold' | 'quickstart' | 'overview';

function OverviewBody({
  data,
  apiUrl,
  base,
  sending,
  onView,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['overview']> | undefined;
  apiUrl: string;
  base: string;
  sending: Sending;
  onView: (view: OverviewView) => void;
}) {
  const view: OverviewView =
    data === undefined ? 'cold' : data.messages.length === 0 ? 'quickstart' : 'overview';
  useEffect(() => {
    onView(view);
  }, [view, onView]);
  if (data === undefined) return <OverviewSkeleton />;
  return <OverviewContent data={data} apiUrl={apiUrl} base={base} sending={sending} />;
}

function OverviewHeader({ cold = false, quickstart }: { cold?: boolean; quickstart?: boolean }) {
  const filters = useFilters(['range'] as const);
  const hinted = useQuickStart();

  if (quickstart ?? hinted.quickstart) {
    return (
      <PageHeader
        title='Quickstart'
        description='Connect a channel, add BuzzKit to your app and send your first message.'
      />
    );
  }

  return (
    <PageHeader
      title='Overview'
      description='Track subscribers, messages, deliveries, events and workflows over time.'
      actions={
        <FilterRange
          presets={Object.entries(RANGES).map(([value, range]) => ({ value, label: range.label }))}
          value={filters.values.range ?? DEFAULT_RANGE}
          onValueChange={(value) => filters.set('range', value ?? DEFAULT_RANGE)}
          allowAny={false}
          disabled={cold}
          loading={filters.pending.range}
        />
      }
    />
  );
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex w-full flex-col gap-6'>
      <OverviewHeader cold />
      <OverviewSkeleton />
    </div>
  ),
};
