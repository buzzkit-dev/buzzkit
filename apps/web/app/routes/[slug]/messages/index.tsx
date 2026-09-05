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
import { Icon } from '@buzzkit/ui/components/icon';
import { Table, TableBody, TableCell, TablePagination, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, MessageStatusBadge } from '@/app/components/badges';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { Funnel } from '@/app/components/messages/funnel';
import { Recipients } from '@/app/components/messages/recipients';
import { SendDialog } from '@/app/components/messages/send-dialog';
import { describeTarget } from '@/app/components/messages/target';
import { RANGES, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { messagesAction } from '@/app/lib/actions/messages.server';
import {
  listMessages,
  listSegments,
  listTopics,
  type Message,
  type MessageQuery,
} from '@/app/lib/api.server';
import { CHANNEL_OPTIONS, type Channel } from '@/app/lib/channels';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const FILTER_KEYS = ['status', 'channel', 'topic', 'range'] as const;

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Sending' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
] as const;

const COLUMNS: TableColumn[] = [
  { label: 'Message', fill: 'h-4 w-48' },
  { label: 'Channel', fill: 'h-5 w-14 rounded-full' },
  { label: 'To', fill: 'h-4 w-28' },
  { label: 'Status', fill: 'h-5 w-20 rounded-full' },
  { label: 'Deliveries', fill: 'h-4 w-24' },
  { label: 'Sent', fill: 'h-4 w-16' },
];

export function meta() {
  return [{ title: 'Messages · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const status = STATUS_OPTIONS.find((option) => option.value === search.get('status'))?.value;
  const channel = CHANNEL_OPTIONS.find((option) => option.value === search.get('channel'))?.value;
  const query: MessageQuery = {
    ...readPage(request),
    q: search.get('q')?.trim() || undefined,
    status,
    channel,
    topic: search.get('topic') || undefined,
    ...resolveRange(search.get('range')),
  };
  const filtered = Boolean(query.q || status || channel || query.topic || query.from);

  return {
    filtered,
    results: (async () => {
      const [page, topics, segments] = await Promise.all([
        listMessages(ctx, token, params.slug, tenant, query),
        listTopics(ctx, token, params.slug, tenant, { limit: 100 }),
        listSegments(ctx, token, params.slug, tenant),
      ]);
      return { ...paginate(request, page), topics: topics.items, segments };
    })(),
  };
}

export const action = messagesAction;

function sendSnippet(apiUrl: string) {
  return [
    `curl -X POST ${apiUrl}/v1/messages \\`,
    "  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "to": "user_42", "title": "Leg day", "body": "Let\\'s go." }'`,
  ].join('\n');
}

function MessageRow({ message, base }: { message: Message; base: string }) {
  const payload = message.payload as { title?: string; body?: string };
  const target = describeTarget(message.targets);

  return (
    <TableRow>
      <TableCell className='max-w-96 py-2'>
        <Link
          to={`${base}/${message.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate className='font-medium text-fg-4'>{payload.title ?? 'Untitled'}</Truncate>
          {payload.body && <Truncate className='text-fg-2 text-xs'>{payload.body}</Truncate>}
        </Link>
      </TableCell>
      <TableCell>
        <ChannelBadge channel={message.channel} />
      </TableCell>
      <TableCell className='max-w-56'>
        <Recipients list={target.list}>
          <span className='flex min-w-0 items-center gap-1.5'>
            <Icon name={target.icon} className={`${target.nudge} size-4 shrink-0 text-fg-2`} />
            <Truncate>{target.text}</Truncate>
          </span>
        </Recipients>
      </TableCell>
      <TableCell>
        <MessageStatusBadge status={message.status} />
      </TableCell>
      <TableCell>
        <Funnel counts={message.counts} status={message.status} schedule={message.schedule} />
      </TableCell>
      <TableCell>
        {message.status === 'scheduled' && message.scheduledFor ? (
          <Time at={message.scheduledFor} />
        ) : (
          <TimeAgo at={message.createdAt} />
        )}
      </TableCell>
    </TableRow>
  );
}

export default function MessagesRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl, connected } = useOutletContext<WorkspaceOutletContext>();
  const { filtered, results } = loaderData;
  const base = `/${params.slug}/messages`;
  const [open, setOpen] = useState(false);
  const filters = useFilters(FILTER_KEYS);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <MessagesHeader onSend={() => setOpen(true)} />

      <Deferred resolve={results}>
        {(data) => {
          const cold = data === undefined;
          const messages = data?.items ?? [];
          const topics = data?.topics ?? [];
          const segments = data?.segments ?? [];
          const fresh = data !== undefined && !filtered && messages.length === 0;
          if (cold) return <MessagesSkeleton connected={connected} />;
          return (
            <>
              {!fresh && <MessagesFilters topics={topics} connected={connected} cold={cold} />}

              <Card className='min-h-0 shrink'>
                {fresh ? (
                  <EmptyState
                    icon='IconPaperPlaneTopRightFilled'
                    title='No messages yet'
                    description='Send one from your backend, or a test message from here, and it appears with every delivery.'
                    className='py-10'
                  >
                    <CodeBlock className='w-full max-w-xl text-left' code={sendSnippet(apiUrl)} />
                  </EmptyState>
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon='IconPaperPlaneTopRightFilled'
                    title='No messages match'
                    description='Nothing sent from this workspace matches these filters.'
                    className='py-10'
                  >
                    <Button variant='soft' onClick={filters.clear}>
                      Clear filters
                    </Button>
                  </EmptyState>
                ) : (
                  <Table>
                    <TableColumns columns={COLUMNS} />
                    <TableBody>
                      {messages.map((message) => (
                        <MessageRow key={message.id} message={message} base={base} />
                      ))}
                    </TableBody>
                    <TablePagination {...data.pagination} />
                  </Table>
                )}
              </Card>

              <SendDialog
                topics={topics}
                segments={segments}
                channels={connected}
                messagesBase={base}
                open={open}
                onOpenChange={setOpen}
              />
            </>
          );
        }}
      </Deferred>
    </div>
  );
}

