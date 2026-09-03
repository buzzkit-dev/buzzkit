import { Badge } from '@buzzkit/ui/components/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { EventSourceBadge } from '@/app/components/badges';
import { EventName } from '@/app/components/events/name';
import { VolumeChart } from '@/app/components/events/volume-chart';
import { BlockSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { TIME_TOOLTIP_DELAY, TimeAgo } from '@/app/hooks/use-time-ago';
import { type EventRange, getEventVolume, listEventNames } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '../layout';
import type { Route } from './+types/index';

const RANGES: Array<{ value: EventRange; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const DEFAULT_RANGE: EventRange = '7d';

const COLUMNS: TableColumn[] = [
  { label: 'Event', fill: 'h-5 w-44' },
  { label: 'Last 24h', className: 'w-24', fill: 'h-4 w-10' },
  { label: 'Last 7d', className: 'w-24', fill: 'h-4 w-10' },
  { label: 'Users (7d)', className: 'w-28', fill: 'h-4 w-10' },
  { label: 'Sources', className: 'w-52', fill: 'h-5 w-20 rounded-full' },
  { label: 'Last seen', className: 'w-28', fill: 'h-4 w-16' },
];

export function meta() {
  return [{ title: 'Events · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const range = RANGES.find((entry) => entry.value === requestUrl(request).searchParams.get('range'))?.value;

  return {
    range: range ?? DEFAULT_RANGE,
    results: (async () => {
      const [names, volume] = await Promise.all([
        listEventNames(ctx, token, params.slug, tenant),
        getEventVolume(ctx, token, params.slug, tenant, { range: range ?? DEFAULT_RANGE }),
      ]);
      return { names, volume };
    })(),
  };
}

function SourcesCell({ sources, providers }: { sources: string[]; providers: string[] }) {
  const render = (className?: string) =>
    sources.flatMap((source) =>
      source === 'webhook' && providers.length > 0
        ? providers.map((provider) => (
            <EventSourceBadge key={provider} source='webhook' provider={provider} className={className} />
          ))
        : [<EventSourceBadge key={source} source={source} className={className} />]
    );
  const badges = render();
  if (badges.length <= 2) return <span className='flex gap-1'>{badges}</span>;
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger render={<span className='inline-flex cursor-default items-center gap-1' />}>
          {badges[0]}
          <Badge size='sm'>+{badges.length - 1} sources</Badge>
        </TooltipTrigger>
        <TooltipContent className='p-2'>
          <span className='flex max-w-xs flex-wrap gap-1'>{render('bg-background/15 text-background')}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function EventsRoute({ loaderData, params }: Route.ComponentProps) {
  const { range, results } = loaderData;
  const { apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const navigate = useNavigate();
  const snippet = [
    `curl -X POST ${apiUrl}/v1/events \\`,
    "  -H 'Authorization: Bearer bk_ws_…' \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "externalId": "user_42", "name": "workout.completed", "data": { "duration": 42 } }'`,
  ].join('\n');

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Events
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Every event your app and server track, and how often.
          </p>
        </div>
      </header>

      <Deferred resolve={results}>
        {(data) => {
          const names = data?.names ?? [];
          if (data !== undefined && names.length === 0) {
            return (
              <Card>
                <EmptyState
                  icon='IconHistoryFilled'
                  title='No events yet'
                  description='Track one from your server or the app and it shows up here within seconds.'
                  className='py-10'
                >
                  <CodeBlock code={snippet} className='max-w-xl text-left' />
                </EmptyState>
              </Card>
            );
          }
          return (
            <>
              {data === undefined ? (
                <BlockSkeleton className='h-56 w-full shrink-0 rounded-2xl' />
              ) : (
                <Card className='shrink-0'>
                  <CardHeader>
                    <CardTitle>Volume</CardTitle>
                    <CardDescription>
                      Events per{' '}
                      {data.volume.bucketSeconds === 3600
                        ? 'hour'
                        : data.volume.bucketSeconds === 86400
                          ? 'day'
                          : 'six hours'}
                      .
                    </CardDescription>
                    <CardAction>
                      <PillTabs
                        items={RANGES}
                        value={range}
                        itemClassName='h-6.5 px-2.5 text-xs'
                        onValueChange={(value) =>
                          navigate(value === DEFAULT_RANGE ? '.' : `?range=${value}`, {
                            replace: true,
                            preventScrollReset: true,
                          })
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent className='pt-1 pb-3'>
                    <VolumeChart volume={data.volume} />
                  </CardContent>
                </Card>
              )}

              {data === undefined ? (
                <TableSkeleton columns={COLUMNS} rows={8} />
              ) : (
                <Card className='min-h-0 shrink'>
                  <Table className='table-fixed'>
                    <TableColumns columns={COLUMNS} />
                    <TableBody>
                      {names.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell>
                            <Link
                              to={`/${params.slug}/events/${encodeURIComponent(entry.name)}`}
                              className='flex min-w-0 outline-none focus-visible:underline'
                            >
                              <EventName name={entry.name} />
                            </Link>
                          </TableCell>
                          <TableCell className='tabular-nums'>
                            <NumberFlow value={entry.counts.last24h} className='leading-none' />
                          </TableCell>
                          <TableCell className='tabular-nums'>
                            <NumberFlow value={entry.counts.last7d} className='leading-none' />
                          </TableCell>
                          <TableCell className='tabular-nums'>
                            <NumberFlow value={entry.subscribers7d} className='leading-none' />
                          </TableCell>
                          <TableCell className='py-2'>
                            <SourcesCell sources={entry.sources} providers={entry.providers} />
                          </TableCell>
                          <TableCell>
                            <TimeAgo at={entry.lastAt} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          );
        }}
      </Deferred>
    </div>
  );
}
