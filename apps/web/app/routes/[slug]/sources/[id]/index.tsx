import {
  DELIVERY_OUTCOMES,
  detectProvider,
  isSourceMapping,
  lintSourceMapping,
  type MappedEvent,
  mapPayload,
  readPath,
  SOURCE_PRESETS,
  type SourceMapping,
  STANDARD_WEBHOOK_HEADERS,
  SVIX_HEADERS,
  suggestMapping,
  type Verification,
} from '@buzzkit/schema/sources';
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
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { Input } from '@buzzkit/ui/components/input';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { toast } from '@buzzkit/ui/components/sonner';
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
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useOutletContext, useSearchParams } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { IngestOutcomeBadge, SourceStatusBadge } from '@/app/components/badges';
import { ConditionChips } from '@/app/components/conditions/chips';
import { DetailRow } from '@/app/components/detail/row';
import {
  describeReason,
  providerLabel,
  secretHint,
  verificationClause,
} from '@/app/components/sources/describe';
import { ProviderLogo } from '@/app/components/sources/logo';
import { whereTree } from '@/app/components/workflows/trigger';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { TIME_TOOLTIP_DELAY, Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { sourcesAction } from '@/app/lib/actions/sources.server';
import { getSource, listSourceDeliveries, type Source, type SourceDelivery } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { lineOf, parseJson } from '@/app/lib/utils/json';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const KEY_ORDER = ['id', 'type', 'timestamp', 'subscriber', 'path', 'attribute', 'events', 'data', 'where'];

const OUTCOME_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'event', label: 'Events' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'unverified', label: 'Unverified' },
];

const SCHEMES: { value: SchemeChoice; label: string }[] = [
  { value: 'stripe', label: 'Stripe signature' },
  { value: 'standard-webhooks', label: 'Standard Webhooks headers' },
  { value: 'svix', label: 'Svix headers' },
  { value: 'header', label: 'Shared secret header' },
];

type SchemeChoice = 'stripe' | 'standard-webhooks' | 'svix' | 'header';

type Problem = { path: string; message: string; line: number | null };

type MappingResult = {
  mapping: SourceMapping | null;
  syntax: { message: string; line: number; column: number } | null;
  problems: Problem[];
};

type SampleResult =
  | { kind: 'empty' }
  | { kind: 'syntax'; message: string; line: number; column: number }
  | { kind: 'parsed'; value: unknown };

type ServerPreview = {
  outcome: 'event' | 'dropped';
  reason?: string | null;
  detail?: string | null;
  event?: MappedEvent & { externalId?: string };
};

