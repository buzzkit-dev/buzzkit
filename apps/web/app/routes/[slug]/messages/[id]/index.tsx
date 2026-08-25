import { Button } from '@buzzkit/ui/components/button';
import { Card, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@buzzkit/ui/components/sheet';
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
import { useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import {
  AttemptOutcomeBadge,
  ChannelBadge,
  DeliveryStatusBadge,
  MessageStatusBadge,
  PlatformBadge,
} from '@/app/components/badges';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import {
  type DeliveryAttempt,
  getMessage,
  listDeliveryAttempts,
  listMessageDeliveries,
  type MessageDelivery,
} from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const STATUSES = ['pending', 'retrying', 'sent', 'delivered', 'bounced', 'failed', 'invalid'] as const;
type DeliveryStatus = (typeof STATUSES)[number];

const FILTERS: { value: DeliveryStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'pending', label: 'Pending' },
];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.title} · BuzzKit` : 'Message · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const url = requestUrl(request);
  const statusParam = url.searchParams.get('status');
  const status = STATUSES.find((entry) => entry === statusParam);
  const deliveryId = url.searchParams.get('delivery');

  const [message, deliveries, attempts] = await Promise.all([
    getMessage(ctx, token, params.slug, 'default', params.id),
    listMessageDeliveries(ctx, token, params.slug, 'default', params.id, { ...readPage(request), status }),
    deliveryId ? listDeliveryAttempts(ctx, token, params.slug, 'default', deliveryId) : Promise.resolve(null),
  ]);
  const payload = message.payload as { title?: string; body?: string };

  return {
    message,
    title: payload.title ?? 'Untitled',
    status: status ?? 'all',
    deliveries: paginate(request, deliveries),
    inspecting: deliveryId ? { id: deliveryId, attempts: attempts ?? [] } : null,
  };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex min-h-10 items-center justify-between gap-3 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='shrink-0 text-fg-2 text-sm'>{label}</dt>
      <dd className='flex min-w-0 items-center gap-1.5 text-right text-fg-3 text-sm'>{children}</dd>
    </div>
  );
}

function FunnelRow({ label, value, tone }: { label: string; value: number; tone?: 'red' }) {
  return (
    <div className='flex min-h-10 items-center justify-between gap-3 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='text-fg-2 text-sm'>{label}</dt>
      <dd
        className={
          tone === 'red' && value > 0
            ? 'text-red-text text-sm tabular-nums'
            : 'text-fg-4 text-sm tabular-nums'
        }
      >
        <NumberFlow value={value} />
      </dd>
    </div>
  );
}

function targetsOf(message: { targets: unknown; topic: string | null }): string[] {
  const targets = message.targets as { to?: string[]; topic?: string };
  const list = targets.to ?? [];
  return targets.topic ? [`topic ${targets.topic}`, ...list] : list;
}

function DeliveryRow({
  delivery,
  slug,
  inspect,
}: {
  delivery: MessageDelivery;
  slug: string;
  inspect: (id: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className='max-w-52'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <Truncate className='text-sm'>
            <Link
              to={`/${slug}/subscribers/${encodeURIComponent(delivery.externalId)}`}
              className='outline-none hover:underline focus-visible:underline'
            >
              {delivery.externalId}
            </Link>
          </Truncate>
          {delivery.platform ? (
            <PlatformBadge platform={delivery.platform as 'ios' | 'android'} />
          ) : (
            <ChannelBadge channel={delivery.channel} />
          )}
        </span>
      </TableCell>
      <TableCell>
        <DeliveryStatusBadge status={delivery.status} />
      </TableCell>
      <TableCell className='max-w-32'>
        {delivery.lastErrorCode ? (
          <Truncate>{delivery.lastErrorCode}</Truncate>
        ) : (
          <span className='text-fg-2'>None</span>
        )}
      </TableCell>
      <TableCell>
        {delivery.sentAt ? (
          <TimeAgo at={delivery.sentAt} />
        ) : (
          <span className='text-fg-2'>
            {delivery.status === 'retrying'
              ? 'Retrying'
              : delivery.status === 'pending'
                ? 'Queued'
                : 'Not sent'}
          </span>
        )}
      </TableCell>
      <TableCell className='w-0 py-1.5 text-right'>
        <Button
          variant='ghost'
          size='icon-xs'
          icon='IconChevronRightMedium'
          aria-label={`Attempts for ${delivery.externalId}`}
          onClick={() => inspect(delivery.id)}
        />
      </TableCell>
    </TableRow>
  );
}

function AttemptCard({ attempt }: { attempt: DeliveryAttempt }) {
  return (
    <div className='flex flex-col gap-3 rounded-xl bg-bg-2 p-3'>
      <div className='flex items-center justify-between gap-3'>
        <span className='flex items-center gap-1.5'>
          <span className='font-medium text-fg-4 text-sm'>Attempt {attempt.attempt}</span>
          <AttemptOutcomeBadge outcome={attempt.outcome} />
        </span>
        <span className='text-fg-2 text-xs'>
          {attempt.latencyMs !== null && <span className='tabular-nums'>{attempt.latencyMs}ms · </span>}
          <Time at={attempt.startedAt} />
        </span>
      </div>
      {(attempt.errorCode || attempt.providerReason) && (
        <div className='flex flex-col gap-0.5 text-xs'>
          {attempt.errorCode && <span className='text-fg-4'>{attempt.errorCode}</span>}
          {attempt.providerReason && (
            <span className='text-fg-2'>
              {attempt.providerReason}
              {attempt.providerStatus !== null && ` · HTTP ${attempt.providerStatus}`}
            </span>
          )}
        </div>
      )}
      {attempt.request !== null && (
        <div className='flex flex-col gap-1'>
          <span className='text-fg-2 text-xs'>Request</span>
          <CodeBlock code={JSON.stringify(attempt.request, null, 2)} className='w-full' />
        </div>
      )}
      {attempt.response !== null && (
        <div className='flex flex-col gap-1'>
          <span className='text-fg-2 text-xs'>Response</span>
          <CodeBlock code={JSON.stringify(attempt.response, null, 2)} className='w-full' />
        </div>
      )}
    </div>
  );
}

export default function MessageRoute({ loaderData, params }: Route.ComponentProps) {
  const { message, status, deliveries, inspecting } = loaderData;
  const navigate = useNavigate();
  const payload = message.payload as unknown as { title?: string; body?: string };
  const counts = message.counts;
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  useLinkedScroll(mainRef, asideRef);
  const inspected = deliveries.items.find((delivery) => delivery.id === inspecting?.id) ?? null;

  const withParams = (patch: Record<string, string | null>) => {
    const search = new URLSearchParams();
    if (status !== 'all') search.set('status', status);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    const query = search.toString();
    return query ? `?${query}` : '';
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={`/${params.slug}/messages`} />}
      >
        Messages
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
              <DetailRow label='Title'>
                <Truncate className='text-fg-4'>{payload.title ?? 'Untitled'}</Truncate>
              </DetailRow>
              {payload.body && (
                <DetailRow label='Body'>
                  <Truncate>{payload.body}</Truncate>
                </DetailRow>
              )}
              <DetailRow label='Channel'>
                <ChannelBadge channel={message.channel} />
              </DetailRow>
              <DetailRow label='Sent to'>
                <Truncate>{targetsOf(message).join(', ')}</Truncate>
              </DetailRow>
              <DetailRow label='Status'>
                <MessageStatusBadge status={message.status} />
              </DetailRow>
              <DetailRow label='Sent'>
                <Time at={message.createdAt} />
              </DetailRow>
              <DetailRow label='Expires'>
                <Time at={message.expiresAt} />
              </DetailRow>
              {message.completedAt && (
                <DetailRow label='Completed'>
                  <Time at={message.completedAt} />
                </DetailRow>
              )}
              {message.idempotencyKey && (
                <DetailRow label='Idempotency key'>
                  <Truncate>{message.idempotencyKey}</Truncate>
                </DetailRow>
              )}
            </dl>
          </Card>

          <Card className='flex min-h-0 flex-col'>
            <CardHeader className='flex-row items-center justify-between py-3'>
              <CardTitle>Deliveries</CardTitle>
              <PillTabs
                items={FILTERS}
                value={status}
                itemClassName='h-6.5 px-2.5 text-xs'
                renderItem={(item, props) => (
                  <Link
                    key={item.value}
                    to={withParams({ status: item.value === 'all' ? null : item.value, delivery: null })}
                    {...props}
                  />
                )}
              />
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                icon='IconPaperPlaneTopRightFilled'
                title={
                  message.status === 'queued'
                    ? 'Working out who is reachable'
                    : status === 'all'
                      ? 'No deliveries'
                      : `No ${status} deliveries`
                }
                description={
                  message.status === 'queued'
                    ? 'Deliveries appear here as the message fans out. Reload to see them.'
                    : status === 'all'
                      ? 'No subscriber was reachable on this channel when the message was sent.'
                      : 'No delivery of this message has that status.'
                }
                size='sm'
                className='border-bg-3 border-t'
              />
            ) : (
              <Table className='border-bg-3 border-t'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>
                      <span className='sr-only'>Attempts</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.items.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      slug={params.slug}
                      inspect={(id) => navigate(withParams({ delivery: id }), { preventScrollReset: true })}
                    />
                  ))}
                </TableBody>
                <TablePagination {...deliveries.pagination} />
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
            <CardHeader className='py-3'>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <dl className='flex flex-col border-bg-3 border-t'>
              <FunnelRow label='Reachable' value={counts.total} />
              <FunnelRow label='Sent' value={counts.sent} />
              {counts.delivered > 0 && <FunnelRow label='Delivered' value={counts.delivered} />}
              <FunnelRow label='Pending' value={counts.pending} />
              <FunnelRow label='Failed' value={counts.failed} tone='red' />
              <FunnelRow label='Invalid' value={counts.invalid} tone='red' />
            </dl>
          </Card>

          <Card>
            <CardHeader className='py-3'>
              <CardTitle>Payload</CardTitle>
            </CardHeader>
            <div className='border-bg-3 border-t p-4'>
              <CodeBlock code={JSON.stringify(message.payload, null, 2)} className='w-full' />
            </div>
          </Card>
        </div>
      </div>

      <Sheet
        open={inspecting !== null}
        onOpenChange={(open) => {
          if (!open) navigate(withParams({ delivery: null }), { preventScrollReset: true });
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>{inspected ? `Delivery to ${inspected.externalId}` : 'Delivery'}</SheetTitle>
            <SheetDescription render={<div />}>
              {inspected ? (
                <Truncate>
                  {`${inspected.platform === 'ios' ? 'iOS' : inspected.platform === 'android' ? 'Android' : inspected.channel} · ${inspected.endpoint ?? inspected.id}`}
                </Truncate>
              ) : (
                'Every attempt to hand this message to the provider.'
              )}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className='flex flex-col gap-3'>
            {inspecting && inspecting.attempts.length === 0 ? (
              <EmptyState
                icon='IconPaperPlaneTopRightFilled'
                title={
                  inspected && ['failed', 'invalid'].includes(inspected.status)
                    ? 'Never attempted'
                    : 'No attempts yet'
                }
                description={
                  inspected && ['failed', 'invalid'].includes(inspected.status)
                    ? `It failed before reaching the provider${inspected.lastErrorCode ? ` with ${inspected.lastErrorCode}` : ''}.`
                    : 'This delivery is queued and has not reached the provider.'
                }
                size='sm'
              />
            ) : (
              inspecting?.attempts.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} />)
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
