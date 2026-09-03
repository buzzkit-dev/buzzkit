import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { Icon } from '@buzzkit/ui/components/icon';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { cn } from '@buzzkit/ui/lib/utils';
import {
  ChannelBadge,
  DeliveryStatusBadge,
  MessageStatusBadge,
  PlatformBadge,
} from '@buzzkit/web/components/badges/index';
import { DetailRow } from '@buzzkit/web/components/detail/row';
import { ScreenHeader } from './Screen';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

const PAYLOAD = {
  title: 'Leg day',
  body: 'Let’s go. 6:00 with Maya.',
  topic: 'gym-reminders',
  deepLink: 'app://workouts/legs',
};

const DELIVERIES = [
  { id: 'user_42', platform: 'ios', status: 'sent', when: '12m ago' },
  { id: 'user_311', platform: 'ios', status: 'sent', when: '12m ago' },
  { id: 'user_178', platform: 'android', status: 'sent', when: '12m ago' },
  { id: 'user_907', platform: 'ios', status: 'failed', when: '12m ago' },
  { id: 'user_566', platform: 'ios', status: 'sent', when: '12m ago' },
  { id: 'user_230', platform: 'android', status: 'sent', when: '12m ago' },
  { id: 'user_1042', platform: 'ios', status: 'sent', when: '12m ago' },
] as const;

const COUNTS = { total: 2418, sent: 2412, pending: 0, failed: 6 };

const FUNNEL = [
  { label: 'Reachable', value: COUNTS.total, tone: 'text-fg-4', bar: 'bg-bg-3' },
  { label: 'Sent', value: COUNTS.sent, tone: 'text-green-text', bar: 'bg-green-4' },
  { label: 'Pending', value: COUNTS.pending, tone: 'text-fg-4', bar: 'bg-amber-4' },
  { label: 'Failed', value: COUNTS.failed, tone: 'text-red-text', bar: 'bg-red-4' },
];

export function MessageScreen() {
  return (
    <>
      <ScreenHeader
        parent='Messages'
        title={
          <>
            Leg day
            <MessageStatusBadge status='completed' />
          </>
        }
        description='Sent to the gym-reminders topic 12 minutes ago.'
      >
        <Button variant='soft'>Send again</Button>
      </ScreenHeader>
      <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]'>
        <div className='flex flex-col gap-5'>
          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <dl className='flex flex-col'>
              <DetailRow label='Title'>{PAYLOAD.title}</DetailRow>
              <DetailRow label='Body'>{PAYLOAD.body}</DetailRow>
              <DetailRow label='Channel'>
                <ChannelBadge channel='push' />
              </DetailRow>
              <DetailRow label='Sent to'>
                <span className='flex items-center gap-2'>
                  <Icon name='IconTagFilled' className='size-4 text-fg-2' />
                  {PAYLOAD.topic}
                </span>
              </DetailRow>
            </dl>
          </Card>
          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Deliveries</CardTitle>
              <CardAction>
                <PillTabs items={FILTERS} value='all' itemClassName='h-6.5 px-2.5 text-xs' />
              </CardAction>
            </CardHeader>
            <Table className='table-fixed'>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscriber</TableHead>
                  <TableHead className='w-24'>Status</TableHead>
                  <TableHead className='w-24'>Sent</TableHead>
                  <TableHead className='w-10'>
                    <span className='sr-only'>Attempts</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DELIVERIES.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <span className='flex min-w-0 items-center gap-1.5'>
                        <span className='truncate'>{delivery.id}</span>
                        <PlatformBadge platform={delivery.platform} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge status={delivery.status} />
                    </TableCell>
                    <TableCell>{delivery.when}</TableCell>
                    <TableCell className='w-0 pr-4 text-right'>
                      <Icon name='IconChevronDownMedium' className='size-4' />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
        <div className='flex flex-col gap-5'>
          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Delivery</CardTitle>
              <CardAction>
                <span className='flex h-1.5 w-24 overflow-hidden rounded-full bg-bg-3'>
                  <span className='bg-green-4' style={{ width: `${(COUNTS.sent / COUNTS.total) * 100}%` }} />
                  <span className='bg-red-4' style={{ width: `${(COUNTS.failed / COUNTS.total) * 100}%` }} />
                </span>
              </CardAction>
            </CardHeader>
            <dl className='flex flex-col'>
              {FUNNEL.map((row) => (
                <div
                  key={row.label}
                  className='flex min-h-10 items-center justify-between gap-3 border-bg-3 border-b px-4 last:border-b-0'
                >
                  <dt className='text-fg-2 text-sm'>{row.label}</dt>
                  <dd className={cn('text-sm tabular-nums', row.value === 0 ? 'text-fg-4' : row.tone)}>
                    <NumberFlow value={row.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Payload</CardTitle>
            </CardHeader>
            <div className='p-4'>
              <CodeBlock code={JSON.stringify(PAYLOAD, null, 2)} className='w-full' />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
