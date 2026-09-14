import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterRange } from '@buzzkit/ui/components/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect } from 'react';
import { Link, useFetcher } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
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
import { RANGES, resolveInterval, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { getPlatformStats, type PlatformStats } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';
import type { loader as ratesLoader } from './rates/index';

const DEFAULT_RANGE = '7d';

const RATES_INTERVAL_MS = 10_000;

const RATE_TILES = [
  { key: 'deliveries', label: 'Deliveries per minute', tone: 'blue' },
  { key: 'messages', label: 'Messages per minute', tone: 'purple' },
  { key: 'events', label: 'Events per minute', tone: 'amber' },
  { key: 'runs', label: 'Runs per minute', tone: 'sky' },
] as const;

const TILE_LABELS = ['Subscribers', 'Messages', 'Delivered', 'Failed', 'Events', 'Runs'];

const LEADERBOARD_SKELETONS = [
  { title: 'Most messages', columns: ['Messages', 'Delivered'] },
  { title: 'Most events', columns: ['Events'] },
  { title: 'Fastest growing', columns: ['Added', 'Total'] },
  { title: 'Newest workspaces', columns: ['Members', 'Subscribers', 'Created'] },
].map((board) => ({
  title: board.title,
  columns: [
    { label: 'Workspace', fill: 'h-4 w-36' },
    ...board.columns.map((label) => ({ label, className: 'text-right', fill: 'ml-auto h-4 w-10' })),
  ],
}));

export function meta() {
  return [{ title: 'Admin · BuzzKit' }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const range = requestUrl(request).searchParams.get('range') ?? DEFAULT_RANGE;
  const window = resolveRange(range);

  return {
    range,
    stats: getPlatformStats({ request, env }, token, window.from ? window : resolveRange(DEFAULT_RANGE)),
  };
}

type Platform = NonNullable<PlatformStats['platform']>;

function WorkspaceCell({ slug, name }: { slug: string; name: string }) {
  return (
    <TableCell className='py-2'>
      <Link to={`/${slug}`} className='flex min-w-0 flex-col outline-none'>
        <Truncate className='font-medium text-fg-4 hover:underline'>{name}</Truncate>
        <Truncate className='text-fg-2 text-xs'>{slug}</Truncate>
      </Link>
    </TableCell>
  );
}

function Count({ value }: { value: number }) {
  return <TableCell className='text-right tabular-nums'>{value.toLocaleString('en-US')}</TableCell>;
}

function Leaderboard<T extends { slug: string; name: string }>({
  title,
  description,
  rows,
  columns,
  empty,
  cells,
}: {
  title: string;
  description: string;
  rows: T[];
  columns: string[];
  empty: string;
  cells: (row: T) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader divider className='py-3'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState size='sm' icon='IconHomeRoundDoorFilled' title={empty} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              {columns.map((column) => (
                <TableHead key={column} className='text-right'>
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.slug}>
                <WorkspaceCell slug={row.slug} name={row.name} />
                {cells(row)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function Leaderboards({ platform }: { platform: Platform }) {
  return (
    <div className='grid gap-5 lg:grid-cols-2'>
      <Leaderboard
        title='Most messages'
        description='Workspaces that sent the most in this period.'
        rows={platform.topWorkspaces}
        columns={['Messages', 'Delivered']}
        empty='No messages in this period'
        cells={(row) => (
          <>
            <Count value={row.messages} />
            <Count value={row.delivered} />
          </>
        )}
      />
      <Leaderboard
        title='Most events'
        description='Workspaces tracking the most events in this period.'
        rows={platform.eventWorkspaces}
        columns={['Events']}
        empty='No events in this period'
        cells={(row) => <Count value={row.events} />}
      />
      <Leaderboard
        title='Fastest growing'
        description='Workspaces that added the most subscribers in this period.'
        rows={platform.growingWorkspaces}
        columns={['Added', 'Total']}
        empty='No new subscribers in this period'
        cells={(row) => (
          <>
            <Count value={row.added} />
            <Count value={row.subscribers} />
          </>
        )}
      />
      <Leaderboard
        title='Newest workspaces'
        description='The last workspaces created, regardless of the selected period.'
        rows={platform.newestWorkspaces}
        columns={['Members', 'Subscribers', 'Created']}
        empty='No workspaces yet'
        cells={(row) => (
          <>
            <Count value={row.members} />
            <Count value={row.subscribers} />
            <TableCell className='text-right'>
              <TimeAgo at={row.createdAt} />
            </TableCell>
          </>
        )}
      />
    </div>
  );
}

function PlatformContent({ stats }: { stats: PlatformStats }) {
  const delivered = stats.deliveries.delivered;
  const failed = stats.deliveries.failed + stats.deliveries.invalid;
  const deliveryLines = stats.deliveries.capped > 0 ? [...DELIVERY_LINES, CAPPED_LINE] : DELIVERY_LINES;
  const points = (pick: (day: PlatformStats['series'][number]) => number) =>
    stats.series.map((day) => ({ date: dayOf(day.date), value: pick(day) }));
  let running = 0;
  const growth = stats.series.map((day) => {
    running += day.subscribers;
    return { date: dayOf(day.date), value: running };
  });

  return (
    <div className='flex w-full flex-col gap-5'>
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

      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            Sent and failed deliveries per {stats.interval}, across every workspace.
          </CardDescription>
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

      {stats.platform && <Leaderboards platform={stats.platform} />}

      <Card>
        <CardHeader divider className='py-3'>
          <CardTitle>Top events</CardTitle>
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
                <TableRow key={event.name}>
                  <TableCell className='font-medium text-fg-4'>
                    <Truncate>{event.name}</Truncate>
                  </TableCell>
                  <Count value={event.count} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function PlatformSkeleton({ range }: { range: string }) {
  const requested = resolveRange(range);
  const interval = resolveInterval(requested.from ? requested : resolveRange(DEFAULT_RANGE));

  return (
    <div className='flex w-full flex-col gap-5'>
      <div className='grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3'>
        {TILE_LABELS.map((label) => (
          <TileSkeleton key={label} label={label} />
        ))}
      </div>
      <ChartCardSkeleton
        title='Deliveries'
        description={`Sent and failed deliveries per ${interval}, across every workspace.`}
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
        {LEADERBOARD_SKELETONS.map((board) => (
          <ListCardSkeleton key={board.title} title={board.title} columns={board.columns} />
        ))}
      </div>
      <ListCardSkeleton
        title='Top events'
        columns={[
          { label: 'Event', fill: 'h-4 w-40' },
          { label: 'Count', className: 'text-right', fill: 'ml-auto h-4 w-10' },
        ]}
      />
    </div>
  );
}

function RatesRow() {
  const rates = useFetcher<typeof ratesLoader>();
  const idle = rates.state === 'idle';
  const load = rates.load;
  const data = rates.data;

  useEffect(() => {
    void load('/admin/rates');
  }, [load]);

  useEffect(() => {
    if (!idle) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') void load('/admin/rates');
    };
    const timer = setInterval(refresh, RATES_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [idle, load]);

  return (
    <div className='grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4'>
      {RATE_TILES.map((tile) =>
        data ? (
          <Tile
            key={tile.key}
            label={tile.label}
            value={data[tile.key].perMinute}
            tone={tile.tone}
            points={data[tile.key].series.map((entry) => ({
              date: new Date(entry.minute),
              value: entry.count,
            }))}
          />
        ) : (
          <TileSkeleton key={tile.key} label={tile.label} />
        )
      )}
    </div>
  );
}

export default function PlatformOverviewRoute({ loaderData }: Route.ComponentProps) {
  const { range, stats } = loaderData;
  const filters = useFilters(['range'] as const);

  return (
    <div className='flex w-full flex-col gap-5'>
      <PageHeader
        title='Overview'
        description='What every workspace on this deployment is doing.'
        actions={
          <FilterRange
            presets={Object.entries(RANGES).map(([value, entry]) => ({ value, label: entry.label }))}
            value={filters.values.range ?? DEFAULT_RANGE}
            onValueChange={(value) => filters.set('range', value ?? DEFAULT_RANGE)}
            allowAny={false}
            loading={filters.pending.range}
          />
        }
      />
      <RatesRow />
      <Deferred resolve={stats}>
        {(data) =>
          data === undefined ? <PlatformSkeleton range={range} /> : <PlatformContent stats={data} />
        }
      </Deferred>
    </div>
  );
}
