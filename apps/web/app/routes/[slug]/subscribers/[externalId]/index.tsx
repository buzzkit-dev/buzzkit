import { SOURCE_PRESETS, type SourceProvider } from '@buzzkit/schema/sources';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@buzzkit/ui/components/alert-dialog';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterBar, FilterClear, FilterSelect } from '@buzzkit/ui/components/filter-bar';
import { Flag } from '@buzzkit/ui/components/flag';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Switch } from '@buzzkit/ui/components/switch';
import { Table, TableBody, TableCell, TableDetail, TableRow } from '@buzzkit/ui/components/table';
import {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger,
} from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import {
  ChannelBadge,
  DeliveryStatusBadge,
  EventSourceBadge,
  PlatformBadge,
  RunStatusBadge,
  SandboxBadge,
  SubscriptionStatusBadge,
  VerifiedBadge,
} from '@/app/components/badges';
import { DetailRow } from '@/app/components/detail/row';
import { describeStreamEvent, SOURCE_LABELS, type StreamSource } from '@/app/components/events/stream';
import { BlockSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { providerLabel } from '@/app/components/sources/describe';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useFilters } from '@/app/hooks/use-filters';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { subscriberAction } from '@/app/lib/actions/subscribers.server';
import {
  getSubscriber,
  getSubscriberPreferences,
  listEventNames,
  listSubscriberDeliveries,
  listSubscriberRuns,
  listSubscriberTimeline,
  requireFound,
  type SubscriberDelivery,
  type SubscriberPreference,
  type SubscriberRun,
  type Subscription,
  type TimelineEvent,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

const SUBSCRIPTION_ICONS: Record<string, IconName> = {
  push: 'IconPhoneFilled',
  email: 'IconEmail2Filled',
  sms: 'IconBubbleTextFilled',
};

const MESSAGE_COLUMNS: TableColumn[] = [
  { label: 'Message', fill: 'h-4 w-56' },
  { label: 'Channel', fill: 'h-5 w-14 rounded-full' },
  { label: 'Status', fill: 'h-5 w-16 rounded-full' },
  { label: 'Sent', fill: 'h-4 w-16' },
];

const RUN_COLUMNS: TableColumn[] = [
  { label: 'Workflow', fill: 'h-4 w-40' },
  { label: 'Step', className: 'w-24', fill: 'h-4 w-16' },
  { label: 'Status', className: 'w-28', fill: 'h-5 w-16 rounded-full' },
  { label: 'Updated', className: 'w-[104px]', fill: 'h-4 w-16' },
];

const ACTIVITY_COLUMNS: TableColumn[] = [
  { label: 'Event', fill: 'h-8 w-56' },
  { label: 'Source', className: 'w-28', fill: 'h-5 w-16 rounded-full' },
  { label: 'Time', className: 'w-16', fill: 'h-4 w-12' },
  { key: 'actions', label: 'Actions', hidden: true, className: 'w-10', fill: 'h-4 w-4' },
];

type AttributeRow = {
  key: string;
  label: string;
  icon: IconName;
  display: string;
  flag?: string;
  mono?: boolean;
  href?: string;
  tooltip?: React.ReactNode;
};

export function meta() {
  return [{ title: 'Subscriber · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const eventFilter = search.get('event')?.trim() || undefined;
  const sourceValue = search.get('source')?.trim() || undefined;
  const providerFilter =
    sourceValue && SOURCE_PRESETS[sourceValue as SourceProvider] ? sourceValue : undefined;
  const sourceFilter = providerFilter ? 'webhook' : sourceValue;
  return {
    activityFiltered: Boolean(eventFilter || sourceValue),
    detail: (async () => {
      const [subscriber, preferences, deliveries, events, runs, names] = await Promise.all([
        requireFound(getSubscriber(ctx, token, params.slug, tenant, params.externalId)),
        getSubscriberPreferences(ctx, token, params.slug, tenant, params.externalId),
        listSubscriberDeliveries(ctx, token, params.slug, tenant, params.externalId, { limit: 8 }),
        listSubscriberTimeline(ctx, token, params.slug, tenant, params.externalId, {
          limit: 25,
          name: eventFilter,
          source: sourceFilter,
          provider: providerFilter,
        }),
        listSubscriberRuns(ctx, token, params.slug, tenant, params.externalId),
        listEventNames(ctx, token, params.slug, tenant),
      ]);
      const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
      const name = typeof attributes.name === 'string' && attributes.name.trim() ? attributes.name : null;
      const seenSources = new Set<string>();
      for (const entry of names) {
        for (const source of entry.sources) {
          if (source !== 'webhook') seenSources.add(source);
          else if (entry.providers.length > 0)
            for (const provider of entry.providers) seenSources.add(provider);
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
        subscriber,
        preferences,
        deliveries,
        events,
        runs,
        name,
        eventNames: names.map((entry) => entry.name),
        sourceOptions,
      };
    })(),
  };
}

export const action = subscriberAction;

function prettyKey(key: string): string {
  const words = key
    .replace(/^\$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function detectRow(key: string, value: unknown): AttributeRow {
  const base = { key, label: prettyKey(key) };

  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    return { ...base, icon: 'IconToggle', display: String(value) === 'true' ? 'True' : 'False' };
  }

  if (typeof value === 'number') {
    return { ...base, icon: 'IconHashtag', display: value.toLocaleString('en') };
  }

  const text =
    typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value);

  if (/country/i.test(key) && /^[A-Za-z]{2}$/.test(text)) {
    let display = text.toUpperCase();
    try {
      display = regionNames.of(display) ?? display;
    } catch {}
    return { ...base, icon: 'IconGlobe', flag: text, display };
  }

  if (/^(city|region)$/i.test(key)) {
    return { ...base, icon: 'IconMapPin', display: text };
  }

  if (/^time ?_?zone$/i.test(key)) {
    let now: string | null = null;
    try {
      now = new Intl.DateTimeFormat('en', { timeZone: text, hour: 'numeric', minute: '2-digit' }).format(
        new Date()
      );
    } catch {}
    return {
      ...base,
      icon: 'IconClock',
      display: text,
      tooltip: now ? (
        <span className='whitespace-nowrap'>
          <TooltipLabel>Local time</TooltipLabel> {now}
        </span>
      ) : undefined,
    };
  }

  if (/^(lang|language|locale)$/i.test(key)) {
    let display = text;
    try {
      display = languageNames.of(text) ?? text;
    } catch {}
    return { ...base, icon: 'IconTranslate', display };
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text) && !Number.isNaN(Date.parse(text))) {
    const date = new Date(text);
    return {
      ...base,
      icon: 'IconCalendar1',
      display: date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }),
      tooltip: (
        <span className='whitespace-nowrap'>
          {date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {text.length > 10 && (
            <>
              {' '}
              <TooltipLabel>
                {date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
              </TooltipLabel>
            </>
          )}
        </span>
      ),
    };
  }

  if (/^https?:\/\//.test(text)) {
    let display = text;
    try {
      const url = new URL(text);
      display = `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {}
    return { ...base, icon: 'IconChainLink1', display, href: text };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { ...base, icon: 'IconEmail2', display: text, href: `mailto:${text}` };
  }

  if (/^v?\d+\.\d+(\.\d+)?([-+][\w.]+)?$/.test(text)) {
    return { ...base, icon: 'IconTag', display: text, mono: true };
  }

  return { ...base, icon: 'IconParagraph', display: text };
}

function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function localTime(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date());
  } catch {
    return null;
  }
}

function AttributeValue({ row }: { row: AttributeRow }) {
  const content = row.href ? (
    <a
      href={row.href}
      target='_blank'
      rel='noreferrer'
      className='truncate outline-none hover:underline focus-visible:underline'
    >
      {row.display}
    </a>
  ) : (
    <Truncate className={row.mono ? 'text-xs' : undefined}>{row.display}</Truncate>
  );

  if (!row.tooltip) return content;

  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger
          render={<span className='flex min-w-0 cursor-default items-center'>{content}</span>}
        />
        <TooltipContent>{row.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AttributeList({ attributes }: { attributes: Record<string, unknown> }) {
  const rows = Object.entries(attributes)
    .map(([key, value]) => detectRow(key, value))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <dl className='flex flex-col'>
      {rows.map((row) => (
        <div
          key={row.key}
          className='flex min-h-10 items-center justify-between gap-3 border-bg-3 border-b px-4 last:border-b-0'
        >
          <dt className='min-w-0 truncate text-fg-2 text-sm'>{row.label}</dt>
          <dd className='flex min-w-0 items-center gap-1.5 text-fg-3 text-sm'>
            {row.flag ? (
              <Flag code={row.flag} />
            ) : (
              <Icon name={row.icon} className='size-4 shrink-0 opacity-65' />
            )}
            <AttributeValue row={row} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function endpointLabel(subscription: Subscription): string {
  if (subscription.channel !== 'push') return subscription.endpoint;
  const token = subscription.endpoint;
  return token.length > 16 ? `${token.slice(0, 8)}…${token.slice(-6)}` : token;
}

function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const { submit, pending } = useActionFetcher();
  const invalid = subscription.status === 'invalid';

  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      <IconTile
        icon={SUBSCRIPTION_ICONS[subscription.channel] ?? 'IconBell'}
        size='sm'
        tone={invalid ? 'red' : 'default'}
      />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <Truncate className='font-medium text-fg-4 text-sm leading-tighter'>
            {endpointLabel(subscription)}
          </Truncate>
          {subscription.platform && <PlatformBadge platform={subscription.platform} />}
          <SandboxBadge environment={subscription.environment} />
          <SubscriptionStatusBadge status={subscription.status} />
        </span>
        <span className='truncate text-fg-2 text-xs'>
          Last seen <TimeAgo at={subscription.lastSeenAt} />
        </span>
      </span>
      <div className='flex shrink-0 items-center gap-1.5'>
        <Switch
          aria-label={subscription.enabled ? 'Mute this subscription' : 'Unmute this subscription'}
          checked={subscription.enabled}
          disabled={pending}
          onCheckedChange={(enabled) =>
            submit('subscription-enabled', { id: subscription.id, enabled: String(enabled) })
          }
        />
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant='ghost'
                size='icon-xs'
                icon='IconTrashCan'
                aria-label='Remove this subscription'
                disabled={pending}
              />
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops receiving anything until the app registers it again.
                <span className='block'>To stop messages for a while, mute it instead.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={() => submit('subscription-remove', { id: subscription.id })}
              >
                Remove subscription
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function PreferenceRow({ preference }: { preference: SubscriberPreference }) {
  const { submit, pending } = useActionFetcher();
  const states = preference.channels as Record<string, { optedIn: boolean; isDefault: boolean } | undefined>;
  const channels = CHANNELS.filter((channel) => states[channel.id]);
  const receiving = channels.filter((channel) => states[channel.id]?.optedIn);

  return (
    <li className='flex items-center gap-1.5 px-4 py-2.5'>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <Truncate className='font-medium text-fg-4 text-sm leading-tighter'>{preference.name}</Truncate>
        <Truncate className='text-fg-2 text-xs'>{preference.description ?? preference.slug}</Truncate>
      </span>
      {receiving.length > 0 ? (
        <span className='flex shrink-0 items-center gap-1'>
          {receiving.map((channel) => (
            <ChannelBadge key={channel.id} channel={channel.id} />
          ))}
        </span>
      ) : (
        <span className='shrink-0 text-fg-2 text-xs'>Opted out</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-xs'
              icon='IconDotGrid1x3Horizontal'
              aria-label={`${preference.name} preferences`}
              disabled={pending}
            />
          }
        />
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Receives on</DropdownMenuLabel>
            {channels.map((channel) => (
              <DropdownMenuCheckboxItem
                key={channel.id}
                checked={states[channel.id]?.optedIn ?? false}
                closeOnClick={false}
                onCheckedChange={(optedIn) =>
                  submit('preference', {
                    topic: preference.slug,
                    channel: channel.id,
                    optedIn: String(optedIn),
                  })
                }
              >
                {channel.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DeliveryRow({ delivery, params }: { delivery: SubscriberDelivery; params: { slug: string } }) {
  return (
    <TableRow>
      <TableCell className='max-w-96'>
        <span className='flex min-w-0 flex-col'>
          <Link
            to={`/${params.slug}/messages/${delivery.message.id}`}
            className='min-w-0 outline-none focus-visible:underline'
          >
            <Truncate className='font-medium text-fg-4'>{delivery.message.title ?? 'Untitled'}</Truncate>
          </Link>
          {delivery.message.body && (
            <Truncate className='text-fg-2 text-xs'>{delivery.message.body}</Truncate>
          )}
        </span>
      </TableCell>
      <TableCell>
        <ChannelBadge channel={delivery.channel} />
      </TableCell>
      <TableCell>
        <DeliveryStatusBadge status={delivery.status} />
      </TableCell>
      <TableCell>
        <TimeAgo at={delivery.sentAt ?? delivery.createdAt} />
      </TableCell>
    </TableRow>
  );
}

function RunRow({ run, slug }: { run: SubscriberRun; slug: string }) {
  return (
    <TableRow className='relative'>
      <TableCell className='max-w-64 py-2'>
        <Link
          to={`/${slug}/runs/${run.id}`}
          className="flex min-w-0 flex-col outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
        >
          <Truncate className='font-medium text-fg-4'>{run.workflow}</Truncate>
          {run.summary && <Truncate className='text-fg-2 text-xs'>{run.summary}</Truncate>}
        </Link>
      </TableCell>
      <TableCell>{run.step}</TableCell>
      <TableCell>
        <RunStatusBadge status={run.status} />
      </TableCell>
      <TableCell>
        <TimeAgo at={run.updatedAt} />
      </TableCell>
    </TableRow>
  );
}

function sentence(value: string): string {
  return value.length > 0 ? value[0]?.toUpperCase() + value.slice(1) : value;
}

function preferenceText(data: Record<string, unknown>): string | null {
  const changes = data.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const parts: string[] = [];
  for (const [topic, value] of Object.entries(changes as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      parts.push(`${sentence(topic)} ${value ? 'on' : 'off'}`);
      continue;
    }
    for (const [channel, enabled] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      parts.push(`${sentence(topic)} ${channel} ${enabled ? 'on' : 'off'}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function pairText(entries: Array<[string, unknown]>): string | null {
  const shown = entries
    .slice(0, 4)
    .map(([key, value]) => `${prettyKey(key)}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  return shown.length > 0 ? shown.join(' · ') : null;
}

function textOf(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function activityDetail(event: TimelineEvent): string | null {
  const data = (event.data ?? {}) as Record<string, unknown>;
  if (event.name === '$preferences.updated') return preferenceText(data);
  if (
    event.name === '$subscriber.created' ||
    event.name === '$subscriber.updated' ||
    event.name === '$identify'
  ) {
    const attributes = data.attributes;
    if (!attributes || typeof attributes !== 'object') return null;
    return pairText(
      Object.entries(attributes as Record<string, unknown>).filter(([key]) => !key.startsWith('$'))
    );
  }
  if (event.name.startsWith('$run.')) {
    const trailing = textOf(data, 'reason') ?? textOf(data, 'error') ?? textOf(data, 'summary');
    return [textOf(data, 'workflow'), trailing && sentence(trailing)].filter(Boolean).join(' · ') || null;
  }
  if (event.name.startsWith('$')) {
    const detail = describeStreamEvent(event).detail;
    return detail ? sentence(detail) : null;
  }
  const entries = Object.entries(data);
  const plain = entries.filter(([key]) => !key.startsWith('$'));
  return pairText(plain.length > 0 ? plain : entries);
}

function ActivityRow({
  event,
  expanded,
  onToggle,
}: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const system = event.name.startsWith('$');
  const { label, icon } = describeStreamEvent(event);
  const detail = activityDetail(event);
  return (
    <>
      <TableRow
        onClick={system ? undefined : onToggle}
        aria-expanded={system ? undefined : expanded}
        className={cn(!system && 'cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer')}
      >
        <TableCell className='py-2'>
          <span className='flex min-w-0 items-center gap-3'>
            <IconTile icon={icon} size='sm' />
            <span className='flex min-w-0 flex-col'>
              <Truncate className='max-w-full font-medium text-fg-4 text-sm'>{label}</Truncate>
              {detail && <Truncate className='max-w-full text-fg-2 text-xs'>{detail}</Truncate>}
            </span>
          </span>
        </TableCell>
        <TableCell className='py-2'>
          <EventSourceBadge source={event.source} provider={event.data?.$provider} />
        </TableCell>
        <TableCell>
          <TimeAgo at={event.timestamp} />
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          {!system && (
            <Icon
              name='IconChevronDownMedium'
              className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
            />
          )}
        </TableCell>
      </TableRow>
      {!system && (
        <TableDetail open={expanded} colSpan={4}>
          <div className='flex flex-col gap-1.5 px-4 py-3'>
            <span className='text-fg-2 text-sm'>Data</span>
            <CodeBlock code={JSON.stringify(event.data, null, 2)} />
          </div>
        </TableDetail>
      )}
    </>
  );
}

function SubscriberContent({
  data,
  params,
  activityFiltered,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['detail']>;
  params: { slug: string };
  activityFiltered: boolean;
}) {
  const filters = useFilters(['event', 'source']);
  const { subscriber, preferences, deliveries, events, runs, name, eventNames, sourceOptions } = data;
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const custom = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !key.startsWith('$') && key !== 'name' && key !== 'email')
  );
  const email = attribute({ attributes }, 'email');
  const country = attribute({ attributes }, '$country');
  const city = attribute({ attributes }, '$city');
  const region = attribute({ attributes }, '$region');
  const timezone = attribute({ attributes }, '$timezone');
  const language = attribute({ attributes }, '$language');
  const lastSeenAt =
    subscriber.subscriptions
      .map((subscription) => subscription.lastSeenAt)
      .sort()
      .at(-1) ?? null;
  const now = timezone ? localTime(timezone) : null;
  const messages = [...deliveries.items].sort((a, b) =>
    (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)
  );
  const activity = events.items;
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  useLinkedScroll(mainRef, asideRef);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
      <ScrollFade targetRef={mainRef} />
      <div
        ref={mainRef}
        className='-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
      >
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <dl className='flex flex-col'>
            {name && (
              <DetailRow label='Name' copy={name}>
                {name}
              </DetailRow>
            )}
            <DetailRow label='External id' copy={subscriber.externalId}>
              <span className='text-xs'>{subscriber.externalId}</span>
              <VerifiedBadge verified={subscriber.verified} />
            </DetailRow>
            {email && (
              <DetailRow label='Email' copy={email}>
                {email}
              </DetailRow>
            )}
            {country && (
              <DetailRow label='Country' copy={countryName(country)}>
                <Flag code={country} />
                {countryName(country)}
              </DetailRow>
            )}
            {(city || region) && (
              <DetailRow label='City' copy={[city, region].filter(Boolean).join(', ')}>
                {[city, region].filter(Boolean).join(', ')}
              </DetailRow>
            )}
            {timezone && (
              <DetailRow label='Timezone' copy={timezone}>
                {timezone}
                {now && <span className='text-fg-2'>· {now} now</span>}
              </DetailRow>
            )}
            {language && (
              <DetailRow label='Language' copy={language}>
                {languageName(language)}
              </DetailRow>
            )}
            <DetailRow label='Subscribed'>
              <Time at={subscriber.createdAt} />
            </DetailRow>
            <DetailRow label='Last seen'>
              {lastSeenAt ? <TimeAgo at={lastSeenAt} /> : <span className='text-fg-2'>Never</span>}
            </DetailRow>
            <DetailRow label='Verified'>
              {subscriber.identityVerifiedAt ? (
                <Time at={subscriber.identityVerifiedAt} />
              ) : (
                <span className='text-fg-2'>No</span>
              )}
            </DetailRow>
          </dl>
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          {deliveries.items.length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconPaperPlaneTopRightFilled'
              title='No messages yet'
              description='Everything sent to this subscriber shows up here with its delivery status.'
            />
          ) : (
            <Table>
              <TableColumns columns={MESSAGE_COLUMNS} />
              <TableBody>
                {messages.map((delivery) => (
                  <DeliveryRow key={delivery.id} delivery={delivery} params={params} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Runs</CardTitle>
          </CardHeader>
          {runs.length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconAgentsFilled'
              title='No runs yet'
              description='A run appears here when an event from this subscriber matches a workflow.'
            />
          ) : (
            <Table className='table-fixed'>
              <TableColumns columns={RUN_COLUMNS} />
              <TableBody>
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} slug={params.slug} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Activity</CardTitle>
            <CardAction>
              <FilterBar className='mb-0'>
                <FilterSelect
                  label='Event'
                  value={filters.values.event}
                  options={eventNames.map((eventName) => ({ value: eventName, label: eventName }))}
                  onValueChange={(value) => filters.set('event', value)}
                  className='h-[26px] rounded-[10px] text-xs'
                />
                <FilterSelect
                  label='Source'
                  value={filters.values.source}
                  options={sourceOptions}
                  onValueChange={(value) => filters.set('source', value)}
                  className='h-[26px] rounded-[10px] text-xs'
                />
                {filters.active && (
                  <FilterClear className='h-[26px] rounded-[10px] text-xs' onClick={filters.clear} />
                )}
              </FilterBar>
            </CardAction>
          </CardHeader>
          {events.items.length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconBellFilled'
              title={activityFiltered ? 'No events match' : 'No activity yet'}
              description={
                activityFiltered
                  ? 'Nothing on this timeline matches the filters.'
                  : 'Events from the app and your server appear here, newest first.'
              }
            />
          ) : (
            <Table className='table-fixed'>
              <TableColumns columns={ACTIVITY_COLUMNS} />
              <TableBody>
                {activity.map((event) => (
                  <ActivityRow
                    key={event.id}
                    event={event}
                    expanded={expandedEventId === event.id}
                    onToggle={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <ScrollFade targetRef={asideRef} />
      <div
        ref={asideRef}
        className='-m-1 flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto p-1 lg:w-[calc(22rem+0.5rem)] lg:shrink-0 [&>*]:shrink-0'
      >
        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          {subscriber.subscriptions.length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconBellFilled'
              title='No subscriptions yet'
              description='Devices and addresses registered from your app appear here.'
            />
          ) : (
            <ul className='flex flex-col divide-y divide-bg-3'>
              {subscriber.subscriptions.map((subscription) => (
                <SubscriptionRow key={subscription.id} subscription={subscription} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          {preferences.length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconTagFilled'
              title='No topics yet'
              description='Create a topic and this subscriber’s choice per channel appears here.'
            />
          ) : (
            <ul className='flex flex-col divide-y divide-bg-3'>
              {preferences.map((preference) => (
                <PreferenceRow key={preference.id} preference={preference} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader divider className='py-3'>
            <CardTitle>Attributes</CardTitle>
          </CardHeader>
          {Object.keys(custom).length === 0 ? (
            <EmptyState
              size='sm'
              icon='IconParagraph'
              title='No attributes yet'
              description='Attributes your backend sends with identify appear here.'
            />
          ) : (
            <AttributeList attributes={custom} />
          )}
        </Card>
      </div>
    </div>
  );
}

function SubscriberSkeleton() {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-5'>
        <BlockSkeleton className='h-96 w-full rounded-2xl' />
        <TableSkeleton columns={MESSAGE_COLUMNS} rows={3} />
        <TableSkeleton columns={RUN_COLUMNS} rows={3} />
        <TableSkeleton columns={ACTIVITY_COLUMNS} rows={5} />
      </div>
      <div className='flex min-h-0 min-w-0 flex-col gap-5 lg:w-[calc(22rem+0.5rem)] lg:shrink-0'>
        <BlockSkeleton className='h-48 w-full rounded-2xl' />
        <BlockSkeleton className='h-48 w-full rounded-2xl' />
        <BlockSkeleton className='h-56 w-full rounded-2xl' />
      </div>
    </div>
  );
}

export default function SubscriberRoute({ loaderData, params }: Route.ComponentProps) {
  const { activityFiltered, detail } = loaderData;
  const base = `/${params.slug}/subscribers`;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 shrink-0 self-start'
        nativeButton={false}
        render={<Link to={base} />}
      >
        Subscribers
      </Button>

      <Deferred resolve={detail}>
        {(data) =>
          data === undefined ? (
            <SubscriberSkeleton />
          ) : (
            <SubscriberContent data={data} params={params} activityFiltered={activityFiltered} />
          )
        }
      </Deferred>
    </div>
  );
}
