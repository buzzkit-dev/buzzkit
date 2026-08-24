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
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Flag } from '@buzzkit/ui/components/flag';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Switch } from '@buzzkit/ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { iconSwap, iconSwapIn, iconSwapOut } from '@buzzkit/ui/lib/icon-swap';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';
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
import { CHANNELS } from '@/app/components/onboarding/catalog';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { subscriberAction } from '@/app/lib/actions/subscribers.server';
import {
  getSubscriber,
  getSubscriberPreferences,
  listSubscriberDeliveries,
  listSubscriberEvents,
  type SubscriberDelivery,
  type SubscriberEvent,
  type SubscriberPreference,
  type Subscription,
} from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: 'Subscriber · BuzzKit' }];
  return [{ title: `${loaderData.name ?? loaderData.subscriber.externalId} · BuzzKit` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const [subscriber, preferences, deliveries, events] = await Promise.all([
    getSubscriber(ctx, token, params.slug, 'default', params.externalId),
    getSubscriberPreferences(ctx, token, params.slug, 'default', params.externalId),
    listSubscriberDeliveries(ctx, token, params.slug, 'default', params.externalId, { limit: 8 }),
    listSubscriberEvents(ctx, token, params.slug, 'default', params.externalId, { limit: 12 }),
  ]);
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const name = typeof attributes.name === 'string' && attributes.name.trim() ? attributes.name : null;
  return { subscriber, preferences, deliveries, events, name };
}

export const action = subscriberAction;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

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
    <span className={row.mono ? 'truncate font-mono text-xs' : 'truncate'}>{row.display}</span>
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

const SUBSCRIPTION_ICONS: Record<string, IconName> = {
  push: 'IconPhone',
  email: 'IconEmail2Filled',
  sms: 'IconBubbleTextFilled',
};

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
          <span className='truncate font-medium text-fg-4 text-sm leading-tighter'>
            {endpointLabel(subscription)}
          </span>
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
  const channels = CHANNELS.filter((channel) => channel.available);

  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate font-medium text-fg-4 text-sm leading-tighter'>{preference.name}</span>
        <span className='truncate text-fg-2 text-xs'>{preference.description ?? preference.slug}</span>
      </span>
      {channels.map((channel) => {
        const state = (
          preference.channels as Record<string, { optedIn: boolean; isDefault: boolean } | undefined>
        )[channel.id];
        if (!state) return null;
        return (
          <span key={channel.id} className='flex items-center gap-2 text-fg-2 text-xs'>
            {channel.name}
            <Switch
              aria-label={`${preference.name} via ${channel.name}`}
              checked={state.optedIn}
              disabled={pending}
              onCheckedChange={(optedIn) =>
                submit('preference', {
                  topic: preference.slug,
                  channel: channel.id,
                  optedIn: String(optedIn),
                })
              }
            />
          </span>
        );
      })}
    </li>
  );
}

function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function text(attributes: Record<string, unknown>, key: string): string | null {
  const value = attributes[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function localTime(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date());
  } catch {
    return null;
  }
}

