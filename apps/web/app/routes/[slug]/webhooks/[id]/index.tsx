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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FieldGroup } from '@buzzkit/ui/components/field';
import { Icon } from '@buzzkit/ui/components/icon';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useRevalidator, useSearchParams } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { EndpointStatusBadge, WebhookAttemptBadge, WebhookStatusBadge } from '@/app/components/badges';
import { DetailRow } from '@/app/components/detail/row';
import { CardSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { describeEvents } from '@/app/components/webhooks/describe';
import { ALL_TENANTS, EndpointFields, useEndpointForm } from '@/app/components/webhooks/endpoint-form';
import { EventsSummary } from '@/app/components/webhooks/events-summary';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { webhooksAction } from '@/app/lib/actions/webhooks.server';
import {
  ApiError,
  getWebhook,
  getWebhookCatalog,
  getWebhookDelivery,
  listTenants,
  listWebhookDeliveries,
  requireFound,
  type WebhookCatalog,
  type WebhookDelivery,
  type WebhookDeliveryDetail,
  type WebhookDeliveryQuery,
  type WebhookDetail,
} from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const LIVE_POLL_MS = 3_000;

const LIVE_POLL_MAX_MS = 60_000;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Delivered' },
  { value: 'failed', label: 'Retrying' },
  { value: 'exhausted', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];

type Filter = 'all' | NonNullable<WebhookDeliveryQuery['status']>;

type Attempt = WebhookDeliveryDetail['attempts'][number];

type Detail = Awaited<Awaited<ReturnType<typeof loader>>['detail']>;

const DELIVERY_COLUMNS: TableColumn[] = [
  { label: 'Event', fill: 'h-4 w-40' },
  { label: 'Status', className: 'w-24', fill: 'h-5 w-16 rounded-full' },
  { label: 'Attempts', className: 'w-20', fill: 'h-4 w-6' },
  { label: 'Response', className: 'w-24', fill: 'h-4 w-8' },
  { label: 'Last attempt', className: 'w-28', fill: 'h-4 w-16' },
  { key: 'actions', label: 'Actions', hidden: true, className: 'w-12', fill: 'h-4 w-4' },
];

export function meta() {
  return [{ title: 'Webhook · BuzzKit' }];
}

export function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const status = FILTERS.find((entry) => entry.value === search.get('status'))?.value;
  const expandedId = search.get('delivery');

  return {
    filter: status ?? 'all',
    detail: (async () => {
      const [endpoint, page, tenants, catalog, expanded] = await Promise.all([
        requireFound(getWebhook(ctx, token, params.slug, params.id)),
        listWebhookDeliveries(ctx, token, params.slug, params.id, {
          ...readPage(request),
          ...(status && status !== 'all' ? { status } : {}),
        }),
        listTenants(ctx, token, params.slug),
        getWebhookCatalog(ctx, token, params.slug),
        expandedId
          ? getWebhookDelivery(ctx, token, params.slug, params.id, expandedId).catch((error) => {
              if (error instanceof ApiError && error.status === 404) return null;
              throw error;
            })
          : null,
      ]);
      return { endpoint, deliveries: paginate(request, page), tenants, catalog, expanded };
    })(),
  };
}

export const action = webhooksAction;

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body.trimStart().startsWith('{') || body.trimStart().startsWith('[') ? indentJson(body) : body;
  }
}

function indentJson(source: string): string {
  let output = '';
  let depth = 0;
  let inString = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (inString) {
      output += character;
      if (character === '\\') output += source[++index] ?? '';
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === '{' || character === '[') {
      depth += 1;
      output += `${character}\n${'  '.repeat(depth)}`;
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1);
      output += `\n${'  '.repeat(depth)}${character}`;
    } else if (character === ',') {
      output += `,\n${'  '.repeat(depth)}`;
    } else if (character === ':') {
      output += ': ';
    } else if (character !== ' ' && character !== '\n') {
      output += character;
    }
  }
  return output;
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
  attempt: Attempt;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  return (
    <TableRow
      onClick={selectable ? onSelect : undefined}
      aria-selected={selectable ? selected : undefined}
      className={cn(selectable && 'cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer')}
    >
      <TableCell className={cn('font-medium', selected ? 'text-fg-4' : 'text-fg-2')}>
        Attempt {attempt.attempt}
      </TableCell>
      <TableCell className='py-2'>
        <WebhookAttemptBadge status={attempt.status} />
      </TableCell>
      <TableCell>
        {attempt.error ? <Truncate>{attempt.error}</Truncate> : <span className='text-fg-2'>None</span>}
      </TableCell>
      <TableCell>
        <TimeAgo at={attempt.createdAt} />
        <span className='text-fg-2 text-xs tabular-nums'> · {attempt.durationMs}ms</span>
      </TableCell>
    </TableRow>
  );
}

