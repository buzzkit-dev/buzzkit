import { Avatar } from '@buzzkit/ui/components/avatar';
import { Button } from '@buzzkit/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { Area, AreaChart } from '@buzzkit/ui/components/charts/area-chart';
import { Grid } from '@buzzkit/ui/components/charts/grid';
import { ChartTooltip } from '@buzzkit/ui/components/charts/tooltip/chart-tooltip';
import { XAxis } from '@buzzkit/ui/components/charts/x-axis';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterRange } from '@buzzkit/ui/components/filter-bar';
import { Flag } from '@buzzkit/ui/components/flag';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, MessageStatusBadge, PlatformBadge } from '@/app/components/badges';
import { EventName } from '@/app/components/events/name';
import { BlockSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { LiveRuns } from '@/app/components/workflows/live-runs';
import { RANGES, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import {
  getStats,
  listCredentials,
  listMessages,
  listSubscribers,
  type Message,
  type Stats,
  type Subscriber,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const DEFAULT_RANGE = '7d';

const TILE_PLACEHOLDERS = ['a', 'b', 'c', 'd', 'e', 'f'];

const UTC = { timeZone: 'UTC' } as const;

const AXIS_FORMATS = {
  hour: new Intl.DateTimeFormat('en-US', { hour: 'numeric' }),
  hourDay: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', ...UTC }),
  day: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...UTC }),
  month: new Intl.DateTimeFormat('en-US', { month: 'short', ...UTC }),
  monthLong: new Intl.DateTimeFormat('en-US', { month: 'long', ...UTC }),
};

const TONES = {
  sky: { fill: 'var(--sky-4)', dot: 'bg-sky-4' },
  purple: { fill: 'var(--purple-4)', dot: 'bg-purple-4' },
  green: { fill: 'var(--green-4)', dot: 'bg-green-4' },
  red: { fill: 'var(--red-4)', dot: 'bg-red-4' },
  amber: { fill: 'var(--amber-4)', dot: 'bg-amber-4' },
  blue: { fill: 'var(--blue-4)', dot: 'bg-blue-4' },
} as const;

const DELTA_ICONS: Record<'up' | 'down', { icon: IconName }> = {
  up: { icon: 'IconArrowUpRight' },
  down: { icon: 'IconArrowDownRight' },
};

type AxisPlan = {
  tick: (date: Date, index: number) => boolean;
  label: (date: Date) => string;
  title: (date: Date) => React.ReactNode;
};

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
      return {
        hasChannel: credentials.length > 0,
        stats,
        messages: messages.items,
        subscribers: subscribers.items,
      };
    })(),
  };
}

function dayOf(date: string): Date {
  return new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
}

function shortYear(date: Date): string {
  return `’${String(date.getUTCFullYear()).slice(-2)}`;
}

function Qualified({ qualifier, children }: { qualifier: string; children: React.ReactNode }) {
  return (
    <>
      <span className='text-chart-tooltip-muted'>{qualifier}</span> {children}
    </>
  );
}

function axisPlan(interval: Stats['interval'], count: number): AxisPlan {
  const fromEnd = (_: Date, index: number) => (count - 1 - index) % 2 === 0;
  const monday = (date: Date) => date.getUTCDay() === 1;
  switch (interval) {
    case 'hour': {
      const step = count > 26 ? 8 : 4;
      return {
        tick: (date) => date.getHours() % step === 0,
        label: (date) => AXIS_FORMATS.hour.format(date),
        title: (date) => (
          <Qualified qualifier={AXIS_FORMATS.hourDay.format(date)}>
            {AXIS_FORMATS.hour.format(date)}
          </Qualified>
        ),
      };
    }
    case 'day': {
      const today = new Date().toISOString().slice(0, 10);
      const tick =
        count <= 8
          ? () => true
          : count <= 16
            ? fromEnd
            : count <= 62
              ? monday
              : (date: Date) => monday(date) && Math.floor(date.getTime() / (7 * 86_400_000)) % 2 === 0;
      const label =
        count <= 8
          ? (date: Date) =>
              date.toISOString().slice(0, 10) === today ? 'Today' : AXIS_FORMATS.weekday.format(date)
          : (date: Date) => AXIS_FORMATS.day.format(date);
      return {
        tick,
        label,
        title: (date) => (
          <Qualified qualifier={AXIS_FORMATS.weekday.format(date)}>{AXIS_FORMATS.day.format(date)}</Qualified>
        ),
      };
    }
    case 'week':
      return {
        tick: count <= 10 ? () => true : fromEnd,
        label: (date) => AXIS_FORMATS.day.format(date),
        title: (date) => <Qualified qualifier='Week of'>{AXIS_FORMATS.day.format(date)}</Qualified>,
      };
    case 'month':
      return {
        tick: () => true,
        label: (date) =>
          date.getUTCMonth() === 0
            ? `${AXIS_FORMATS.month.format(date)} ${shortYear(date)}`
            : AXIS_FORMATS.month.format(date),
        title: (date) => `${AXIS_FORMATS.monthLong.format(date)} ${shortYear(date)}`,
      };
  }
}

