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
import { Card, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Flag } from '@buzzkit/ui/components/flag';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Switch } from '@buzzkit/ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useRef } from 'react';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import {
  ChannelBadge,
  DeliveryStatusBadge,
  PlatformBadge,
  SandboxBadge,
  SubscriptionStatusBadge,
  VerifiedBadge,
} from '@/app/components/badges';
import { DetailRow } from '@/app/components/detail/row';
import { describeStreamEvent, SOURCE_LABELS, type StreamSource } from '@/app/components/events/stream';
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { subscriberAction } from '@/app/lib/actions/subscribers.server';
import {
  getSubscriber,
  getSubscriberPreferences,
  listSubscriberDeliveries,
  listSubscriberTimeline,
  type SubscriberDelivery,
  type SubscriberPreference,
  type Subscription,
  type TimelineEvent,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { Route } from './+types/index';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

const SUBSCRIPTION_ICONS: Record<string, IconName> = {
  push: 'IconPhoneFilled',
  email: 'IconEmail2Filled',
  sms: 'IconBubbleTextFilled',
};

type AttributeRow = {
  key: string;
  label: string;
  icon: IconName;
  display: string;
  flag?: string;
  mono?: boolean;
  href?: string;
  tooltip?: string;
};

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: 'Subscriber · BuzzKit' }];
  return [{ title: `${loaderData.name ?? loaderData.subscriber.externalId} · BuzzKit` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const [subscriber, preferences, deliveries, events] = await Promise.all([
    getSubscriber(ctx, token, params.slug, tenant, params.externalId),
    getSubscriberPreferences(ctx, token, params.slug, tenant, params.externalId),
    listSubscriberDeliveries(ctx, token, params.slug, tenant, params.externalId, { limit: 8 }),
    listSubscriberTimeline(ctx, token, params.slug, tenant, params.externalId, { limit: 12 }),
  ]);
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const name = typeof attributes.name === 'string' && attributes.name.trim() ? attributes.name : null;
  return { subscriber, preferences, deliveries, events, name };
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
    return { ...base, icon: 'IconClock', display: text, tooltip: now ? `Local time · ${now}` : undefined };
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
      tooltip: date.toLocaleString('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        ...(text.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}),
      }),
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
    <Truncate className={row.mono ? 'font-mono text-xs' : undefined}>{row.display}</Truncate>
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
    <dl className='flex flex-col border-bg-3 border-t'>
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
            className='min-w-0 outline-none hover:underline focus-visible:underline'
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

function EventRow({ event }: { event: TimelineEvent }) {
  const { label, icon, detail } = describeStreamEvent(event);
  const source = SOURCE_LABELS[event.source as StreamSource] ?? event.source;
  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      <IconTile icon={icon} size='sm' />
      <div className='flex min-w-0 flex-1 flex-col items-start'>
        <Truncate className='max-w-full font-medium text-fg-4 text-sm'>{label}</Truncate>
        <Truncate className='max-w-full text-fg-2 text-xs'>
          {[detail, `from ${source}`].filter(Boolean).join(' · ')}
        </Truncate>
      </div>
      <div className='shrink-0 text-fg-2 text-xs'>
        <TimeAgo at={event.timestamp} />
      </div>
    </li>
  );
}

export default function SubscriberRoute({ loaderData, params }: Route.ComponentProps) {
  const { subscriber, preferences, deliveries, events, name } = loaderData;
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const custom = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !key.startsWith('$') && key !== 'name' && key !== 'email')
  );
  const base = `/${params.slug}/subscribers`;
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
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  useLinkedScroll(mainRef, asideRef);

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

      <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
        <ScrollFade targetRef={mainRef} />
        <div
          ref={mainRef}
          className='-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
        >
          <Card>
            <CardHeader className='py-3'>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <dl className='flex flex-col border-bg-3 border-t'>
              {name && (
                <DetailRow label='Name' copy={name}>
                  {name}
                </DetailRow>
              )}
              <DetailRow label='External id' copy={subscriber.externalId}>
                <span className='font-mono text-xs'>{subscriber.externalId}</span>
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
            <CardHeader className='py-3'>
              <CardTitle>Messages</CardTitle>
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconSend'
                title='No messages yet'
                description='Everything sent to this subscriber shows up here with its delivery status.'
              />
            ) : (
              <Table className='border-bg-3 border-t'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((delivery) => (
                    <DeliveryRow key={delivery.id} delivery={delivery} params={params} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader className='py-3'>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            {events.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconBellFilled'
                title='No activity yet'
                description='Events from the app and your server appear here, newest first.'
              />
            ) : (
              <ul className='flex flex-col divide-y divide-bg-3 border-bg-3 border-t'>
                {activity.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <ScrollFade targetRef={asideRef} />
        <div
          ref={asideRef}
          className='-m-1 flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto p-1 lg:w-[calc(22rem+0.5rem)] lg:shrink-0 [&>*]:shrink-0'
        >
          <Card>
            <CardHeader className='py-3'>
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
              <ul className='flex flex-col divide-y divide-bg-3 border-bg-3 border-t'>
                {subscriber.subscriptions.map((subscription) => (
                  <SubscriptionRow key={subscription.id} subscription={subscription} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader className='py-3'>
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
              <ul className='flex flex-col divide-y divide-bg-3 border-bg-3 border-t'>
                {preferences.map((preference) => (
                  <PreferenceRow key={preference.id} preference={preference} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader className='py-3'>
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
    </div>
  );
}