function ProfileRow({ label, copy, children }: { label: string; copy?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copyValue = () => {
    if (!copy) return;
    navigator.clipboard.writeText(copy).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className='flex min-h-10 items-center gap-6 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='w-36 shrink-0 text-fg-2 text-sm'>{label}</dt>
      <dd className='flex min-w-0 flex-1 items-center text-fg-4 text-sm'>
        {copy ? (
          <button
            type='button'
            aria-label={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
            onClick={copyValue}
            className={cn(
              'group/copy -mx-2 -my-1 relative isolate flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
              "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
              'before:transition-[background-color,inset] before:duration-150 before:ease-out active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y)',
              'hover:before:bg-bg-a1 active:before:bg-bg-a1'
            )}
          >
            <span className='flex min-w-0 items-center gap-1.5 truncate'>{children}</span>
            <span className='relative size-4 shrink-0'>
              <Icon
                name='IconClipboard2'
                className={cn(
                  'absolute inset-0 size-4 text-fg-2',
                  iconSwap,
                  copied
                    ? iconSwapOut
                    : cn(
                        iconSwapIn,
                        'opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100'
                      )
                )}
              />
              <Icon
                name='IconCheckmark1'
                className={cn(
                  'absolute inset-0 size-4 text-green-4',
                  iconSwap,
                  copied ? iconSwapIn : iconSwapOut
                )}
              />
            </span>
          </button>
        ) : (
          <span className='flex min-w-0 items-center gap-1.5'>{children}</span>
        )}
      </dd>
    </div>
  );
}

function subjectOf(data: Record<string, unknown>): string {
  if (data.channel === 'email')
    return typeof data.endpoint === 'string' ? `email ${data.endpoint}` : 'an email address';
  if (data.platform === 'ios') return 'iOS device';
  if (data.platform === 'android') return 'Android device';
  return 'device';
}

function changesOf(data: Record<string, unknown>): string | null {
  const changes = data.changes;
  if (!changes || typeof changes !== 'object') return null;
  const parts: string[] = [];
  for (const [topic, channels] of Object.entries(changes as Record<string, Record<string, unknown>>)) {
    for (const [channel, value] of Object.entries(channels ?? {})) {
      parts.push(`${topic} ${channel === 'push' ? 'push' : channel} ${value ? 'on' : 'off'}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

const EVENT_LABELS: Record<
  string,
  (data: Record<string, unknown>) => { label: string; icon: IconName; detail?: string | null }
> = {
  'subscriber.created': () => ({ label: 'Identified', icon: 'IconFingerPrint1' }),
  'subscriber.updated': () => ({ label: 'Attributes updated', icon: 'IconParagraph' }),
  'subscriber.deleted': () => ({ label: 'Deleted', icon: 'IconTrashCan' }),
  'subscription.created': (data) =>
    data.channel === 'email'
      ? { label: `Added ${subjectOf(data)}`, icon: 'IconEmail2Filled' }
      : { label: `Registered ${subjectOf(data)}`, icon: 'IconPhone' },
  'subscription.updated': (data) =>
    data.enabled === false
      ? { label: `Muted ${subjectOf(data)}`, icon: 'IconBellOff' }
      : { label: `Unmuted ${subjectOf(data)}`, icon: 'IconBellActive' },
  'subscription.removed': (data) => ({ label: `Removed ${subjectOf(data)}`, icon: 'IconCircleX' }),
  'subscription.invalidated': (data) => ({
    label: `${subjectOf(data)} stopped accepting pushes`,
    icon: 'IconCircleBanSign',
    detail: typeof data.reason === 'string' ? data.reason : null,
  }),
  'preferences.updated': (data) => ({
    label: 'Preferences changed',
    icon: 'IconSettingsSliderHor',
    detail: changesOf(data),
  }),
};

function actorLabel(event: SubscriberEvent): string {
  switch (event.actorType) {
    case 'key':
      return `via ${event.actorDisplay}`;
    case 'member':
      return `by ${event.actorDisplay}`;
    case 'user':
      return 'by the subscriber';
    default:
      return 'by BuzzKit';
  }
}

function describeEvent(event: SubscriberEvent): { label: string; icon: IconName; detail?: string | null } {
  const data = (event.data ?? {}) as Record<string, unknown>;
  return EVENT_LABELS[event.event]?.(data) ?? { label: event.event, icon: 'IconBell' };
}

function DeliveryRow({ delivery }: { delivery: SubscriberDelivery }) {
  return (
    <TableRow>
      <TableCell className='max-w-96'>
        <span className='flex min-w-0 flex-col'>
          <span className='truncate font-medium text-fg-4'>{delivery.message.title ?? 'Untitled'}</span>
          {delivery.message.body && (
            <span className='truncate text-fg-2 text-xs'>{delivery.message.body}</span>
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

function EventRow({ event }: { event: SubscriberEvent }) {
  const { label, icon, detail } = describeEvent(event);
  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      <IconTile icon={icon} size='sm' />
      <div className='flex min-w-0 flex-1 flex-col items-start'>
        <span className='max-w-full truncate font-medium text-fg-4 text-sm'>{label}</span>
        <span className='max-w-full truncate text-fg-2 text-xs'>
          {detail ? `${detail} · ` : ''}
          {actorLabel(event)}
        </span>
      </div>
      <div className='shrink-0 text-fg-2 text-xs'>
        <TimeAgo at={event.createdAt} />
      </div>
    </li>
  );
}

function useLinkedScroll(...refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    const columns = refs.map((ref) => ref.current).filter((el) => el !== null);
    const forward = (event: WheelEvent) => {
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
      const source = columns.find((column) => column.contains(event.target as Node));
      for (const column of columns) {
        if (column !== source) column.scrollTop += event.deltaY;
      }
    };
    for (const column of columns) column.addEventListener('wheel', forward, { passive: true });
    return () => {
      for (const column of columns) column.removeEventListener('wheel', forward);
    };
  }, refs);
}

export default function SubscriberRoute({ loaderData, params }: Route.ComponentProps) {
  const { subscriber, preferences, deliveries, events, name } = loaderData;
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const custom = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !key.startsWith('$') && key !== 'name' && key !== 'email')
  );
  const base = `/${params.slug}/subscribers`;
  const email = text(attributes, 'email');
  const country = text(attributes, '$country');
  const city = text(attributes, '$city');
  const region = text(attributes, '$region');
  const timezone = text(attributes, '$timezone');
  const language = text(attributes, '$language');
  const lastSeenAt =
    subscriber.subscriptions
      .map((subscription) => subscription.lastSeenAt)
      .sort()
      .at(-1) ?? null;
  const now = timezone ? localTime(timezone) : null;
  const messages = [...deliveries.items].sort((a, b) =>
    (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)
  );
  const activity = [...events.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
                <ProfileRow label='Name' copy={name}>
                  {name}
                </ProfileRow>
              )}
              <ProfileRow label='External id' copy={subscriber.externalId}>
                <span className='font-mono text-xs'>{subscriber.externalId}</span>
                <VerifiedBadge verified={subscriber.verified} />
              </ProfileRow>
              {email && (
                <ProfileRow label='Email' copy={email}>
                  {email}
                </ProfileRow>
              )}
              {country && (
                <ProfileRow label='Country' copy={countryName(country)}>
                  <Flag code={country} />
                  {countryName(country)}
                </ProfileRow>
              )}
              {(city || region) && (
                <ProfileRow label='City' copy={[city, region].filter(Boolean).join(', ')}>
                  {[city, region].filter(Boolean).join(', ')}
                </ProfileRow>
              )}
              {timezone && (
                <ProfileRow label='Timezone' copy={timezone}>
                  {timezone}
                  {now && <span className='text-fg-2'>· {now} now</span>}
                </ProfileRow>
              )}
              {language && (
                <ProfileRow label='Language' copy={language}>
                  {languageName(language)}
                </ProfileRow>
              )}
              <ProfileRow label='Subscribed'>
                <Time at={subscriber.createdAt} />
              </ProfileRow>
              <ProfileRow label='Last seen'>
                {lastSeenAt ? <TimeAgo at={lastSeenAt} /> : <span className='text-fg-2'>Never</span>}
              </ProfileRow>
              <ProfileRow label='Verified'>
                {subscriber.identityVerifiedAt ? (
                  <Time at={subscriber.identityVerifiedAt} />
                ) : (
                  <span className='text-fg-2'>No</span>
                )}
              </ProfileRow>
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
                    <DeliveryRow key={delivery.id} delivery={delivery} />
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
                description='Identifies, device registrations and preference changes appear here.'
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