function AttemptLedger({
  detail,
  onReplay,
  replaying,
  canReplay,
}: {
  detail: WebhookDeliveryDetail;
  onReplay: () => void;
  replaying: boolean;
  canReplay: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const attempts = detail.attempts;
  const selected = attempts.find((attempt) => attempt.id === selectedId) ?? attempts.at(-1) ?? null;
  const responseBody = selected?.responseBody ?? null;
  const responseNote = selected ? (selected.error ?? 'Empty response') : 'Not attempted yet';

  return (
    <>
      {attempts.length > 0 && (
        <table className='w-full table-fixed border-separate border-spacing-0 text-sm'>
          <thead>
            <tr>
              <SubHead className='w-28'>Attempt</SubHead>
              <SubHead className='w-28'>Outcome</SubHead>
              <SubHead>Error</SubHead>
              <SubHead className='w-40'>Time</SubHead>
            </tr>
          </thead>
          <tbody className='[&_tr:last-child_td]:border-b-0'>
            {attempts.map((attempt) => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                selected={attempt.id === selected?.id}
                selectable={attempts.length > 1}
                onSelect={() => setSelectedId(attempt.id)}
              />
            ))}
          </tbody>
        </table>
      )}
      {canReplay && (
        <div className='flex items-center justify-between border-bg-3 border-t px-4 pt-3'>
          <span className='text-fg-2 text-sm'>Sends the same event again as one more attempt.</span>
          <Button variant='soft' size='xs' loading={replaying} onClick={onReplay}>
            Resend
          </Button>
        </div>
      )}
      <div className={cn('grid gap-3 p-4 md:grid-cols-2', !canReplay && 'border-bg-3 border-t')}>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <span className='text-fg-2 text-xs'>Request</span>
          <CodeBlock code={JSON.stringify(detail.event?.payload ?? null, null, 2)} className='w-full' />
        </div>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <span className='text-fg-2 text-xs'>Response</span>
          {responseBody ? (
            <CodeBlock code={formatBody(responseBody)} className='w-full' />
          ) : (
            <span className='text-fg-2 text-sm'>{responseNote}</span>
          )}
        </div>
      </div>
    </>
  );
}

function DeliveryRow({
  delivery,
  expanded,
  detail,
  onToggle,
  onReplay,
  replaying,
  canReplay,
}: {
  delivery: WebhookDelivery;
  expanded: boolean;
  detail: WebhookDeliveryDetail | null;
  onToggle: () => void;
  onReplay: () => void;
  replaying: boolean;
  canReplay: boolean;
}) {
  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell className='font-medium text-fg-4'>
          <Truncate className='block'>{delivery.eventType ?? delivery.eventId}</Truncate>
        </TableCell>
        <TableCell className='py-2'>
          <WebhookStatusBadge status={delivery.status} />
        </TableCell>
        <TableCell className='tabular-nums'>{delivery.attempts}</TableCell>
        <TableCell>
          {delivery.lastStatus ?? (
            <span className='text-fg-2'>{delivery.lastError ? 'No response' : 'None'}</span>
          )}
        </TableCell>
        <TableCell>
          {delivery.lastAttemptAt ? (
            <TimeAgo at={delivery.lastAttemptAt} />
          ) : (
            <span className='text-fg-2'>Never</span>
          )}
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={6}>
        {detail ? (
          <AttemptLedger detail={detail} onReplay={onReplay} replaying={replaying} canReplay={canReplay} />
        ) : (
          <div className='px-4 py-3 text-fg-2 text-sm'>Loading the delivery.</div>
        )}
      </TableDetail>
    </>
  );
}

