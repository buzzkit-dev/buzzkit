import { SOURCE_PRESETS, type SourceProvider } from '@buzzkit/schema/sources';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterBar, FilterClear, FilterSelect } from '@buzzkit/ui/components/filter-bar';
import { Icon } from '@buzzkit/ui/components/icon';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { EventSourceBadge } from '@/app/components/badges';
import { EventName } from '@/app/components/events/name';
import {
  describeStreamEvent,
  SOURCE_LABELS,
  type StreamSource,
  summarizeData,
} from '@/app/components/events/stream';
import { providerLabel } from '@/app/components/sources/describe';
import { useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import {
  type EventQuery,
  type EventsToken,
  getEventsToken,
  listEventNames,
  listEvents,
  type StreamEvent,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { PAGE_SIZE, paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '../../layout';
import type { Route } from './+types/index';

const FILTER_KEYS = ['event', 'source'] as const;

const SOURCES = Object.keys(SOURCE_LABELS) as StreamSource[];

const LIVE_INTERVAL_MS = 3000;

type LiveEvent = Omit<StreamEvent, 'runId' | 'messageId'> & {
  runId: string | null;
  messageId: string | null;
};

type LiveRow = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  external_id: string;
  timestamp: string;
  received_at: string;
  data: string;
  run_id: string | null;
  message_id: string | null;
  step: string | null;
};

export function meta() {
  return [{ title: 'Stream · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const page = readPage(request);
  const requested = search.get('source')?.trim() || undefined;
  const provider = requested && SOURCE_PRESETS[requested as SourceProvider] ? requested : undefined;
  const source = provider ? 'webhook' : SOURCES.find((entry) => entry === requested);
  const query: EventQuery = {
    ...page,
    name: search.get('event')?.trim() || undefined,
    source,
    provider,
  };

  const [events, names, live] = await Promise.all([
    listEvents(ctx, token, params.slug, tenant, query),
    listEventNames(ctx, token, params.slug, tenant),
    page.cursor ? null : getEventsToken(ctx, token, params.slug, tenant),
  ]);

  const seenSources = new Set<string>();
  for (const entry of names) {
    for (const seen of entry.sources) {
      if (seen !== 'webhook') seenSources.add(seen);
      else if (entry.providers.length > 0) for (const each of entry.providers) seenSources.add(each);
      else seenSources.add('webhook');
    }
  }
  const sourceOptions = [...seenSources].sort().map((value) => ({
    value,
    label: SOURCE_PRESETS[value as SourceProvider]
      ? providerLabel(value)
      : (SOURCE_LABELS[value as StreamSource] ?? value),
  }));
  return {
    ...paginate(request, events),
    names: names.map((entry) => entry.name),
    sourceOptions,
    filter: { name: query.name ?? null, source: query.source ?? null, provider: query.provider ?? null },
    live,
  };
}

function clickHouseTime(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '');
}

function isoTime(value: string): string {
  return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
}

async function fetchNewer(
  token: EventsToken,
  after: { receivedAt: string; id: string | null },
  filter: { name: string | null; source: string | null; provider: string | null }
): Promise<LiveEvent[]> {
  const url = new URL(`${token.url}/v0/pipes/event_recent.json`);
  url.searchParams.set('tenant_id', '0');
  url.searchParams.set('after', clickHouseTime(after.receivedAt));
  if (after.id) url.searchParams.set('after_id', after.id);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (filter.name) url.searchParams.set('name', filter.name);
  if (filter.source) url.searchParams.set('source', filter.source);
  if (filter.provider) url.searchParams.set('provider', filter.provider);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
  if (!response.ok) return [];
  const { data } = (await response.json()) as { data: LiveRow[] };
  return data.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    name: row.name,
    source: row.source,
    externalId: row.external_id,
    timestamp: isoTime(row.timestamp),
    receivedAt: isoTime(row.received_at),
    data: JSON.parse(row.data) as Record<string, unknown>,
    runId: row.run_id,
    messageId: row.message_id,
    step: row.step,
  }));
}

function newestOf(events: { receivedAt: string; id: string }[]): { receivedAt: string; id: string | null } {
  const first = events[0];
  return first
    ? { receivedAt: first.receivedAt, id: first.id }
    : { receivedAt: new Date(0).toISOString(), id: null };
}