function MessagesHeader({ onSend }: { onSend?: () => void }) {
  return (
    <PageHeader
      title='Messages'
      description='Inspect every message sent from this workspace.'
      actions={
        <Button icon='IconPaperPlaneTopRightFilled' onClick={onSend}>
          Send test message
        </Button>
      }
    />
  );
}

function MessagesFilters({
  topics,
  connected,
  cold,
}: {
  topics: Array<{ slug: string; name: string }>;
  connected: Channel[] | null;
  cold: boolean;
}) {
  const filters = useFilters(FILTER_KEYS);

  return (
    <FilterBar>
      <FilterSelect
        label='Status'
        value={filters.values.status as (typeof STATUS_OPTIONS)[number]['value'] | null}
        options={[...STATUS_OPTIONS]}
        onValueChange={(value) => filters.set('status', value)}
        disabled={cold}
      />
      {connected && connected.length > 1 && (
        <FilterSelect
          label='Channel'
          value={filters.values.channel as Channel | null}
          options={CHANNEL_OPTIONS.filter((option) => connected.includes(option.value))}
          onValueChange={(value) => filters.set('channel', value)}
          disabled={cold}
        />
      )}
      {topics.length > 0 && (
        <FilterSelect
          label='Topic'
          value={filters.values.topic}
          options={topics.map((topic) => ({ value: topic.slug, label: topic.name }))}
          onValueChange={(value) => filters.set('topic', value)}
          disabled={cold}
        />
      )}
      <FilterRange
        presets={Object.entries(RANGES).map(([value, range]) => ({
          value,
          label: range.label,
        }))}
        value={filters.values.range}
        onValueChange={(value) => filters.set('range', value)}
        disabled={cold}
      />
      {filters.active && <FilterClear onClick={filters.clear} disabled={cold} />}
      <FilterSearch
        value={filters.search}
        onChange={(event) => filters.setSearch(event.target.value)}
        loading={filters.searching || cold}
        placeholder='Search messages'
        aria-label='Search messages'
      />
    </FilterBar>
  );
}

function MessagesSkeleton({ connected }: { connected: Channel[] | null }) {
  return (
    <>
      <MessagesFilters topics={[]} connected={connected} cold />
      <TableSkeleton columns={COLUMNS} rows={8} fixed={false} />
    </>
  );
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <MessagesHeader />
      <MessagesSkeleton connected={null} />
    </div>
  ),
};
