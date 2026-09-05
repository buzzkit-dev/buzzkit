import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import {
  FilterBar,
  FilterClear,
  FilterRange,
  FilterSearch,
  FilterSelect,
} from '@buzzkit/ui/components/filter-bar';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useState } from 'react';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { DetailRow } from '@/app/components/detail/row';
import { describeEvent, EVENT_GROUPS, EVENT_NAMES } from '@/app/components/events/describe';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { RANGES, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { type AuditEvent, type AuditQuery, listAuditEvents } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const FILTER_KEYS = ['event', 'actor', 'range'] as const;

const ACTORS: { value: NonNullable<AuditQuery['actorType']>; label: string; icon: IconName }[] = [
  { value: 'member', label: 'Member', icon: 'IconUserFilled' },
  { value: 'key', label: 'API key', icon: 'IconKeyholeFilled' },
  { value: 'user', label: 'Subscriber', icon: 'IconPeopleFilled' },
  { value: 'system', label: 'BuzzKit', icon: 'IconBuzzkit' },
];

const TARGETS: Record<string, { label: string; icon: IconName }> = {
  workspace: { label: 'Workspace', icon: 'IconHomeRoundDoorFilled' },
  member: { label: 'Member', icon: 'IconUserFilled' },
  invite: { label: 'Invite', icon: 'IconInviteFilled' },
  key: { label: 'API key', icon: 'IconKeyholeFilled' },
  tenant: { label: 'Tenant', icon: 'IconBuildingsFilled' },
  credential: { label: 'Credential', icon: 'IconShieldFilled' },
  subscriber: { label: 'Subscriber', icon: 'IconPeopleFilled' },
  subscription: { label: 'Subscription', icon: 'IconPhoneFilled' },
  topic: { label: 'Topic', icon: 'IconTagFilled' },
  message: { label: 'Message', icon: 'IconPaperPlaneTopRightFilled' },
};

const COLUMNS: TableColumn[] = [
  {
    label: 'Event',
    className: 'w-56',
    content: (
      <span className='flex items-center gap-2'>
        <Skeleton className='size-4 shrink-0 rounded-md' />
        <Skeleton className='h-4 w-32' />
      </span>
    ),
  },
  { label: 'Details', fill: 'h-4 w-64' },
  { label: 'Actor', className: 'w-52', fill: 'h-4 w-32' },
  { label: 'Target', className: 'w-52', fill: 'h-4 w-32' },
  { label: 'Time', className: 'w-16', fill: 'h-4 w-12' },
  { key: 'actions', label: 'Actions', hidden: true, className: 'w-12', fill: 'h-4 w-4' },
];

export function meta() {
  return [{ title: 'Audit log · BuzzKit' }];
}

export function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const search = requestUrl(request).searchParams;
  const event = EVENT_NAMES.find((name) => name === search.get('event'));
  const actorType = ACTORS.find((actor) => actor.value === search.get('actor'))?.value;
  const query: AuditQuery = {
    ...readPage(request),
    q: search.get('q')?.trim() || undefined,
    event,
    actorType,
    ...resolveRange(search.get('range')),
  };
  const filtered = Boolean(query.q || event || actorType || query.from);

  return {
    filtered,
    events: (async () => {
      const page = await listAuditEvents({ request, env }, token, params.slug, query);
      return paginate(request, page);
    })(),
  };
}

function targetOf(
  event: AuditEvent,
  slug: string
): { label: string; icon: IconName; id: string; href: string | null } | null {
  if (!event.targetType || !event.targetId) return null;
  const data = (event.data ?? {}) as { externalId?: unknown };
  const externalId = typeof data.externalId === 'string' ? data.externalId : null;
  const kind = TARGETS[event.targetType] ?? { label: event.targetType, icon: 'IconCircleDashedFilled' };
  switch (event.targetType) {
    case 'subscriber':
    case 'subscription':
      return {
        ...kind,
        id: externalId ?? event.targetId,
        href: externalId ? `/${slug}/subscribers/${encodeURIComponent(externalId)}` : null,
      };
    case 'message':
      return { ...kind, id: event.targetId, href: `/${slug}/messages/${event.targetId}` };
    case 'topic':
      return { ...kind, id: event.targetId, href: `/${slug}/topics` };
    case 'key':
      return { ...kind, id: event.targetId, href: `/${slug}/keys` };
    default:
      return { ...kind, id: event.targetId, href: null };
  }
}

function Glyph({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      <Icon name={icon} className='size-4 shrink-0 text-fg-2' />
      <Truncate>{children}</Truncate>
    </span>
  );
}

function Actor({ event }: { event: AuditEvent }) {
  const actor = ACTORS.find((entry) => entry.value === event.actorType) ?? ACTORS[3]!;
  return <Glyph icon={actor.icon}>{event.actorType === 'system' ? 'BuzzKit' : event.actorDisplay}</Glyph>;
}

function Target({ target }: { target: NonNullable<ReturnType<typeof targetOf>> }) {
  return (
    <Glyph icon={target.icon}>
      {target.href ? (
        <Link
          to={target.href}
          onClick={(click) => click.stopPropagation()}
          className='outline-none hover:underline focus-visible:underline'
        >
          {target.id}
        </Link>
      ) : (
        target.id
      )}
    </Glyph>
  );
}