function EditForm({
  endpoint,
  catalog,
  tenants,
  onClose,
}: {
  endpoint: WebhookDetail;
  catalog: WebhookCatalog;
  tenants: { id: string; name: string; slug: string; isDefault: boolean }[];
  onClose: () => void;
}) {
  const { submit, pending } = useActionFetcher(() => onClose());
  const form = useEndpointForm(
    {
      url: endpoint.url,
      description: endpoint.description ?? '',
      tenant: tenants.find((entry) => entry.id === endpoint.tenantId)?.slug ?? ALL_TENANTS,
      events: endpoint.events,
    },
    catalog
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit endpoint</DialogTitle>
      </DialogHeader>
      <FieldGroup className='w-full'>
        <EndpointFields form={form} catalog={catalog} tenants={tenants} idPrefix='edit' />
        <Button
          className='w-full'
          disabled={!form.valid || pending}
          loading={pending}
          onClick={() =>
            submit('update', {
              id: endpoint.id,
              url: form.values.url,
              description: form.values.description,
              tenant: form.values.tenant,
              events: JSON.stringify(form.values.events),
            })
          }
        >
          Save changes
        </Button>
      </FieldGroup>
    </>
  );
}

function EndpointFallback() {
  return (
    <>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-1'>
          <Skeleton className='h-7 w-48' />
          <Skeleton className='h-4 w-72' />
        </div>
      </header>

      <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-5 [&>*]:shrink-0'>
          <TableSkeleton columns={DELIVERY_COLUMNS} rows={5} />
        </div>
        <div className='flex min-h-0 min-w-0 flex-col gap-5 lg:w-[calc(22rem+0.5rem)] lg:shrink-0 [&>*]:shrink-0'>
          <CardSkeleton title='Overview' lines={4} />
          <CardSkeleton title='Signing secret' lines={1} />
        </div>
      </div>
    </>
  );
}