function Delta({ current, previous, upIsGood }: { current: number; previous: number; upIsGood: boolean }) {
  if (previous === 0 && current === 0) return null;
  const change = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
  const up = current > previous;
  const flat = current === previous;
  const count = `${current >= previous ? '+' : '−'}${Math.abs(current - previous).toLocaleString('en-US')}`;
  const label = change === null ? count : `${Math.abs(change)}% (${count})`;
  const tone = flat ? 'text-fg-2' : up === upIsGood ? 'text-green-4' : 'text-red-4';
  return (
    <span className={cn('flex items-center gap-0.5 font-medium text-sm', tone)}>
      {!flat && <Icon name={DELTA_ICONS[up ? 'up' : 'down'].icon} className='size-3.5 opacity-100' />}
      {label}
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
  tone,
  points,
}: {
  label: string;
  value: number;
  delta: { current: number; previous: number; upIsGood: boolean };
  tone: keyof typeof TONES;
  points: { date: Date; value: number }[];
}) {
  const flat = points.every((point) => point.value === points[0]?.value);
  return (
    <Card className='gap-0 overflow-hidden'>
      <div className='flex flex-col px-4 pt-3.5'>
        <span className='text-fg-2 text-sm'>{label}</span>
        <span className='flex items-center gap-2'>
          <NumberFlow className='font-medium text-2xl text-fg-4 leading-none tracking-tight' value={value} />
          <Delta {...delta} />
        </span>
      </div>
      <div className='h-14'>
        {!flat && (
          <AreaChart
            data={points}
            xDataKey='date'
            margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
            aspectRatio='auto'
            animationDuration={700}
            yDomainTween={false}
            interactive={false}
            className='h-full w-full'
            style={{ height: '100%' }}
          >
            <Area
              dataKey='value'
              fill={TONES[tone].fill}
              stroke={TONES[tone].fill}
              strokeWidth={1.5}
              fillOpacity={0.25}
              gradientToOpacity={0}
              fadeEdges
              showHighlight={false}
            />
          </AreaChart>
        )}
      </div>
    </Card>
  );
}

function Key({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className='flex items-center gap-1.5 text-fg-2 text-xs'>
      <span className={cn('size-2 rounded-full', TONES[tone].dot)} />
      {children}
    </span>
  );
}

type Line = {
  key: string;
  label: string;
  tone: keyof typeof TONES;
  pick: (day: Stats['series'][number]) => number;
};

function PeriodChart({
  series,
  interval,
  lines,
  height = '16rem',
}: {
  series: Stats['series'];
  interval: Stats['interval'];
  lines: Line[];
  height?: string;
}) {
  const plan = useMemo(() => axisPlan(interval, series.length), [interval, series.length]);
  const data = series.map((day) => ({
    date: dayOf(day.date),
    ...Object.fromEntries(lines.map((line) => [line.key, line.pick(day)])),
  }));
  return (
    <AreaChart
      data={data}
      xDataKey='date'
      xDomain={[data[0]!.date, data.at(-1)!.date]}
      margin={{ top: 12, right: 24, bottom: 28, left: 24 }}
      aspectRatio='auto'
      animationDuration={700}
      yDomainTween={false}
      className='w-full'
      style={{ height }}
    >
      <Grid horizontal numTicksRows={3} strokeDasharray='none' />
      {lines.map((line) => (
        <Area
          key={line.key}
          dataKey={line.key}
          fill={TONES[line.tone].fill}
          stroke={TONES[line.tone].fill}
          strokeWidth={2}
          fillOpacity={0.14}
          gradientToOpacity={0}
        />
      ))}
      <XAxis ticks={plan.tick} format={plan.label} tickerHalfWidth={0} offset={6} />
      <ChartTooltip
        showDatePill={false}
        title={(point: Record<string, unknown>) => plan.title(point.date as Date)}
        rows={(point: Record<string, unknown>) =>
          lines.map((line) => ({
            color: TONES[line.tone].fill,
            label: line.label,
            value: Number(point[line.key]),
          }))
        }
      />
    </AreaChart>
  );
}

