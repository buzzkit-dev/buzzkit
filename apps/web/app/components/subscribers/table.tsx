import { Avatar } from '@buzzkit/ui/components/avatar';
import { Flag } from '@buzzkit/ui/components/flag';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Link } from 'react-router';
import { ChannelBadge, PlatformBadge, VerifiedBadge } from '@/app/components/badges';
import { type TableColumn, TableColumns } from '@/app/components/loading/table';
import { attribute, countryName } from '@/app/components/subscribers/attributes';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import type { Subscriber } from '@/app/lib/api.server';

type SubscriberRowData = Pick<
  Subscriber,
  'id' | 'externalId' | 'attributes' | 'verified' | 'channels' | 'platforms' | 'createdAt' | 'lastSeenAt'
>;

export const SUBSCRIBER_COLUMNS: TableColumn[] = [
  {
    label: 'Subscriber',
    content: (
      <span className='flex items-center gap-2.5'>
        <Skeleton className='size-[30px] shrink-0 rounded-full' />
        <span className='flex flex-col gap-1'>
          <Skeleton className='h-3.5 w-28' />
          <Skeleton className='h-3 w-20' />
        </span>
      </span>
    ),
  },
  { label: 'Country', fill: 'h-4 w-24' },
  { label: 'Channels', fill: 'h-5 w-16 rounded-full' },
  { label: 'Subscribed', fill: 'h-4 w-20' },
  { label: 'Last seen', fill: 'h-4 w-16' },
];

export function SubscriberColumns() {
  return <TableColumns columns={SUBSCRIBER_COLUMNS} />;
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