function EventRow({
  event,
  slug,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  slug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { label, icon, detail } = describeEvent(event);
  const target = targetOf(event, slug);
  const data = event.data && typeof event.data === 'object' ? event.data : null;

  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell className='font-medium text-fg-4'>
          <Glyph icon={icon}>{label}</Glyph>
        </TableCell>
        <TableCell>
          <Truncate className={cn('block', !detail && 'text-fg-2')}>{detail ?? event.event}</Truncate>
        </TableCell>
        <TableCell>
          <Actor event={event} />
        </TableCell>
        <TableCell>{target ? <Target target={target} /> : <span className='text-fg-2'>None</span>}</TableCell>
        <TableCell>
          <TimeAgo at={event.createdAt} />
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={6}>
        <dl className='flex flex-col'>
          <DetailRow label='Event' copy={event.event}>
            {event.event}
          </DetailRow>
          <DetailRow label='Event id' copy={event.id}>
            {event.id}
          </DetailRow>
          <DetailRow label='Actor' copy={event.actorType === 'system' ? undefined : event.actorDisplay}>
            <Actor event={event} />
          </DetailRow>
          <DetailRow label='Target' copy={target?.id}>
            {target ? (
              <span className='flex min-w-0 items-center gap-1.5'>
                <Target target={target} />
                <span className='text-fg-2'>{target.label}</span>
              </span>
            ) : (
              <span className='text-fg-2'>None</span>
            )}
          </DetailRow>
          <DetailRow label='Request id' copy={event.requestId ?? undefined}>
            {event.requestId ?? <span className='text-fg-2'>None</span>}
          </DetailRow>
          <DetailRow label='IP address' copy={event.ip ?? undefined}>
            {event.ip ?? <span className='text-fg-2'>None</span>}
          </DetailRow>
          <DetailRow label='Client' copy={event.userAgent ?? undefined}>
            {event.userAgent ? (
              <Truncate>{event.userAgent}</Truncate>
            ) : (
              <span className='text-fg-2'>None</span>
            )}
          </DetailRow>
        </dl>
        <div className='flex flex-col gap-1.5 border-bg-3 border-t px-4 py-3'>
          <span className='text-fg-2 text-sm'>Data</span>
          {data ? (
            <CodeBlock code={JSON.stringify(data, null, 2)} />
          ) : (
            <span className='text-fg-2 text-sm'>None</span>
          )}
        </div>
      </TableDetail>
    </>
  );
}

export default function AuditLogRoute({ loaderData, params }: Route.ComponentProps) {
  const { events, filtered } = loaderData;
  const [expanded, setExpanded] = useState<string | null>(null);
  const filters = useFilters(FILTER_KEYS);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <AuditLogHeader />

      <Deferred resolve={events}>
        {(data) => {
          const cold = data === undefined;
          const items = data?.items ?? [];
          const fresh = data !== undefined && !filtered && items.length === 0;
          if (cold) return <AuditLogSkeleton />;
          return (
            <>
              <AuditLogFilters cold={cold} />

              <Card className='min-h-0 shrink'>
                {fresh ? (
                  <EmptyState
                    icon='IconHistoryFilled'
                    title='No changes yet'
                    description='Every change made from the dashboard, the API or BuzzKit itself is recorded here as it happens.'
                    className='py-10'
                  />
                ) : items.length === 0 ? (
                  <EmptyState
                    icon='IconHistoryFilled'
                    title='No changes match'
                    description='Nothing recorded in this workspace matches these filters.'
                    className='py-10'
                  >
                    <Button variant='soft' onClick={filters.clear}>
                      Clear filters
                    </Button>
                  </EmptyState>
                ) : (
                  <Table className='table-fixed'>
                    <TableColumns columns={COLUMNS} />
                    <TableBody>
                      {items.map((event) => (
                        <EventRow
                          key={event.id}
                          event={event}
                          slug={params.slug}
                          expanded={expanded === event.id}
                          onToggle={() => setExpanded((current) => (current === event.id ? null : event.id))}
                        />
                      ))}
                    </TableBody>
                    <TablePagination {...data.pagination} />
                  </Table>
                )}
              </Card>
            </>
          );
        }}
      </Deferred>
    </div>
  );
}

function AuditLogHeader() {
  return <PageHeader title='Audit log' description='Review every change made to this workspace.' />;
}

function AuditLogFilters({ cold }: { cold: boolean }) {
  const filters = useFilters(FILTER_KEYS);

  return (
    <FilterBar>
      <FilterSelect
        label='Event'
        value={filters.values.event}
        options={EVENT_GROUPS.map((group) => ({
          label: group.label,
          options: Object.entries(group.events).map(([value, definition]) => ({
            value,
            label: definition.label,
          })),
        }))}
        onValueChange={(value) => filters.set('event', value)}
        disabled={cold}
      />
      <FilterSelect
        label='Actor'
        value={filters.values.actor as (typeof ACTORS)[number]['value'] | null}
        options={ACTORS.map((actor) => ({ value: actor.value, label: actor.label }))}
        onValueChange={(value) => filters.set('actor', value)}
        disabled={cold}
      />
      <FilterRange
        presets={Object.entries(RANGES).map(([value, range]) => ({ value, label: range.label }))}
        value={filters.values.range}
        onValueChange={(value) => filters.set('range', value)}
        disabled={cold}
      />
      {filters.active && <FilterClear onClick={filters.clear} disabled={cold} />}
      <FilterSearch
        value={filters.search}
        onChange={(change) => filters.setSearch(change.target.value)}
        loading={filters.searching || cold}
        placeholder='Search the audit log'
        aria-label='Search the audit log'
      />
    </FilterBar>
  );
}

function AuditLogSkeleton() {
  return (
    <>
      <AuditLogFilters cold />
      <TableSkeleton columns={COLUMNS} />
    </>
  );
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <AuditLogHeader />
      <AuditLogSkeleton />
    </div>
  ),
};