type Suggestion = {
  key: string;
  text: string;
  setupAs?: string;
  action?: { label: string; apply: (mapping: SourceMapping) => SourceMapping };
};

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.source.name} · BuzzKit` : 'Source · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const requested = requestUrl(request).searchParams.get('outcome') ?? '';
  const outcome = (DELIVERY_OUTCOMES as readonly string[]).includes(requested) ? requested : undefined;
  const [source, page] = await Promise.all([
    getSource(ctx, token, params.slug, tenant, params.id),
    listSourceDeliveries(ctx, token, params.slug, tenant, params.id, {
      ...readPage(request),
      ...(outcome ? { outcome } : {}),
    }),
  ]);
  return {
    source,
    deliveries: paginate(request, page),
    ingestUrl: `${env.API_URL}${source.url}`,
    setup: requestUrl(request).searchParams.has('setup'),
    outcomeFilter: outcome ?? 'all',
  };
}

export const action = sourcesAction;

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => {
    const a = KEY_ORDER.indexOf(left);
    const b = KEY_ORDER.indexOf(right);
    if (a === -1 && b === -1) return 0;
    if (a === -1) return 1;
    if (b === -1) return -1;
    return a - b;
  });
  return Object.fromEntries(keys.map((key) => [key, key === 'where' ? record[key] : ordered(record[key])]));
}

function prettyMapping(mapping: unknown): string {
  return JSON.stringify(ordered(mapping), null, 2);
}

function parseMapping(text: string): MappingResult {
  if (text.trim().length === 0) {
    return {
      mapping: null,
      syntax: null,
      problems: [{ path: '', message: 'Write the mapping.', line: null }],
    };
  }
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return {
      mapping: null,
      syntax: { message: parsed.message, line: parsed.line, column: parsed.column },
      problems: [],
    };
  }
  const problems = lintSourceMapping(parsed.value).map((problem) => ({
    path: problem.path.join('.'),
    message: problem.message,
    line: lineOf(parsed.locations, problem.path),
  }));
  const mapping = problems.length === 0 && isSourceMapping(parsed.value) ? parsed.value : null;
  return { mapping, syntax: null, problems };
}

function parseSample(text: string): SampleResult {
  if (text.trim().length === 0) return { kind: 'empty' };
  const parsed = parseJson(text);
  if (!parsed.ok)
    return { kind: 'syntax', message: parsed.message, line: parsed.line, column: parsed.column };
  return { kind: 'parsed', value: parsed.value };
}

function schemeOf(verification: Verification): SchemeChoice {
  if (verification.scheme === 'standard-webhooks') {
    return verification.headers.id === SVIX_HEADERS.id ? 'svix' : 'standard-webhooks';
  }
  return verification.scheme;
}

function verificationOf(choice: SchemeChoice, header: string): Verification {
  if (choice === 'stripe') return { scheme: 'stripe' };
  if (choice === 'standard-webhooks')
    return { scheme: 'standard-webhooks', headers: STANDARD_WEBHOOK_HEADERS };
  if (choice === 'svix') return { scheme: 'standard-webhooks', headers: SVIX_HEADERS };
  return { scheme: 'header', header };
}

function subscriberPath(mapping: SourceMapping): string {
  return typeof mapping.subscriber === 'string' ? mapping.subscriber : mapping.subscriber.path;
}

function withSubscriberPath(mapping: SourceMapping, path: string): SourceMapping {
  return {
    ...mapping,
    subscriber: typeof mapping.subscriber === 'string' ? path : { ...mapping.subscriber, path },
  };
}

function withEvent(mapping: SourceMapping, providerType: string): SourceMapping {
  return { ...mapping, events: { ...mapping.events, [providerType]: true } };
}

function passthrough(mapping: SourceMapping): boolean {
  return mapping.events['*'] === true;
}

function subscriberLabel(subscriber: MappedEvent['subscriber']): string {
  return 'externalId' in subscriber ? subscriber.externalId : `${subscriber.attribute} = ${subscriber.value}`;
}

function suggestionsFor(mapping: SourceMapping, sample: unknown, provider: string): Suggestion[] {
  const found = suggestMapping(sample);
  const unread = (path: string | undefined) => path !== undefined && readPath(sample, path) === undefined;
  const out: Suggestion[] = [];
  if (found.provider && found.provider !== provider) {
    out.push({
      key: 'provider',
      text: `This payload looks like ${providerLabel(found.provider)}.`,
      setupAs: found.provider,
    });
  }
  if (unread(mapping.type) && found.type[0]) {
    const path = found.type[0].path;
    out.push({
      key: 'type',
      text: `The event type is not at ${mapping.type}. It looks like ${path}.`,
      action: { label: `Read it from ${path}`, apply: (current) => ({ ...current, type: path }) },
    });
  }
  if (unread(mapping.id) && found.id[0]) {
    const path = found.id[0].path;
    out.push({
      key: 'id',
      text: `The event id is not at ${mapping.id}. It looks like ${path}.`,
      action: { label: `Read it from ${path}`, apply: (current) => ({ ...current, id: path }) },
    });
  }
  if (unread(mapping.timestamp) && found.timestamp[0]) {
    const path = found.timestamp[0].path;
    out.push({
      key: 'timestamp',
      text: `The time is not at ${mapping.timestamp}. It looks like ${path}.`,
      action: { label: `Read it from ${path}`, apply: (current) => ({ ...current, timestamp: path }) },
    });
  }
  if (unread(subscriberPath(mapping)) && found.subscriber[0]) {
    const path = found.subscriber[0].path;
    out.push({
      key: 'subscriber',
      text: `The subscriber is not at ${subscriberPath(mapping)}. It looks like ${path}.`,
      action: { label: `Read it from ${path}`, apply: (current) => withSubscriberPath(current, path) },
    });
  }
  const outcome = mapPayload(mapping, sample);
  if (outcome.outcome === 'dropped' && outcome.reason === 'unlisted_type') {
    const type = readPath(sample, mapping.type);
    if (typeof type === 'string') {
      out.push({
        key: 'event',
        text: `${type} is not mapped to an event, so deliveries of it are dropped.`,
        action: { label: `Map ${type} as an event`, apply: (current) => withEvent(current, type) },
      });
    }
  }
  return out;
}

function Chip({ icon, children }: { icon?: IconName; children: React.ReactNode }) {
  return (
    <Badge size='sm' icon={icon} className='min-w-0 max-w-full shrink whitespace-nowrap'>
      <Truncate className='max-w-full font-medium text-fg-4'>{children}</Truncate>
    </Badge>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className='text-fg-2'>{children}</span>;
}

const ROW_HELP = {
  type: 'The path in the payload that names what happened, such as "type". Deliveries without it are dropped.',
  id: "The path to the provider's id for the delivery. A second delivery with the same id after one became an event is recorded as a duplicate, never sent twice.",
  timestamp:
    'The path to when it happened at the provider (seconds, milliseconds or ISO 8601). The event carries that time; without a path it carries the moment the delivery arrived.',
  subscriber:
    'How the delivery is tied to a subscriber: a path whose value is their external id, or a path whose value is looked up in one of their attributes. No match means the delivery is dropped and nothing is created.',
  where:
    'A condition over the payload. Deliveries that fail it are dropped before anything else, for instance Stripe test-mode events.',
  data: 'Which payload values are kept on the event, by key and path. The raw payload is never forwarded.',
  events:
    'Which provider types become events, and under what name. Types not in the list are dropped, unless the mapping passes every type through.',
} as const;

function SummaryRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className='flex min-h-10 items-center gap-6 border-bg-3 border-b px-4 last:border-b-0'>
      <dt className='w-36 shrink-0 text-fg-2 text-sm'>
        <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className='cursor-default underline decoration-bg-4 decoration-dotted underline-offset-2' />
              }
            >
              {label}
            </TooltipTrigger>
            <TooltipContent className='max-w-xs whitespace-normal font-normal'>{help}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </dt>
      <dd className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2 text-fg-4 text-sm'>
        {children}
      </dd>
    </div>
  );
}

function MappingSummary({ mapping }: { mapping: SourceMapping }) {
  const tree = mapping.where ? whereTree(mapping.where) : null;
  const events = Object.entries(mapping.events)
    .filter((entry) => entry[0] !== '*')
    .map(([type, name]) => [type, name === true ? type : String(name)] as [string, string]);
  const data = Object.keys(mapping.data ?? {});
  return (
    <dl className='flex flex-col'>
      <SummaryRow label='Event id' help={ROW_HELP.id}>
        {mapping.id ? <Chip>{mapping.id}</Chip> : <Muted>None, so a replay is not a duplicate</Muted>}
      </SummaryRow>
      <SummaryRow label='Event type' help={ROW_HELP.type}>
        <Chip>{mapping.type}</Chip>
      </SummaryRow>
      <SummaryRow label='Event time' help={ROW_HELP.timestamp}>
        {mapping.timestamp ? <Chip>{mapping.timestamp}</Chip> : <Muted>When received</Muted>}
      </SummaryRow>
      <SummaryRow label='Subscriber' help={ROW_HELP.subscriber}>
        <Chip>{subscriberPath(mapping)}</Chip>
        {typeof mapping.subscriber === 'string' ? (
          <Muted>as the external id</Muted>
        ) : (
          <>
            <Muted>matched to the attribute</Muted>
            <Chip>{mapping.subscriber.attribute}</Chip>
          </>
        )}
      </SummaryRow>
      <SummaryRow label='Only when' help={ROW_HELP.where}>
        {tree ? <ConditionChips tree={tree} wrap /> : <Muted>Every delivery</Muted>}
      </SummaryRow>
      <SummaryRow label='Data kept' help={ROW_HELP.data}>
        {data.length > 0 ? (
          data.map((key) => <Chip key={key}>{key}</Chip>)
        ) : (
          <Muted>Nothing from the payload</Muted>
        )}
      </SummaryRow>
      <SummaryRow label='Events' help={ROW_HELP.events}>
        {passthrough(mapping) ? (
          <Muted>Every type, under its own name</Muted>
        ) : events.length === 0 ? (
          <Muted>None yet, so every delivery is dropped</Muted>
        ) : (
          <span className='flex w-full flex-col gap-1'>
            {events.map(([type, name]) => (
              <span key={type} className='flex min-w-0 items-center gap-1.5'>
                <Truncate className='min-w-0 text-fg-2'>{type}</Truncate>
                <Icon name='IconArrowRight' className='size-3 shrink-0 text-fg-2' />
                <Chip>{name}</Chip>
              </span>
            ))}
          </span>
        )}
      </SummaryRow>
    </dl>
  );
}

function MappingEditor({
  text,
  result,
  onChange,
  onSave,
  onCancel,
  dirty,
  saving,
}: {
  text: string;
  result: MappingResult;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  dirty: boolean;
  saving: boolean;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const jumpToLine = (line: number | null) => {
    const area = areaRef.current;
    if (!area || line === null) return;
    const lines = text.split('\n');
    const start = lines.slice(0, line - 1).reduce((total, entry) => total + entry.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  };
  return (
    <div className='flex flex-col gap-3 px-4 pt-3 pb-4'>
      <Textarea
        ref={areaRef}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        rows={18}
        spellCheck={false}
        aria-label='Mapping'
        aria-invalid={result.syntax || result.problems.length > 0 ? true : undefined}
        className='text-xs'
      />
      {result.syntax ? (
        <button
          type='button'
          onClick={() => jumpToLine(result.syntax?.line ?? null)}
          className='flex items-start gap-2 text-left text-red-text text-sm'
        >
          <span className='shrink-0 tabular-nums'>
            Line {result.syntax.line}:{result.syntax.column}
          </span>
          <span>{result.syntax.message}</span>
        </button>
      ) : (
        result.problems.length > 0 && (
          <div className='flex flex-col gap-1'>
            {result.problems.map((problem) => (
              <button
                key={`${problem.path}:${problem.message}`}
                type='button'
                onClick={() => jumpToLine(problem.line)}
                className='flex items-start gap-2 rounded-lg text-left text-sm outline-none hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2'
              >
                <span className='w-16 shrink-0 text-fg-2 tabular-nums'>
                  {problem.line === null ? '' : `Line ${problem.line}`}
                </span>
                <span className='text-red-text'>
                  {problem.path && <span className='font-medium'>{problem.path} · </span>}
                  {problem.message}
                </span>
              </button>
            ))}
          </div>
        )
      )}
      <div className='flex justify-end gap-2'>
        <Button variant='soft' size='sm' onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size='sm'
          disabled={!dirty || result.mapping === null || saving}
          loading={saving}
          onClick={onSave}
        >
          Save mapping
        </Button>
      </div>
    </div>
  );
}

function BecomesStatus({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex h-full min-h-24 items-center justify-center p-2 text-center'>
      <span className='max-w-64 text-balance text-fg-2 text-sm leading-snug'>{children}</span>
    </div>
  );
}

function Becomes({ sample, server }: { sample: SampleResult; server: ServerPreview | null }) {
  if (sample.kind === 'empty') {
    return (
      <BecomesStatus>Paste a payload, or pick a delivery below, to see the event it becomes.</BecomesStatus>
    );
  }
  if (sample.kind === 'syntax') {
    return <BecomesStatus>The sample is not valid JSON yet.</BecomesStatus>;
  }
  if (!server) return <BecomesStatus>Previewing the payload.</BecomesStatus>;
  const outcome = server;
  if (outcome.outcome === 'dropped') {
    return (
      <div className='flex h-full min-h-24 flex-col items-center justify-center gap-1 p-2 text-center'>
        <IngestOutcomeBadge outcome='dropped' />
        <div className='flex flex-col gap-px'>
          <span className='font-medium text-fg-4 text-sm leading-snug'>
            {describeReason(outcome.reason ?? null)}
          </span>
          <span className='max-w-64 text-balance text-fg-2 text-xs'>{outcome.detail}</span>
        </div>
      </div>
    );
  }
  const event = outcome.event;
  if (!event) return null;
  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <IngestOutcomeBadge outcome='event' />
        <Chip icon='IconZapFilled'>{event.name}</Chip>
        <span className='text-fg-2 text-xs'>for</span>
        <Chip icon='IconUserFilled'>{event.externalId ?? subscriberLabel(event.subscriber)}</Chip>
        {event.timestamp && (
          <span className='text-fg-2 text-xs'>
            at <Time at={event.timestamp} />
          </span>
        )}
      </div>
      <CodeBlock code={JSON.stringify(event.data, null, 2)} className='w-full' />
    </div>
  );
}

function DeliveryRow({
  delivery,
  expanded,
  canMap,
  mapping,
  provider,
  onToggle,
  onUseAsSample,
  onMap,
  onSetUp,
}: {
  delivery: SourceDelivery;
  expanded: boolean;
  canMap: boolean;
  mapping: SourceMapping;
  provider: string;
  onToggle: () => void;
  onUseAsSample: () => void;
  onMap: () => void;
  onSetUp: (provider: string) => void;
}) {
  const detected = delivery.outcome === 'unverified' ? detectProvider({}, delivery.payload) : null;
  const switchable = detected !== null && detected !== provider;
  const unmapped =
    delivery.outcome === 'dropped' &&
    delivery.reason === 'unlisted_type' &&
    delivery.providerType !== null &&
    !passthrough(mapping) &&
    mapping.events[delivery.providerType] === undefined;
  const result =
    delivery.outcome === 'event' ? (
      <Chip>{delivery.event}</Chip>
    ) : delivery.outcome === 'dropped' ? (
      <Truncate className='text-fg-4'>{describeReason(delivery.reason)}</Truncate>
    ) : (
      <Truncate className='text-fg-2'>
        {detected ? `Looks like ${providerLabel(detected)}` : (delivery.detail ?? '')}
      </Truncate>
    );
  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={expanded}
        className='cursor-pointer hover:bg-bg-a1 [&_*]:cursor-pointer'
      >
        <TableCell className='font-medium text-fg-4'>
          <Truncate className='block'>
            {delivery.providerType ?? <span className='text-fg-2'>No type</span>}
          </Truncate>
        </TableCell>
        <TableCell className='py-2'>
          <IngestOutcomeBadge outcome={delivery.outcome} />
        </TableCell>
        <TableCell className='py-2'>{result}</TableCell>
        <TableCell>
          <TimeAgo at={delivery.receivedAt} />
        </TableCell>
        <TableCell className='w-0 pr-4 text-right'>
          <Icon
            name='IconChevronDownMedium'
            className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </TableCell>
      </TableRow>
      <TableDetail open={expanded} colSpan={5}>
        <div className='flex flex-col gap-3 px-4 pt-3 pb-4'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-fg-2 text-sm'>{delivery.detail ?? 'Turned into an event.'}</span>
            <span className='flex shrink-0 gap-2'>
              {canMap && switchable && detected && (
                <Button variant='soft' size='xs' onClick={() => onSetUp(detected)}>
                  Set up as {providerLabel(detected)}
                </Button>
              )}
              {canMap && unmapped && (
                <Button variant='soft' size='xs' onClick={onMap}>
                  Map {delivery.providerType} as an event
                </Button>
              )}
              {delivery.payload !== null && (
                <Button variant='soft' size='xs' onClick={onUseAsSample}>
                  Use as sample
                </Button>
              )}
            </span>
          </div>
          {delivery.payload !== null && (
            <CodeBlock code={JSON.stringify(delivery.payload, null, 2)} className='w-full' />
          )}
        </div>
      </TableDetail>
    </>
  );
}

function SetupForm({
  source,
  ingestUrl,
  onDone,
  onLater,
}: {
  source: Source;
  ingestUrl: string;
  onDone: () => void;
  onLater: () => void;
}) {
  const { submit, pending } = useActionFetcher(() => {
    toast.success('Source activated');
    onDone();
  });
  const [secret, setSecret] = useState('');
  const label = providerLabel(source.provider);
  const canActivate = secret.length > 0 && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Point {source.provider === 'custom' ? `“${source.name}”` : label} at this URL
        </DialogTitle>
      </DialogHeader>
      <FieldGroup className='w-full'>
        <div className='flex w-full flex-col gap-2'>
          <CodeBlock code={ingestUrl} className='w-full' />
          <FieldDescription>
            {source.provider === 'custom'
              ? 'Post JSON to it from your server with a type, an id and the subscriber.'
              : `Add it as a webhook endpoint in ${label} and pick the events you mapped.`}
          </FieldDescription>
        </div>
        <Field>
          <FieldLabel htmlFor='setup-secret'>Secret</FieldLabel>
          <Input
            id='setup-secret'
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={source.verification.scheme === 'header' ? 'A value of your choice' : 'whsec_…'}
            autoComplete='off'
            spellCheck={false}
            data-1p-ignore
            data-lpignore='true'
            data-bwignore
          />
          <FieldDescription>{secretHint(source.verification, source.provider)}</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant='soft' onClick={onLater}>
            Add the secret later
          </Button>
          <Button
            disabled={!canActivate}
            loading={pending}
            onClick={() => submit('update', { id: source.id, secret })}
          >
            Activate source
          </Button>
        </DialogFooter>
      </FieldGroup>
    </>
  );
}

function EditForm({ source, onClose }: { source: Source; onClose: () => void }) {
  const { submit, pending } = useActionFetcher(() => onClose());
  const [name, setName] = useState(source.name);
  const [scheme, setScheme] = useState<SchemeChoice>(schemeOf(source.verification));
  const [header, setHeader] = useState(
    source.verification.scheme === 'header' ? source.verification.header : 'x-buzzkit-secret'
  );
  const [secret, setSecret] = useState('');
  const verification =
    scheme === schemeOf(source.verification) && scheme !== 'header'
      ? source.verification
      : verificationOf(scheme, header.trim().toLowerCase());
  const canSave = name.trim().length > 0 && (scheme !== 'header' || header.trim().length > 0) && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit source</DialogTitle>
      </DialogHeader>
      <FieldGroup className='w-full'>
        <Field>
          <FieldLabel htmlFor='edit-name'>Name</FieldLabel>
          <Input
            id='edit-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='edit-scheme'>Verification</FieldLabel>
          <Select value={scheme} items={SCHEMES} onValueChange={(value) => setScheme(value as SchemeChoice)}>
            <SelectTrigger id='edit-scheme' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>How every delivery proves it comes from the sender.</FieldDescription>
        </Field>
        {scheme === 'header' && (
          <Field>
            <FieldLabel htmlFor='edit-header'>Header</FieldLabel>
            <Input
              id='edit-header'
              value={header}
              onChange={(event) => setHeader(event.target.value)}
              placeholder='x-buzzkit-secret'
              autoComplete='off'
              spellCheck={false}
            />
            <FieldDescription>The request header that carries the secret.</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor='edit-secret'>{source.hasSecret ? 'New secret' : 'Secret'}</FieldLabel>
          <Input
            id='edit-secret'
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={source.hasSecret ? 'Leave empty to keep the current secret' : 'whsec_…'}
            autoComplete='off'
            spellCheck={false}
            data-1p-ignore
            data-lpignore='true'
            data-bwignore
          />
          <FieldDescription>{secretHint(verification, source.provider)}</FieldDescription>
        </Field>
        <Button
          className='w-full'
          disabled={!canSave}
          loading={pending}
          onClick={() =>
            submit('update', {
              id: source.id,
              name: name.trim(),
              secret,
              verification: JSON.stringify(verification),
            })
          }
        >
          Save changes
        </Button>
      </FieldGroup>
    </>
  );
}

export default function SourceRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { submit, pending } = useActionFetcher((data) => {
    if (data.status === 'paused') toast.success('Source paused');
    if (data.status === 'active') toast.success('Source resumed');
  });
  const { submit: submitMapping, pending: savingMapping } = useActionFetcher(() => {
    setEditing(false);
    toast.success('Mapping saved');
  });
  const { submit: submitPreset, pending: settingUp } = useActionFetcher(() => {
    setSetupAs(null);
    toast.success('Preset applied');
  });
  const previewFetcher = useFetcher<{ key?: string; preview?: ServerPreview | null }>();
  const { source, deliveries, ingestUrl, setup, outcomeFilter } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const base = `/${params.slug}/sources`;
  const mapping = source.mapping;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [sample, setSample] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [edits, setEdits] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setups, setSetups] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [setupAs, setSetupAs] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const testerRef = useRef<HTMLDivElement>(null);
  const result = parseMapping(text);
  const parsedSample = parseSample(sample);
  const dirty = text !== prettyMapping(mapping);
  const previewMapping = editing && result.mapping ? result.mapping : mapping;
  const previewKey = `${sample}\u0000${JSON.stringify(previewMapping)}`;
  const serverPreview = previewFetcher.data?.preview ?? null;
  const suggestions =
    parsedSample.kind === 'parsed' ? suggestionsFor(mapping, parsedSample.value, source.provider) : [];

  useLinkedScroll(mainRef, asideRef);

  const saveMapping = (next: SourceMapping) =>
    submitMapping('update', { id: source.id, mapping: JSON.stringify(next) });
  const startEditing = () => {
    setText(prettyMapping(mapping));
    setEditing(true);
  };
  const changeOutcome = (value: string) => {
    const next = new URLSearchParams(searchParams);
    for (const key of ['cursor', 'trail']) next.delete(key);
    if (value === 'all') next.delete('outcome');
    else next.set('outcome', value);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };
  const applyPreset = () => {
    const preset = SOURCE_PRESETS[setupAs as keyof typeof SOURCE_PRESETS];
    if (!preset) return;
    void submitPreset('update', {
      id: source.id,
      provider: preset.provider,
      verification: JSON.stringify(preset.verification),
      mapping: JSON.stringify(preset.mapping),
    });
  };
  const closeSetup = () => {
    setSetupOpen(false);
    if (searchParams.has('setup')) {
      const next = new URLSearchParams(searchParams);
      next.delete('setup');
      setSearchParams(next, { replace: true, preventScrollReset: true });
    }
  };
  const loadSample = (payload: unknown) => {
    setSample(JSON.stringify(payload, null, 2));
    requestAnimationFrame(() => {
      const container = mainRef.current;
      const target = testerRef.current;
      if (!container || !target) return;
      const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTo({ top: container.scrollTop + offset - 16, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    if (!setup) return;
    const timer = setTimeout(() => setSetupOpen(true), 150);
    return () => clearTimeout(timer);
  }, [setup]);

  useEffect(() => {
    if (parsedSample.kind !== 'parsed') return;
    const timer = setTimeout(() => {
      void previewFetcher.submit(
        {
          intent: 'preview',
          id: source.id,
          key: previewKey,
          payload: sample,
          mapping: JSON.stringify(previewMapping),
        },
        { method: 'post' }
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [previewKey]);

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
        Sources
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h1 className='flex min-w-0 items-center gap-2.5 font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            <Truncate>{source.name}</Truncate>
            <SourceStatusBadge status={source.status} />
          </h1>
          <p className='min-w-0 text-base text-fg-2 leading-tighter'>
            <Truncate>{ingestUrl}</Truncate>
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
                  aria-label='Source actions'
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
              {source.status !== 'unverified' && (
                <DropdownMenuItem
                  onClick={() =>
                    source.status === 'paused' ? submit('resume', { id: source.id }) : setPauseOpen(true)
                  }
                >
                  {source.status === 'paused' ? 'Resume' : 'Pause'}
                </DropdownMenuItem>
              )}
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
          {source.status === 'unverified' && (
            <Card className='px-4 py-3'>
              <div className='flex items-center justify-between gap-4'>
                <span className='text-fg-2 text-sm'>
                  <span className='font-medium text-fg-4'>Unverified.</span> Deliveries are recorded here but
                  create no events until the secret is set.
                </span>
                {canManage && (
                  <Button
                    size='xs'
                    className='shrink-0'
                    onClick={() => {
                      setSetups((count) => count + 1);
                      setSetupOpen(true);
                    }}
                  >
                    Add secret
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Card className='flex min-h-0 flex-col'>
            <CardHeader divider className='py-3'>
              <CardTitle>Mapping</CardTitle>
              {canManage && !editing && (
                <CardAction>
                  <Button variant='ghost' size='xs' onClick={startEditing}>
                    Edit
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            {editing ? (
              <MappingEditor
                text={text}
                result={result}
                onChange={setText}
                onSave={() => result.mapping && saveMapping(result.mapping)}
                onCancel={() => setEditing(false)}
                dirty={dirty}
                saving={savingMapping}
              />
            ) : (
              <MappingSummary mapping={mapping} />
            )}
          </Card>

          <div ref={testerRef} className='scroll-mt-1'>
            <Card>
              <CardHeader divider className='py-3'>
                <CardTitle>Try a payload</CardTitle>
              </CardHeader>
              <div className={cn('flex flex-col gap-4 px-4 pt-3', suggestions.length > 0 ? 'pb-0' : 'pb-4')}>
                <div className='grid gap-4 lg:grid-cols-2'>
                  <div className='flex min-w-0 flex-col gap-2'>
                    <Textarea
                      value={sample}
                      onChange={(event) => setSample(event.target.value)}
                      rows={12}
                      spellCheck={false}
                      aria-label='Sample payload'
                      aria-invalid={parsedSample.kind === 'syntax' ? true : undefined}
                      placeholder='{ "type": "…" }'
                      className='min-h-0 flex-1 text-xs'
                    />
                  </div>
                  <div className='min-w-0 self-start rounded-xl border border-bg-3 bg-bg-2/60 p-3'>
                    <Becomes sample={parsedSample} server={serverPreview} />
                  </div>
                </div>
                {parsedSample.kind === 'syntax' && (
                  <span className='text-red-text text-sm'>
                    <span className='tabular-nums'>
                      Line {parsedSample.line}:{parsedSample.column}
                    </span>{' '}
                    {parsedSample.message}
                  </span>
                )}
                {suggestions.length > 0 && (
                  <div className='-mx-4 flex flex-col divide-y divide-bg-3 border-bg-3 border-t'>
                    {suggestions.map((suggestion) => (
                      <div
                        key={suggestion.key}
                        className='flex min-h-10 items-center justify-between gap-4 px-4 py-2 text-sm'
                      >
                        <span className='text-fg-2'>{suggestion.text}</span>
                        {canManage && suggestion.setupAs && (
                          <Button
                            variant='soft'
                            size='xs'
                            className='shrink-0'
                            onClick={() => suggestion.setupAs && setSetupAs(suggestion.setupAs)}
                          >
                            Set up as {providerLabel(suggestion.setupAs)}
                          </Button>
                        )}
                        {canManage && suggestion.action && (
                          <Button
                            variant='soft'
                            size='xs'
                            className='shrink-0'
                            disabled={savingMapping}
                            onClick={() => suggestion.action && saveMapping(suggestion.action.apply(mapping))}
                          >
                            {suggestion.action.label}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <Card className='flex min-h-0 flex-col'>
            <CardHeader divider className='py-3'>
              <CardTitle>Deliveries</CardTitle>
              <CardAction>
                <PillTabs
                  items={OUTCOME_FILTERS}
                  value={outcomeFilter}
                  itemClassName='h-6.5 px-2.5 text-xs'
                  onValueChange={changeOutcome}
                />
              </CardAction>
            </CardHeader>
            {deliveries.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconMailboxFilled'
                title={outcomeFilter === 'all' ? 'No deliveries yet' : 'No deliveries match'}
                description={
                  outcomeFilter !== 'all'
                    ? 'No delivery to this source has that outcome.'
                    : source.provider === 'custom'
                      ? 'Deliveries appear here as your server posts to the endpoint URL.'
                      : `Deliveries appear here as ${providerLabel(source.provider)} posts to the endpoint URL.`
                }
              />
            ) : (
              <Table className='table-fixed'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead className='w-28'>Outcome</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className='w-28'>Time</TableHead>
                    <TableHead className='w-12' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.items.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      provider={source.provider}
                      mapping={mapping}
                      canMap={canManage}
                      expanded={expandedId === delivery.id}
                      onToggle={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
                      onUseAsSample={() => loadSample(delivery.payload)}
                      onSetUp={setSetupAs}
                      onMap={() =>
                        delivery.providerType && saveMapping(withEvent(mapping, delivery.providerType))
                      }
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
              <DetailRow label='Endpoint URL' copy={ingestUrl}>
                <Truncate>{ingestUrl}</Truncate>
              </DetailRow>
              <DetailRow label='Provider'>
                <span className='flex items-center gap-1.5'>
                  <ProviderLogo provider={source.provider} />
                  {providerLabel(source.provider)}
                </span>
              </DetailRow>
              <DetailRow label='Verification'>
                <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
                  <Tooltip>
                    <TooltipTrigger render={<span className='inline-flex cursor-default' />}>
                      <Badge size='sm' variant={source.hasSecret ? 'green' : 'amber'}>
                        {source.hasSecret ? 'Verified' : 'Unverified'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {source.hasSecret
                        ? `Every delivery is checked against ${verificationClause(source.verification)}.`
                        : `Deliveries would be checked against ${verificationClause(source.verification)} once a secret is set.`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DetailRow>
              <DetailRow label='Secret'>
                <Badge size='sm' variant={source.hasSecret ? 'green' : 'amber'}>
                  {source.hasSecret ? 'Set' : 'Missing'}
                </Badge>
              </DetailRow>
              <DetailRow label='Last delivery'>
                {source.lastDeliveryAt ? (
                  <TimeAgo at={source.lastDeliveryAt} />
                ) : (
                  <span className='text-fg-2'>Never</span>
                )}
              </DetailRow>
              <DetailRow label='Created'>
                <Time at={source.createdAt} />
              </DetailRow>
            </dl>
          </Card>
        </div>
      </div>

      <Dialog
        open={setupOpen}
        onOpenChange={(next) => {
          if (!next && setup) return;
          if (!next) closeSetup();
        }}
      >
        <DialogContent showCloseButton={!setup}>
          <SetupForm
            key={setups}
            source={source}
            ingestUrl={ingestUrl}
            onDone={closeSetup}
            onLater={closeSetup}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent showCloseButton>
          <EditForm key={edits} source={source} onClose={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={setupAs !== null} onOpenChange={(next) => !next && setSetupAs(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set up as {setupAs ? providerLabel(setupAs) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              The provider, verification and mapping are replaced with the{' '}
              {setupAs ? providerLabel(setupAs) : ''} preset. A secret you already set is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={settingUp} onClick={applyPreset}>
              Apply preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause “{source.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deliveries are still verified and recorded, but every one is dropped and no events are created
              until the source is resumed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                setPauseOpen(false);
                void submit('pause', { id: source.id });
              }}
            >
              Pause source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{source.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Webhooks sent to its URL are answered with 404 from now on and its deliveries are no longer
              shown. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => submit('delete', { id: source.id })}
            >
              Delete source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