const DELIVERY_LINES: Line[] = [
  { key: 'sent', label: 'Sent', tone: 'green', pick: (day) => day.sent },
  { key: 'delivered', label: 'Delivered', tone: 'blue', pick: (day) => day.delivered },
  { key: 'failed', label: 'Failed', tone: 'red', pick: (day) => day.failed + day.invalid },
];

const CAPPED_LINE: Line = { key: 'capped', label: 'Capped', tone: 'amber', pick: (day) => day.capped };

const EVENT_LINES: Line[] = [{ key: 'events', label: 'Events', tone: 'amber', pick: (day) => day.events }];

const RUN_LINES: Line[] = [
  { key: 'started', label: 'Started', tone: 'blue', pick: (day) => day.runsStarted },
  { key: 'completed', label: 'Completed', tone: 'green', pick: (day) => day.runsCompleted },
  { key: 'failed', label: 'Failed', tone: 'red', pick: (day) => day.runsFailed },
];

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
function OverviewContent({
  data,
  base,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['overview']>;
  base: string;
}) {
  const { hasChannel, stats, messages, subscribers } = data;

  const sent = stats.deliveries.sent;
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
        <Card className='flex-row items-center gap-3 px-4 py-3'>
          <IconTile icon='IconPaperPlaneTopRightFilled' size='sm' className='text-fg-2' />
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='font-medium text-fg-4 text-sm'>No channel connected</span>
            <span className='text-pretty text-fg-2 text-sm'>
              Connect a channel before this tenant can send.
            </span>
          </span>
          <Button size='sm' nativeButton={false} render={<Link to={`${base}/settings/channels`} />}>
            Connect channel
          </Button>
        </Card>
      )}

      <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
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
          label='Sent'
          value={sent}
          tone='green'
          points={points((day) => day.sent)}
          delta={{ current: sent, previous: stats.previous.deliveries.sent, upIsGood: true }}
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
        <Card className='flex-row items-center gap-3 px-4 py-3'>
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

function OverviewSkeleton() {
  return (
    <>
      <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
        {TILE_PLACEHOLDERS.map((tile) => (
          <BlockSkeleton key={tile} className='h-28 w-full rounded-2xl' />
        ))}
      </div>
      <BlockSkeleton className='h-80 w-full rounded-2xl' />
      <div className='grid gap-5 lg:grid-cols-2'>
        <BlockSkeleton className='h-64 w-full rounded-2xl' />
        <BlockSkeleton className='h-64 w-full rounded-2xl' />
      </div>
    </>
  );
}

export default function OverviewRoute({ loaderData }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { overview } = loaderData;
  const base = `/${workspace.slug}`;
  const filters = useFilters(['range'] as const);

  return (
    <div className='flex w-full flex-col gap-6'>
      <header className='flex items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Overview
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Track subscribers, messages, deliveries, events and workflows over time.
          </p>
        </div>
        <FilterRange
          presets={Object.entries(RANGES).map(([value, range]) => ({ value, label: range.label }))}
          value={filters.values.range ?? DEFAULT_RANGE}
          onValueChange={(value) => filters.set('range', value ?? DEFAULT_RANGE)}
          allowAny={false}
        />
      </header>

      <Deferred resolve={overview}>
        {(data) => (data === undefined ? <OverviewSkeleton /> : <OverviewContent data={data} base={base} />)}
      </Deferred>
    </div>
  );
}
