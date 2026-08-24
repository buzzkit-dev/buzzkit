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
import { Avatar, AvatarFallback } from '@buzzkit/ui/components/avatar';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Switch } from '@buzzkit/ui/components/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { CHANNELS, findChannel } from '@/app/components/onboarding/catalog';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { TIME_TOOLTIP_DELAY, TimeAgo } from '@/app/hooks/use-time-ago';
import { subscriberAction } from '@/app/lib/actions/subscribers.server';
import {
  getSubscriber,
  getSubscriberPreferences,
  type SubscriberPreference,
  type Subscription,
} from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { initials } from '@/app/lib/utils/format';
import type { Route } from './+types/index';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.subscriber.externalId} · BuzzKit` : 'Subscriber · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const [subscriber, preferences] = await Promise.all([
    getSubscriber(ctx, token, params.slug, 'default', params.externalId),
    getSubscriberPreferences(ctx, token, params.slug, 'default', params.externalId),
  ]);
  return { subscriber, preferences };
}

export const action = subscriberAction;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

type AttributeRow = {
  key: string;
  label: string;
  icon: IconName;
  display: string;
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
    return { ...base, icon: 'IconGlobe', display };
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
    <dl className='flex flex-col'>
      {rows.map((row) => (
        <div key={row.key} className='flex min-h-7 items-center justify-between gap-3'>
          <dt className='min-w-0 truncate text-fg-2 text-sm'>{row.label}</dt>
          <dd className='mr-2 flex min-w-0 items-center gap-1.5 text-fg-3 text-sm'>
            <Icon name={row.icon} className='size-4 shrink-0 opacity-65' />
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
  const channel = findChannel(subscription.channel);
  const invalid = subscription.status === 'invalid';

  return (
    <li className='flex min-h-12 items-center gap-3 py-2'>
      <IconTile icon={channel?.icon ?? 'IconBellFilled'} size='sm' tone={invalid ? 'red' : 'default'} />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate font-medium text-fg-4 text-sm leading-tighter'>
            {endpointLabel(subscription)}
          </span>
          {subscription.platform && (
            <Badge size='sm'>{subscription.platform === 'ios' ? 'iOS' : 'Android'}</Badge>
          )}
          {subscription.environment === 'sandbox' && (
            <Badge variant='amber' size='sm'>
              Sandbox
            </Badge>
          )}
          {invalid && (
            <Badge variant='red' size='sm'>
              Invalid
            </Badge>
          )}
        </span>
        <span className='truncate text-fg-2 text-xs'>
          {channel?.name ?? subscription.channel} · last seen <TimeAgo at={subscription.lastSeenAt} />
        </span>
      </span>
      <Switch
        aria-label={subscription.enabled ? 'Mute this subscription' : 'Unmute this subscription'}
        checked={subscription.enabled}
        disabled={pending}
        onCheckedChange={(enabled) =>
          submit('subscription-enabled', { id: subscription.id, enabled: String(enabled) })
        }
      />
      <Button
        variant='ghost'
        size='icon-xs'
        icon='IconTrashCan'
        aria-label='Remove this subscription'
        disabled={pending}
        onClick={() => submit('subscription-remove', { id: subscription.id })}
      />
    </li>
  );
}

function PreferenceRow({ preference }: { preference: SubscriberPreference }) {
  const { submit, pending } = useActionFetcher();
  const channels = CHANNELS.filter((channel) => channel.available);

  return (
    <li className='flex min-h-12 items-center gap-3 py-2'>
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

export default function SubscriberRoute({ loaderData, params }: Route.ComponentProps) {
  const { subscriber, preferences } = loaderData;
  const { submit, pending } = useActionFetcher();
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const name = typeof attributes.name === 'string' ? attributes.name : null;
  const base = `/${params.slug}/subscribers`;

  return (
    <div className='flex w-full flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 self-start'
        nativeButton={false}
        render={<Link to={base} />}
      >
        Subscribers
      </Button>

      <header className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <Avatar className='size-10'>
            <AvatarFallback className='text-lg'>{initials(name ?? subscriber.externalId)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col gap-0.5'>
            <h1 className='flex items-center gap-2 font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
              {subscriber.externalId}
              {subscriber.verified && (
                <Badge variant='green' size='sm'>
                  Verified
                </Badge>
              )}
            </h1>
            <p className='text-pretty text-base text-fg-2 leading-tighter'>
              {name ? `${name} · ` : ''}subscribed <TimeAgo at={subscriber.createdAt} />
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant='ghost' className='text-red-4' disabled={pending} />}>
            Delete subscriber
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{subscriber.externalId}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Every device and address registered for this subscriber goes with it. Identifying the same id
                again starts from scratch.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit('delete')}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      <Card className='flex flex-col gap-1.5 px-4 py-3.5'>
        <h2 className='font-medium text-fg-2 text-xs'>Attributes</h2>
        {Object.keys(attributes).length === 0 ? (
          <p className='text-pretty text-fg-2 text-sm'>Attributes sent with identify appear here.</p>
        ) : (
          <AttributeList attributes={attributes} />
        )}
      </Card>

      <Card className='flex flex-col gap-1.5 px-4 py-3.5'>
        <h2 className='font-medium text-fg-2 text-xs'>Subscriptions</h2>
        {subscriber.subscriptions.length === 0 ? (
          <p className='text-pretty text-fg-2 text-sm'>No devices or addresses registered yet.</p>
        ) : (
          <ul className='flex flex-col divide-y divide-bg-3'>
            {subscriber.subscriptions.map((subscription) => (
              <SubscriptionRow key={subscription.id} subscription={subscription} />
            ))}
          </ul>
        )}
      </Card>

      <Card className='flex flex-col gap-1.5 px-4 py-3.5'>
        <h2 className='font-medium text-fg-2 text-xs'>Preferences</h2>
        {preferences.length === 0 ? (
          <p className='text-pretty text-fg-2 text-sm'>
            Create a topic and its per-channel choices show up here.
          </p>
        ) : (
          <ul className='flex flex-col divide-y divide-bg-3'>
            {preferences.map((preference) => (
              <PreferenceRow key={preference.id} preference={preference} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
