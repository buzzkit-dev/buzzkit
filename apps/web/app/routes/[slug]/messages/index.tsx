import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { FilterBar, FilterClear, FilterSearch, FilterSelect } from '@buzzkit/ui/components/filter-bar';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, MessageStatusBadge } from '@/app/components/badges';
import { Funnel } from '@/app/components/messages/funnel';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { messagesAction } from '@/app/lib/actions/messages.server';
import { listMessages, listTopics, type Message, type MessageQuery, type Topic } from '@/app/lib/api.server';
import { CHANNEL_OPTIONS, type Channel, channelLabel } from '@/app/lib/channels';
import { requireSession } from '@/app/lib/session.server';
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

const RANGES: Record<string, { label: string; hours: number }> = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
};

export function meta() {
  return [{ title: 'Messages · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const range = RANGES[search.get('range') ?? ''];
  const status = STATUS_OPTIONS.find((option) => option.value === search.get('status'))?.value;
  const channel = CHANNEL_OPTIONS.find((option) => option.value === search.get('channel'))?.value;
  const query: MessageQuery = {
    ...readPage(request),
    q: search.get('q')?.trim() || undefined,
    status,
    channel,
    topic: search.get('topic') || undefined,
    from: range ? new Date(Date.now() - range.hours * 3_600_000).toISOString() : undefined,
  };
  const filtered = Boolean(query.q || status || channel || query.topic || range);

  const [page, topics] = await Promise.all([
    listMessages(ctx, token, params.slug, 'default', query),
    listTopics(ctx, token, params.slug, 'default', { limit: 100 }),
  ]);
  return { ...paginate(request, page), filtered, topics: topics.items };
}

export const action = messagesAction;

type Target = 'subscriber' | 'topic';

const EXAMPLES: { title: string; body: string }[] = [
  { title: 'Leg day', body: "Let's go." },
  { title: 'Your order shipped', body: 'Arrives Thursday between 9am and 1pm.' },
  { title: 'Table for two is ready', body: 'Head to the host stand whenever you are.' },
  { title: 'Price drop on your watchlist', body: 'Two items are now cheaper.' },
  { title: 'New sign-in from Chrome on Mac', body: 'If this was not you, reset your password now.' },
  { title: 'Ride arriving in 2 minutes', body: 'Meet your driver at the pickup point.' },
  { title: 'Streak at risk', body: 'A 20 minute run keeps it alive.' },
  { title: 'Jane replied to your thread', body: 'Tap to read her reply.' },
  { title: 'Back in stock', body: 'The item you wanted is available again.' },
  { title: 'Weekly digest', body: 'Five things you missed this week.' },
];

const TARGETS: { value: Target; label: string }[] = [
  { value: 'subscriber', label: 'Subscribers' },
  { value: 'topic', label: 'Topic' },
];

function sendSnippet(apiUrl: string) {
  return [
    `curl -X POST ${apiUrl}/v1/messages \\`,
    "  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "to": "user_42", "title": "Leg day", "body": "Let\\'s go." }'`,
  ].join('\n');
}

function targetOf(message: Message): { icon: IconName; nudge: string; text: string } {
  const targets = message.targets as { to?: string[]; topic?: string };
  if (targets.topic) return { icon: 'IconTagFilled', nudge: 'mt-0.5', text: targets.topic };
  const to = targets.to ?? [];
  if (to.length === 1) return { icon: 'IconPeopleFilled', nudge: 'mt-px', text: to[0] ?? '' };
  return { icon: 'IconTeamFilled', nudge: 'mt-px', text: `${to.length} subscribers` };
}

function SendDialog({
  topics,
  channels,
  open,
  onOpenChange,
}: {
  topics: Topic[];
  channels: Channel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { submit, pending } = useActionFetcher((data) => {
    onOpenChange(false);
    if (typeof data.id === 'string') navigate(`${data.id}`, { relative: 'path' });
  });
  const [channel, setChannel] = useState<Channel>(channels[0] ?? 'push');
  const [target, setTarget] = useState<Target>('subscriber');
  const [to, setTo] = useState('');
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [example, setExample] = useState(EXAMPLES[0]!);
  const channelTopics = topics.filter((entry) => entry.channels.includes(channel));
  const channelName = channelLabel(channel).toLowerCase();

  useEffect(() => {
    if (!open) return;
    setChannel(channels[0] ?? 'push');
    setTarget('subscriber');
    setTo('');
    setTopic('');
    setTitle('');
    setBody('');
    setExample(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]!);
  }, [open, channels[0]]);

  useEffect(() => {
    if (!channelTopics.some((entry) => entry.slug === topic)) setTopic(channelTopics[0]?.slug ?? '');
  }, [channelTopics, topic]);

  const hasTarget = target === 'topic' ? topic.length > 0 : to.trim().length > 0;
  const canSend = hasTarget && (title.trim().length > 0 || body.trim().length > 0) && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Send test message</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          <Field>
            <FieldLabel htmlFor='message-channel'>Channel</FieldLabel>
            <Select
              items={CHANNEL_OPTIONS.filter((option) => channels.includes(option.value))}
              value={channel}
              onValueChange={(value) => setChannel(value as Channel)}
            >
              <SelectTrigger id='message-channel' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.filter((option) => channels.includes(option.value)).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='message-target'>To</FieldLabel>
            <Select items={TARGETS} value={target} onValueChange={(value) => setTarget(value as Target)}>
              <SelectTrigger id='message-target' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGETS.filter((entry) => entry.value !== 'topic' || channelTopics.length > 0).map(
                  (entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>
          {target === 'topic' ? (
            <Field>
              <FieldLabel htmlFor='message-topic'>Topic</FieldLabel>
              <Select
                items={channelTopics.map((entry) => ({ value: entry.slug, label: entry.name }))}
                value={topic}
                onValueChange={(value) => setTopic(String(value))}
              >
                <SelectTrigger id='message-topic' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channelTopics.map((entry) => (
                    <SelectItem key={entry.id} value={entry.slug}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Every subscriber opted in to this topic on {channelName} receives it.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor='message-to'>External ids</FieldLabel>
              <Input
                id='message-to'
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder='user_42, user_43'
                autoComplete='off'
                spellCheck={false}
              />
              <FieldDescription>
                The ids your app identified these users with, separated by commas.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='message-title'>Title</FieldLabel>
            <Input
              id='message-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={example.title}
              maxLength={500}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='message-body'>Body</FieldLabel>
            <Textarea
              id='message-body'
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={example.body}
              maxLength={4000}
              rows={3}
            />
          </Field>
          <Button
            className='w-full'
            disabled={!canSend}
            loading={pending}
            onClick={() => submit('send', { channel, target, to, topic, title, body })}
          >
            Send test message
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

function MessageRow({ message, base }: { message: Message; base: string }) {
  const payload = message.payload as { title?: string; body?: string };
  const target = targetOf(message);

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
  const { items: messages, pagination, filtered, topics } = loaderData;
  const [open, setOpen] = useState(false);
  const filters = useFilters(FILTER_KEYS);
  const base = `/${params.slug}/messages`;
  const fresh = !filtered && messages.length === 0;

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
          <FilterSelect
            label='Time'
            value={filters.values.range}
            options={Object.entries(RANGES).map(([value, range]) => ({ value, label: range.label }))}
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

      <SendDialog topics={topics} channels={connected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
