import { Button } from '@buzzkit/ui/components/button';
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
import { Icon } from '@buzzkit/ui/components/icon';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { EventSourceBadge } from '@/app/components/badges';
import { describeStreamEvent, summarizeData } from '@/app/components/events/stream';
import { VolumeChart } from '@/app/components/events/volume-chart';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { type EventNameDetail, type EventRange, getEventName } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const RANGES: Array<{ value: EventRange; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const DEFAULT_RANGE: EventRange = '7d';

type Field = { key: string; types: string[]; example: string };

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.name} · BuzzKit` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const range = RANGES.find((entry) => entry.value === requestUrl(request).searchParams.get('range'))?.value;

  const detail = await getEventName({ request, env }, token, params.slug, tenant, params.name, {
    range: range ?? DEFAULT_RANGE,
  });

  return { detail, range: range ?? DEFAULT_RANGE };
}

function inferFields(samples: EventNameDetail['samples']): Field[] {
  const fields = new Map<string, { types: Set<string>; example: string }>();
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample.data ?? {})) {
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const entry = fields.get(key) ?? { types: new Set<string>(), example: JSON.stringify(value) };
      entry.types.add(type);
      fields.set(key, entry);
    }
  }
  return [...fields.entries()]
    .map(([key, entry]) => ({ key, types: [...entry.types].sort(), example: entry.example }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className='gap-1 px-4 py-3.5'>
      <span className='text-fg-2 text-sm'>{label}</span>
      <NumberFlow value={value} className='font-medium text-2xl text-fg-4 leading-none tracking-tight' />
    </Card>
  );
}

function SampleRow({
  sample,
  slug,
  expanded,
  onToggle,
}: {
  sample: EventNameDetail['samples'][number];
  slug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = summarizeData(sample.data);
  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell>
          {sample.externalId ? (
            <Link
              to={`/${slug}/subscribers/${encodeURIComponent(sample.externalId)}`}
              onClick={(click) => click.stopPropagation()}
              className='outline-none hover:underline focus-visible:underline'
            >
              <Truncate className='block'>{sample.externalId}</Truncate>
            </Link>
          ) : (
            <span className='text-fg-2'>None</span>
          )}
        </TableCell>
        <TableCell>
          <EventSourceBadge source={sample.source} provider={sample.data?.$provider} />
        </TableCell>
        <TableCell>
          <Truncate className={cn('block', !summary && 'text-fg-2')}>{summary ?? 'No data'}</Truncate>
        </TableCell>
        <TableCell>
          <TimeAgo at={sample.timestamp} />
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={5}>
        <div className='flex flex-col gap-1.5 px-4 py-3'>
          <span className='text-fg-2 text-sm'>Data</span>
          <CodeBlock code={JSON.stringify(sample.data, null, 2)} />
        </div>
      </TableDetail>
    </>
  );
}

export default function EventNameRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { detail, range } = loaderData;
  const { label } = describeStreamEvent({ name: detail.name, data: {} });
  const fields = inferFields(detail.samples);
  const [expanded, setExpanded] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={`/${params.slug}/events`} />}
      >
        Events
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            {label}
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            {label !== detail.name && <span className='font-mono'>{detail.name} · </span>}
            First seen <Time at={detail.firstAt} />, last <TimeAgo at={detail.lastAt} />.
          </p>
        </div>
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
      </header>

      <ScrollFade targetRef={scrollerRef} />
      <div
        ref={scrollerRef}
        className='-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
      >
        <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-4'>
          <Tile label='Last 24 hours' value={detail.counts.last24h} />
          <Tile label='Last 7 days' value={detail.counts.last7d} />
          <Tile label='Last 30 days' value={detail.counts.last30d} />
          <Tile label='Users (7d)' value={detail.subscribers7d} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Volume</CardTitle>
            <CardDescription>
              Events per{' '}
              {detail.volume.bucketSeconds === 3600
                ? 'hour'
                : detail.volume.bucketSeconds === 86400
                  ? 'day'
                  : 'six hours'}
              .
            </CardDescription>
            <CardAction className='gap-1.5'>
              {detail.sources.map((source) =>
                source === 'webhook' && detail.providers.length > 0 ? (
                  detail.providers.map((provider) => (
                    <EventSourceBadge key={provider} source='webhook' provider={provider} />
                  ))
                ) : (
                  <EventSourceBadge key={source} source={source} />
                )
              )}
            </CardAction>
          </CardHeader>
          <CardContent className='pt-1 pb-3'>
            <VolumeChart volume={detail.volume} />
          </CardContent>
        </Card>

        <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]'>
          <Card className='min-w-0'>
            <CardHeader divider className='py-3'>
              <CardTitle>Recent</CardTitle>
            </CardHeader>
            {detail.samples.length === 0 ? (
              <EmptyState size='sm' icon='IconHistoryFilled' title='Nothing recent' />
            ) : (
              <Table className='table-fixed'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-52'>Subscriber</TableHead>
                    <TableHead className='w-32'>Source</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className='w-24'>Time</TableHead>
                    <TableHead className='w-12' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.samples.map((sample) => (
                    <SampleRow
                      key={sample.id}
                      sample={sample}
                      slug={params.slug}
                      expanded={expanded === sample.id}
                      onToggle={() => setExpanded((current) => (current === sample.id ? null : sample.id))}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className='min-w-0'>
            <CardHeader divider className='py-3'>
              <CardTitle>Fields</CardTitle>
            </CardHeader>
            {fields.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconParagraphFilled'
                title='No data fields'
                description='Send a data object with the event to see its fields here.'
              />
            ) : (
              <ul className='flex flex-col divide-y divide-bg-3'>
                {fields.map((field) => (
                  <li key={field.key} className='flex items-center justify-between gap-3 px-4 py-2.5'>
                    <div className='flex min-w-0 flex-col'>
                      <Truncate className='font-medium font-mono text-fg-4 text-sm'>{field.key}</Truncate>
                      <Truncate className='text-fg-2 text-xs'>{field.example}</Truncate>
                    </div>
                    <span className='shrink-0 text-fg-2 text-xs'>{field.types.join(' | ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
