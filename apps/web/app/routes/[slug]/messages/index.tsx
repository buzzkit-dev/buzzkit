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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, MessageStatusBadge } from '@/app/components/badges';
import { Funnel } from '@/app/components/messages/funnel';
import { SendDialog } from '@/app/components/messages/send-dialog';
import { describeTarget } from '@/app/components/messages/target';
import { RANGES, resolveRange, useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
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
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Sending' },
  { value: 'completed', label: 'Completed' },
] as const;

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

  const [page, topics, segments] = await Promise.all([
    listMessages(ctx, token, params.slug, tenant, query),
    listTopics(ctx, token, params.slug, tenant, { limit: 100 }),
    listSegments(ctx, token, params.slug, tenant),
  ]);
  return { ...paginate(request, page), filtered, topics: topics.items, segments };
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
        <span className='flex min-w-0 items-center gap-1.5'>
          <Icon name={target.icon} className={`${target.nudge} size-4 shrink-0 text-fg-2`} />
          <Truncate>{target.text}</Truncate>
        </span>
      </TableCell>
      <TableCell>
        <MessageStatusBadge status={message.status} />
      </TableCell>
      <TableCell>
        <Funnel counts={message.counts} status={message.status} />
      </TableCell>
      <TableCell>
        <TimeAgo at={message.createdAt} />
      </TableCell>
    </TableRow>
  );
}

export default function MessagesRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl, connected } = useOutletContext<WorkspaceOutletContext>();
  const { items: messages, pagination, filtered, topics, segments } = loaderData;
  const base = `/${params.slug}/messages`;
  const fresh = !filtered && messages.length === 0;
  const [open, setOpen] = useState(false);
  const filters = useFilters(FILTER_KEYS);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Messages
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Inspect every message sent from this workspace.
          </p>
        </div>
        <Button icon='IconPaperPlaneTopRightFilled' onClick={() => setOpen(true)}>
          Send test message
        </Button>
      </header>

      {!fresh && (
        <FilterBar>
          <FilterSelect
            label='Status'
            value={filters.values.status as (typeof STATUS_OPTIONS)[number]['value'] | null}
            options={[...STATUS_OPTIONS]}
            onValueChange={(value) => filters.set('status', value)}
          />
          {connected.length > 1 && (
            <FilterSelect
              label='Channel'
              value={filters.values.channel as Channel | null}
              options={CHANNEL_OPTIONS.filter((option) => connected.includes(option.value))}
              onValueChange={(value) => filters.set('channel', value)}
            />
          )}
          {topics.length > 0 && (
            <FilterSelect
              label='Topic'
              value={filters.values.topic}
              options={topics.map((topic) => ({ value: topic.slug, label: topic.name }))}
              onValueChange={(value) => filters.set('topic', value)}
            />
          )}
          <FilterRange
            presets={Object.entries(RANGES).map(([value, range]) => ({ value, label: range.label }))}
            value={filters.values.range}
            onValueChange={(value) => filters.set('range', value)}
          />
          {filters.active && <FilterClear onClick={filters.clear} />}
          <FilterSearch
            value={filters.search}
            onChange={(event) => filters.setSearch(event.target.value)}
            loading={filters.searching}
            placeholder='Search messages'
            aria-label='Search messages'
          />
        </FilterBar>
      )}

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
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((message) => (
                <MessageRow key={message.id} message={message} base={base} />
              ))}
            </TableBody>
            <TablePagination {...pagination} />
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
    </div>
  );
}