function EndpointDetail({ detail, base, filter }: { detail: Detail; base: string; filter: Filter }) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();
  const { submit, pending } = useActionFetcher((data) => {
    setRotateOpen(false);
    if (data.deleted) void navigate(base);
  });
  const { submit: replay, pending: replaying } = useActionFetcher();
  const { endpoint, deliveries, tenants, catalog, expanded } = detail;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const tenantName = tenants.find((entry) => entry.id === endpoint.tenantId)?.name ?? null;
  const [revealed, setRevealed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edits, setEdits] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);

  useLinkedScroll(mainRef, asideRef);

  const withParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const key of ['cursor', 'trail']) next.delete(key);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `?${query}` : '.';
  };
  const go = (patch: Record<string, string | null>) =>
    navigate(withParams(patch), { preventScrollReset: true, replace: true });

  useEffect(() => {
    const now = Date.now();
    const due = deliveries.items.flatMap((delivery) => {
      if (delivery.status === 'pending') return [now + LIVE_POLL_MS];
      if (delivery.status !== 'failed') return [];
      const next = delivery.nextAttemptAt ? new Date(delivery.nextAttemptAt).getTime() + 2_000 : now;
      return [Math.max(next, now + LIVE_POLL_MS)];
    });
    if (due.length === 0) return;
    const timer = setTimeout(
      () => {
        if (revalidator.state === 'idle') void revalidator.revalidate();
      },
      Math.min(Math.min(...due) - now, LIVE_POLL_MAX_MS)
    );
    return () => clearTimeout(timer);
  }, [deliveries.items, revalidator]);

  return (
    <>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h1 className='flex min-w-0 items-center gap-2.5 font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            <Truncate>{endpoint.url}</Truncate>
            <EndpointStatusBadge enabled={endpoint.enabled} failing={endpoint.failingSince !== null} />
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            {endpoint.description ?? describeEvents(endpoint.events)}
          </p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='soft'
                  size='icon'
                  icon='IconDotGrid1x3Horizontal'
                  aria-label='Endpoint actions'
                />
              }
            />
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onClick={() => {
                  setEdits((count) => count + 1);
                  setEditOpen(true);
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => submit(endpoint.enabled ? 'disable' : 'enable', { id: endpoint.id })}
              >
                {endpoint.enabled ? 'Disable' : 'Enable'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRotateOpen(true)}>Rotate secret</DropdownMenuItem>
              <DropdownMenuItem variant='destructive' onClick={() => setDeleteOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
        <ScrollFade targetRef={mainRef} />
        <div
          ref={mainRef}
          className='-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
        >
          <Card className='flex min-h-0 flex-col'>
            <CardHeader divider className='py-3'>
              <CardTitle>Deliveries</CardTitle>
              <CardAction>
                <PillTabs
                  items={FILTERS}
                  value={filter}
                  itemClassName='h-6.5 px-2.5 text-xs'
                  onValueChange={(value) => go({ status: value === 'all' ? null : value, delivery: null })}
                />
              </CardAction>
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconWebhooksFilled'
                title={filter === 'all' ? 'No deliveries yet' : 'No deliveries match'}
                description={
                  filter === 'all'
                    ? 'Deliveries appear here as events happen.'
                    : 'No delivery to this endpoint has that status.'
                }
              />
            ) : (
              <Table className='table-fixed'>
                <TableColumns columns={DELIVERY_COLUMNS} />
                <TableBody>
                  {deliveries.items.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      expanded={expanded?.id === delivery.id}
                      detail={expanded?.id === delivery.id ? expanded : null}
                      onToggle={() => go({ delivery: expanded?.id === delivery.id ? null : delivery.id })}
                      onReplay={() => replay('replay', { id: endpoint.id, deliveryId: delivery.id })}
                      replaying={replaying}
                      canReplay={canManage && endpoint.enabled}
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
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <dl className='flex flex-col'>
              <DetailRow label='URL' copy={endpoint.url}>
                <Truncate>{endpoint.url}</Truncate>
              </DetailRow>
              {tenants.length > 1 && (
                <DetailRow label='Tenant'>
                  {tenantName ?? <span className='text-fg-2'>All tenants</span>}
                </DetailRow>
              )}
              <DetailRow label='Events'>
                <EventsSummary events={endpoint.events} />
              </DetailRow>
              <DetailRow label='Created'>
                <Time at={endpoint.createdAt} />
              </DetailRow>
              {endpoint.failingSince && (
                <DetailRow label='Failing since'>
                  <TimeAgo at={endpoint.failingSince} />
                </DetailRow>
              )}
              {endpoint.disabledAt && (
                <DetailRow label='Disabled'>
                  <span className='flex items-center gap-1.5'>
                    <TimeAgo at={endpoint.disabledAt} />
                    {endpoint.disabledReason && (
                      <span className='text-fg-2'>· {endpoint.disabledReason}</span>
                    )}
                  </span>
                </DetailRow>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Signing secret</CardTitle>
              <CardAction>
                <Button variant='ghost' size='xs' onClick={() => setRevealed((current) => !current)}>
                  {revealed ? 'Hide' : 'Reveal'}
                </Button>
              </CardAction>
            </CardHeader>
            <dl className='flex flex-col'>
              <DetailRow label='Secret' copy={endpoint.secret}>
                <Truncate className='text-xs'>
                  {revealed ? endpoint.secret : 'whsec_••••••••••••••••'}
                </Truncate>
              </DetailRow>
              {endpoint.previousSecret && endpoint.previousSecretExpiresAt && (
                <>
                  <DetailRow label='Previous' copy={endpoint.previousSecret}>
                    <Truncate className='text-xs'>
                      {revealed ? endpoint.previousSecret : 'whsec_••••••••••••••••'}
                    </Truncate>
                  </DetailRow>
                  <DetailRow label='Previous valid until'>
                    <Time at={endpoint.previousSecretExpiresAt} />
                  </DetailRow>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent showCloseButton>
          <EditForm
            key={edits}
            endpoint={endpoint}
            catalog={catalog}
            tenants={tenants}
            onClose={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate the signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              Deliveries are signed with the new secret right away. The current secret keeps verifying for 24
              hours so you can roll your receiver over.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => submit('rotate', { id: endpoint.id })}>
              Rotate secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              Deliveries to it stop immediately and its history is no longer shown. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => submit('delete', { id: endpoint.id })}
            >
              Delete endpoint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function WebhookRoute({ loaderData, params }: Route.ComponentProps) {
  const { detail, filter } = loaderData;
  const base = `/${params.slug}/webhooks`;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={base} />}
      >
        Webhooks
      </Button>

      <Deferred resolve={detail}>
        {(data) =>
          data === undefined ? (
            <EndpointFallback />
          ) : (
            <EndpointDetail detail={data} base={base} filter={filter} />
          )
        }
      </Deferred>
    </div>
  );
}
