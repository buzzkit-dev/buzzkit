import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Icon } from '@buzzkit/ui/components/icon';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import type { Expression } from 'buzzkit/expressions';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import {
  AttemptOutcomeBadge,
  ChannelBadge,
  DeliveryStatusBadge,
  MessageStatusBadge,
  PlatformBadge,
} from '@/app/components/badges';
import { DetailRow } from '@/app/components/detail/row';
import { Funnel } from '@/app/components/messages/funnel';
import { describeTarget } from '@/app/components/messages/target';
import { Conditions } from '@/app/components/segments/conditions';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import {
  type DeliveryAttempt,
  getMessage,
  listDeliveryAttempts,
  listMessageDeliveries,
  type MessageDelivery,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const STATUSES = ['pending', 'retrying', 'sent', 'delivered', 'bounced', 'failed', 'invalid'] as const;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'pending', label: 'Pending' },
];

type DeliveryStatus = (typeof STATUSES)[number];

type Filter = DeliveryStatus | 'all';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.title} · BuzzKit` : 'Message · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const url = requestUrl(request);
  const statusParam = url.searchParams.get('status');
  const status = STATUSES.find((entry) => entry === statusParam);
  const deliveryId = url.searchParams.get('delivery');

  const [message, deliveries, attempts] = await Promise.all([
    getMessage(ctx, token, params.slug, tenant, params.id),
    listMessageDeliveries(ctx, token, params.slug, tenant, params.id, { ...readPage(request), status }),
    deliveryId ? listDeliveryAttempts(ctx, token, params.slug, tenant, deliveryId) : Promise.resolve(null),
  ]);
  const payload = message.payload as { title?: string; body?: string };

  return {
    message,
    title: payload.title ?? 'Untitled',
    status: (status ?? 'all') as Filter,
    deliveries: paginate(request, deliveries),
    expanded: deliveryId ? { id: deliveryId, attempts: attempts ?? [] } : null,
  };
}

function SubHead({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'h-8 whitespace-nowrap border-bg-3 border-b bg-bg-a1/40 px-3 text-left align-middle font-medium text-fg-2 text-xs first:pl-4 last:pr-4',
        className
      )}
    >
      {children}
    </th>
  );
}

function AttemptRow({
  attempt,
  selected,
  selectable,
  onSelect,
}: {
  attempt: DeliveryAttempt;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const reason = [
    attempt.providerReason,
    attempt.providerStatus !== null ? `HTTP ${attempt.providerStatus}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TableRow
      onClick={selectable ? onSelect : undefined}
      aria-selected={selectable ? selected : undefined}
      className={cn(selectable && 'cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer')}
    >
      <TableCell className={cn('font-medium', selected ? 'text-fg-4' : 'text-fg-2')}>
        Attempt {attempt.attempt}
      </TableCell>
      <TableCell>
        <AttemptOutcomeBadge outcome={attempt.outcome} />
      </TableCell>
      <TableCell>
        {attempt.errorCode ? (
          reason ? (
            <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
              <Tooltip>
                <TooltipTrigger render={<span className='inline-block max-w-full align-middle' />}>
                  <Truncate>{attempt.errorCode}</Truncate>
                </TooltipTrigger>
                <TooltipContent>{reason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Truncate>{attempt.errorCode}</Truncate>
          )
        ) : (
          <span className='text-fg-2'>None</span>
        )}
      </TableCell>
      <TableCell>
        <TimeAgo at={attempt.startedAt} />
        {attempt.latencyMs !== null && (
          <span className='text-fg-2 text-xs tabular-nums'> · {attempt.latencyMs}ms</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function AttemptLedger({ attempts }: { attempts: DeliveryAttempt[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = attempts.find((attempt) => attempt.id === selectedId) ?? attempts[attempts.length - 1]!;
  const request = selected.request as unknown;
  const response = selected.response as unknown;

  return (
    <>
      <table className='w-full table-fixed border-separate border-spacing-0 text-sm'>
        <thead>
          <tr>
            <SubHead className='w-28'>Attempt</SubHead>
            <SubHead className='w-24'>Outcome</SubHead>
            <SubHead>Error</SubHead>
            <SubHead className='w-36'>Time</SubHead>
          </tr>
        </thead>
        <tbody className='[&_tr:last-child_td]:border-b-0'>
          {attempts.map((attempt) => (
            <AttemptRow
              key={attempt.id}
              attempt={attempt}
              selected={attempt.id === selected.id}
              selectable={attempts.length > 1}
              onSelect={() => setSelectedId(attempt.id)}
            />
          ))}
        </tbody>
      </table>
      {(request !== null || response !== null) && (
        <div className='grid gap-3 border-bg-3 border-t p-4 md:grid-cols-2'>
          {request !== null && (
            <div className='flex min-w-0 flex-col gap-1.5'>
              <span className='text-fg-2 text-xs'>Request</span>
              <CodeBlock code={JSON.stringify(request, null, 2)} className='w-full' />
            </div>
          )}
          {response !== null && (
            <div className='flex min-w-0 flex-col gap-1.5'>
              <span className='text-fg-2 text-xs'>Response</span>
              <CodeBlock code={JSON.stringify(response, null, 2)} className='w-full' />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DeliveryRow({
  delivery,
  slug,
  expanded,
  attempts,
  onToggle,
}: {
  delivery: MessageDelivery;
  slug: string;
  expanded: boolean;
  attempts: DeliveryAttempt[];
  onToggle: () => void;
}) {
  const settledWithoutAttempt = ['failed', 'invalid'].includes(delivery.status);

  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell>
          <span className='flex min-w-0 items-center gap-1.5'>
            <Truncate>
              <Link
                to={`/${slug}/subscribers/${encodeURIComponent(delivery.externalId)}`}
                onClick={(event) => event.stopPropagation()}
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
        <TableCell>
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
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={5}>
        {attempts.length === 0 ? (
          <EmptyState
            size='sm'
            icon='IconPaperPlaneTopRightFilled'
            title={settledWithoutAttempt ? 'Never attempted' : 'No attempts yet'}
            description={
              settledWithoutAttempt
                ? `It failed before reaching the provider${delivery.lastErrorCode ? ` with ${delivery.lastErrorCode}` : ''}.`
                : 'This delivery is queued and has not reached the provider.'
            }
          />
        ) : (
          <AttemptLedger attempts={attempts} />
        )}
      </TableDetail>
    </>
  );
}

function FunnelRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red';
}) {
  const color =
    value === 0 || !tone
      ? 'text-fg-4'
      : tone === 'green'
        ? 'text-green-text'
        : tone === 'amber'
          ? 'text-amber-text'
          : 'text-red-text';
  return (
    <div className='flex min-h-10 items-center justify-between gap-3 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='text-fg-2 text-sm'>{label}</dt>
      <dd className={cn('text-sm tabular-nums', color)}>
        <NumberFlow value={value} />
      </dd>
    </div>
  );
}

export default function MessageRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { message, status, deliveries, expanded } = loaderData;
  const payload = message.payload as unknown as { title?: string; body?: string };
  const counts = message.counts;
  const target = describeTarget(message.targets);
  const inline = (message.targets as { where?: Expression }).where ?? null;
  const [filter, setFilter] = useState<Filter>(status);
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);

  useLinkedScroll(mainRef, asideRef);

  const withParams = (patch: Record<string, string | null>) => {
    const search = new URLSearchParams();
    if (status !== 'all') search.set('status', status);
    if (expanded) search.set('delivery', expanded.id);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    const query = search.toString();
    return query ? `?${query}` : '.';
  };
  const go = (patch: Record<string, string | null>) =>
    navigate(withParams(patch), { preventScrollReset: true, replace: true });

  useEffect(() => setFilter(status), [status]);

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
              <DetailRow label='Title' copy={payload.title}>
                <Truncate>{payload.title ?? 'Untitled'}</Truncate>
              </DetailRow>
              {payload.body && (
                <DetailRow label='Body' copy={payload.body}>
                  <Truncate>{payload.body}</Truncate>
                </DetailRow>
              )}
              <DetailRow label='Channel'>
                <ChannelBadge channel={message.channel} />
              </DetailRow>
              {inline ? (
                <DetailRow label='Sent to'>
                  <Conditions expression={inline} limit={1} />
                </DetailRow>
              ) : (
                <DetailRow label='Sent to' copy={target.text}>
                  <Icon name={target.icon} className='mt-px size-4 shrink-0 text-fg-2' />
                  <Truncate>{target.text}</Truncate>
                </DetailRow>
              )}
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
                <DetailRow label='Idempotency key' copy={message.idempotencyKey}>
                  <Truncate>{message.idempotencyKey}</Truncate>
                </DetailRow>
              )}
            </dl>
          </Card>

          <Card className='flex min-h-0 flex-col'>
            <CardHeader className='py-3'>
              <CardTitle>Deliveries</CardTitle>
              <CardAction>
                <PillTabs
                  items={FILTERS}
                  value={filter}
                  itemClassName='h-6.5 px-2.5 text-xs'
                  onValueChange={(value) => {
                    setFilter(value);
                    go({ status: value === 'all' ? null : value, delivery: null });
                  }}
                />
              </CardAction>
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                size='sm'
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
              />
            ) : (
              <Table className='table-fixed border-bg-3 border-t'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead className='w-24'>Status</TableHead>
                    <TableHead className='w-28'>Error</TableHead>
                    <TableHead className='w-16'>Sent</TableHead>
                    <TableHead className='w-12'>
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
                      expanded={expanded?.id === delivery.id}
                      attempts={expanded?.id === delivery.id ? expanded.attempts : []}
                      onToggle={() => go({ delivery: expanded?.id === delivery.id ? null : delivery.id })}
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
              <CardAction>
                <Funnel counts={counts} status={message.status} className='w-24' />
              </CardAction>
            </CardHeader>
            <dl className='flex flex-col border-bg-3 border-t'>
              <FunnelRow label='Reachable' value={counts.total} />
              <FunnelRow label='Sent' value={counts.sent} tone='green' />
              {counts.delivered > 0 && <FunnelRow label='Delivered' value={counts.delivered} tone='green' />}
              <FunnelRow label='Pending' value={counts.pending} tone='amber' />
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
    </div>
  );
}