function useLiveEvents(
  initial: StreamEvent[],
  token: EventsToken | null,
  filter: { name: string | null; source: string | null; provider: string | null }
) {
  const [events, setEvents] = useState<LiveEvent[]>(initial);
  const newest = useRef(newestOf(initial));

  useEffect(() => {
    setEvents(initial);
    newest.current = newestOf(initial);
  }, [initial]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const tick = async () => {
      const fresh = await fetchNewer(token, newest.current, filter);
      if (!active || fresh.length === 0) return;
      newest.current = newestOf(fresh);
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [...fresh.filter((event) => !seen.has(event.id)), ...current].slice(0, PAGE_SIZE);
      });
    };
    void tick();
    const timer = setInterval(tick, LIVE_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, filter]);

  return events;
}

function EventRow({
  event,
  slug,
  expanded,
  onToggle,
}: {
  event: LiveEvent;
  slug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = summarizeData(event.data);
  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell>
          <EventName name={event.name} data={event.data} />
        </TableCell>
        <TableCell>
          {event.externalId ? (
            <Link
              to={`/${slug}/subscribers/${encodeURIComponent(event.externalId)}`}
              onClick={(click) => click.stopPropagation()}
              className='outline-none hover:underline focus-visible:underline'
            >
              <Truncate className='block'>{event.externalId}</Truncate>
            </Link>
          ) : (
            <span className='text-fg-2'>None</span>
          )}
        </TableCell>
        <TableCell className='py-2'>
          <EventSourceBadge source={event.source} provider={event.data?.$provider} />
        </TableCell>
        <TableCell>
          <Truncate className={cn('block', !summary && 'text-fg-2')}>{summary ?? 'No data'}</Truncate>
        </TableCell>
        <TableCell>
          <TimeAgo at={event.timestamp} />
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={6}>
        <div className='flex flex-col gap-1.5 px-4 py-3'>
          <span className='text-fg-2 text-sm'>Data</span>
          <CodeBlock code={JSON.stringify(event.data, null, 2)} />
        </div>
      </TableDetail>
    </>
  );
}

export default function StreamRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { items, pagination, names, sourceOptions, filter, live } = loaderData;
  const fresh = names.length === 0;
  const [expanded, setExpanded] = useState<string | null>(null);
  const filters = useFilters(FILTER_KEYS);
  const events = useLiveEvents(items, live, filter);
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
          <h1 className='flex items-center gap-2.5 text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Stream
            {live && <LivePing />}
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Every event as it arrives, newest first.
          </p>
        </div>
      </header>

      {!fresh && (
        <FilterBar>
          <FilterSelect
            label='Event'
            value={filters.values.event}
            options={names.map((name) => ({
              value: name,
              label: describeStreamEvent({ name, data: {} }).label,
            }))}
            onValueChange={(value) => filters.set('event', value)}
          />
          <FilterSelect
            label='Source'
            value={filters.values.source}
            options={sourceOptions}
            onValueChange={(value) => filters.set('source', value)}
          />
          {filters.active && <FilterClear onClick={filters.clear} />}
        </FilterBar>
      )}

      <Card className='min-h-0 shrink'>
        {fresh ? (
          <EmptyState
            icon='IconHistoryFilled'
            title='No events yet'
            description='Track one from your server or the app and it shows up here within seconds.'
            className='py-10'
          >
            <CodeBlock code={snippet} className='max-w-xl text-left' />
          </EmptyState>
        ) : events.length === 0 ? (
          <EmptyState
            icon='IconHistoryFilled'
            title='No events match'
            description='Nothing tracked on this tenant matches these filters.'
            className='py-10'
          >
            <Button variant='soft' onClick={filters.clear}>
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-64'>Event</TableHead>
                <TableHead className='w-44'>Subscriber</TableHead>
                <TableHead className='w-32'>Source</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className='w-24'>Time</TableHead>
                <TableHead className='w-12' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  slug={params.slug}
                  expanded={expanded === event.id}
                  onToggle={() => setExpanded((current) => (current === event.id ? null : event.id))}
                />
              ))}
            </TableBody>
            <TablePagination {...pagination} />
          </Table>
        )}
      </Card>
    </div>
  );
}
