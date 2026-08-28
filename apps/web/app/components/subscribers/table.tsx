import { Avatar } from '@buzzkit/ui/components/avatar';
import { Flag } from '@buzzkit/ui/components/flag';
import { TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Link } from 'react-router';
import { ChannelBadge, PlatformBadge, VerifiedBadge } from '@/app/components/badges';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import type { Subscriber } from '@/app/lib/api.server';

type SubscriberRowData = Pick<
  Subscriber,
  'id' | 'externalId' | 'attributes' | 'verified' | 'channels' | 'platforms' | 'createdAt' | 'lastSeenAt'
>;

export function SubscriberColumns() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Subscriber</TableHead>
        <TableHead>Country</TableHead>
        <TableHead>Channels</TableHead>
        <TableHead>Subscribed</TableHead>
        <TableHead>Last seen</TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function SubscriberRow({ subscriber, base }: { subscriber: SubscriberRowData; base: string }) {
  const name = attribute(subscriber, 'name');
  const email = attribute(subscriber, 'email');
  const country = attribute(subscriber, '$country');
  const secondary = name && email ? email : (email ?? name);

  return (
    <TableRow>
      <TableCell className='py-2'>
        <Link
          to={`${base}/${encodeURIComponent(subscriber.externalId)}`}
          className='flex items-center gap-2.5 outline-none focus-visible:underline'
        >
          <Avatar name={subscriber.externalId} label={name ?? subscriber.externalId} />
          <span className='flex min-w-0 flex-col'>
            <span className='flex items-center gap-1.5 font-medium text-fg-4'>
              {name ?? subscriber.externalId}
              <VerifiedBadge verified={subscriber.verified} />
            </span>
            <span className='text-fg-2 text-xs'>{name ? subscriber.externalId : secondary}</span>
          </span>
        </Link>
      </TableCell>
      <TableCell>
        {country ? (
          <span className='flex items-center gap-1.5'>
            <Flag code={country} />
            {countryName(country)}
          </span>
        ) : (
          <span className='text-fg-2'>Unknown</span>
        )}
      </TableCell>
      <TableCell>
        {subscriber.channels.length > 0 ? (
          <span className='flex items-center gap-1'>
            {subscriber.platforms.includes('ios') && <PlatformBadge platform='ios' />}
            {subscriber.platforms.includes('android') && <PlatformBadge platform='android' />}
            {subscriber.channels.includes('email') && <ChannelBadge channel='email' />}
          </span>
        ) : (
          <span className='text-fg-2'>None</span>
        )}
      </TableCell>
      <TableCell>
        <Time at={subscriber.createdAt} />
      </TableCell>
      <TableCell>
        {subscriber.lastSeenAt ? (
          <TimeAgo at={subscriber.lastSeenAt} />
        ) : (
          <span className='text-fg-2'>Never</span>
        )}
      </TableCell>
    </TableRow>
  );
}
