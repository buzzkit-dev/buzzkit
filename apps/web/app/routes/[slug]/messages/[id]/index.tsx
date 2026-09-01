import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@buzzkit/ui/components/alert-dialog';
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
import {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger,
} from '@buzzkit/ui/components/tooltip';
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
import { Conditions } from '@/app/components/conditions/chips';
import { DetailRow } from '@/app/components/detail/row';
import { Funnel } from '@/app/components/messages/funnel';
import { Recipients } from '@/app/components/messages/recipients';
import { describeTarget } from '@/app/components/messages/target';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { messageAction } from '@/app/lib/actions/messages.server';
import {
  type DeliveryAttempt,
  getMessage,
  getSubscriber,
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

const RECIPIENT_TIMEZONE_LOOKUPS = 20;

export const action = messageAction;

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
  const recipients = (message.targets as { to?: string[] }).to ?? [];
  const schedule = message.schedule as unknown as { timezone: string } | null;
  let lookups: Array<Awaited<ReturnType<typeof getSubscriber>> | null> = [];
  if (schedule?.timezone === 'subscriber') {
    lookups = await Promise.all(
      recipients
        .slice(0, RECIPIENT_TIMEZONE_LOOKUPS)
        .map((externalId) => getSubscriber(ctx, token, params.slug, tenant, externalId).catch(() => null))
    );
  }
  const recipientTimezones = [
    ...new Set(
      lookups
        .map((recipient) => (recipient?.attributes as { $timezone?: unknown } | undefined)?.$timezone)
        .filter((zone): zone is string => typeof zone === 'string')
    ),
  ];

  return {
    message,
    recipientTimezones,
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
  const reason =
    attempt.providerReason || attempt.providerStatus !== null ? (
      <span>
        {attempt.providerReason}
        {attempt.providerReason && attempt.providerStatus !== null && ' '}
        {attempt.providerStatus !== null && <TooltipLabel>HTTP {attempt.providerStatus}</TooltipLabel>}
      </span>
    ) : null;

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
  const selected = attempts.find((attempt) => attempt.id === selectedId) ?? attempts.at(-1)!;
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
  const { message, status, deliveries, expanded, recipientTimezones } = loaderData;
  const payload = message.payload as unknown as { title?: string; body?: string };
  const counts = message.counts;
  const target = describeTarget(message.targets);
  const inline = (message.targets as { where?: Expression }).where ?? null;
  const plainTargets = message.targets as { to?: string[]; topic?: string; segment?: string };
  const targetHref = plainTargets.segment
    ? `/${params.slug}/segments/${plainTargets.segment}`
    : plainTargets.topic
      ? `/${params.slug}/topics`
      : plainTargets.to?.length === 1
        ? `/${params.slug}/subscribers/${encodeURIComponent(plainTargets.to[0] ?? '')}`
        : null;
  const schedule = message.schedule as unknown as { at: string; timezone: string } | null;
  const cancelable =
    message.status === 'scheduled' ||
    (schedule?.timezone === 'subscriber' && message.status === 'processing' && !message.canceledAt);
  const [filter, setFilter] = useState<Filter>(status);
  const [cancelOpen, setCancelOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);

  const { submit: submitCancel, pending: canceling } = useActionFetcher(() => setCancelOpen(false));

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
            <CardHeader divider className='py-3'>
              <CardTitle>Overview</CardTitle>
              {cancelable && (
                <CardAction>
                  <Button variant='soft' size='xs' onClick={() => setCancelOpen(true)}>
                    Cancel message
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <dl className='flex flex-col'>
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
                <DetailRow label='Sent to' copy={target.full}>
                  <Recipients list={target.list}>
                    <span className='flex min-w-0 items-center gap-2'>
                      <Icon name={target.icon} className='mt-px size-4 shrink-0 text-fg-2' />
                      {targetHref ? (
                        <Truncate>
                          <Link to={targetHref} className='underline-offset-2 hover:underline'>
                            {target.text}
                          </Link>
                        </Truncate>
                      ) : (
                        <Truncate>{target.text}</Truncate>
                      )}
                    </span>
                  </Recipients>
                </DetailRow>
              )}
              <DetailRow label='Status'>
                <MessageStatusBadge status={message.status} />
              </DetailRow>
              {schedule && message.scheduledFor && (
                <DetailRow label='Scheduled' copy={schedule.at}>
                  <Truncate>
                    {schedule.at.replace('T', ' ')}{' '}
                    <span className='text-fg-2'>
                      {schedule.timezone === 'subscriber'
                        ? `Local time${
                            recipientTimezones.length === 1
                              ? ` (${recipientTimezones[0]})`
                              : recipientTimezones.length > 1
                                ? ` (${recipientTimezones.length} time zones)`
                                : ''
                          }`
                        : schedule.timezone.replace(/_/g, ' ')}
                    </span>
                  </Truncate>
                </DetailRow>
              )}
              <DetailRow label={schedule ? 'Created' : 'Sent'}>
                <Time at={message.createdAt} />
              </DetailRow>
              {message.canceledAt && (
                <DetailRow label='Canceled'>
                  <Time at={message.canceledAt} />
                </DetailRow>
              )}
              <DetailRow label='Expires'>
                <Time at={message.expiresAt} />
              </DetailRow>
              {message.completedAt && message.status === 'completed' && (
                <DetailRow label='Completed'>
                  <Time at={message.completedAt} />
                </DetailRow>
              )}
              {message.run && (
                <DetailRow label='Workflow run' copy={message.run.id}>
                  <Link
                    to={`/${params.slug}/runs/${message.run.id}`}
                    className='truncate underline-offset-2 hover:underline'
                  >
                    {message.run.step}
                  </Link>
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
            <CardHeader divider className='py-3'>
              <CardTitle>Deliveries</CardTitle>
              <CardAction>
                <PillTabs
                  items={FILTERS}
                  value={filter}
                  itemClassName='h-6.5 px-2.5 text-xs'
                  onValueChange={(value) => {
                    setFilter(value);
                    void go({ status: value === 'all' ? null : value, delivery: null });
                  }}
                />
              </CardAction>
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconPaperPlaneTopRightFilled'
                title={
                  message.status === 'scheduled'
                    ? 'Not sent yet'
                    : message.status === 'canceled'
                      ? 'Canceled before sending'
                      : message.status === 'queued'
                        ? 'Working out who is reachable'
                        : status === 'all'
                          ? 'No deliveries'
                          : `No ${status} deliveries`
                }
                description={
                  message.status === 'scheduled'
                    ? 'Deliveries appear here once the message goes out.'
                    : message.status === 'canceled'
                      ? 'Nothing went out to anyone.'
                      : message.status === 'queued'
                        ? 'Deliveries appear here as the message fans out. Reload to see them.'
                        : status === 'all'
                          ? 'No subscriber was reachable on this channel when the message was sent.'
                          : 'No delivery of this message has that status.'
                }
              />
            ) : (
              <Table className='table-fixed'>
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
            <CardHeader divider className='py-3'>
              <CardTitle>Delivery</CardTitle>
              <CardAction>
                <Funnel
                  schedule={message.schedule}
                  counts={counts}
                  status={message.status}
                  className='w-24'
                />
              </CardAction>
            </CardHeader>
            <dl className='flex flex-col'>
              <FunnelRow label='Reachable' value={counts.total} />
              <FunnelRow label='Sent' value={counts.sent} tone='green' />
              {counts.delivered > 0 && <FunnelRow label='Delivered' value={counts.delivered} tone='green' />}
              <FunnelRow label='Pending' value={counts.pending} tone='amber' />
              <FunnelRow label='Failed' value={counts.failed} tone='red' />
              <FunnelRow label='Invalid' value={counts.invalid} tone='red' />
            </dl>
          </Card>

          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Payload</CardTitle>
            </CardHeader>
            <div className='p-4'>
              <CodeBlock code={JSON.stringify(message.payload, null, 2)} className='w-full' />
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{payload.title ?? 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Delivery of this message stops.
              <span className='block'>Deliveries already made stay as they are.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={canceling}
              onClick={() => submitCancel('cancel', {})}
            >
              Cancel message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
