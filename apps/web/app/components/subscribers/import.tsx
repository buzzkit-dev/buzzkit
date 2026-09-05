import {
  type AnonymousPolicy,
  detectPreset,
  IMPORT_PRESETS,
  IMPORT_TARGETS,
  type ImportEnvironment,
  type ImportMapping,
  type ImportPlan,
  type ImportRow,
  type ImportTarget,
  MAX_IMPORT_ROWS,
  parseCsv,
  planImport,
  type SkipReason,
  type UnsubscribedPolicy,
} from '@buzzkit/schema/imports';
import { Button } from '@buzzkit/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { toast } from '@buzzkit/ui/components/sonner';
import { Switch } from '@buzzkit/ui/components/switch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { FileDrop, type LoadedFile } from '@/app/components/onboarding/file-drop';
import type { SettingsActionData } from '@/app/hooks/use-action-fetcher';
import type { ImportOutcome } from '@/app/lib/api.server';

const AVAILABLE_TARGETS = IMPORT_TARGETS.filter((target) => target.available);

const TARGETS: Array<{ value: ImportTarget; label: string }> = AVAILABLE_TARGETS.map((target) => ({
  value: target.id,
  label: target.label,
}));

const ENVIRONMENTS: Array<{ value: ImportEnvironment; label: string }> = [
  { value: 'production', label: 'Production' },
  { value: 'sandbox', label: 'Sandbox' },
];

const ANONYMOUS: Array<{ value: AnonymousPolicy; label: string }> = [
  { value: 'provider_id', label: 'Import with the provider id' },
  { value: 'skip', label: 'Skip them' },
];

const UNSUBSCRIBED: Array<{ value: UnsubscribedPolicy; label: string }> = [
  { value: 'skip', label: 'Skip them' },
  { value: 'muted', label: 'Import as muted' },
];

const SKIP_LABELS: Record<SkipReason, string> = {
  no_external_id: 'Without an external id',
  no_endpoint: 'Without a token or address',
  invalid_endpoint: 'With an invalid token or address',
  unsupported_target: 'On a channel that cannot be imported yet',
  unsubscribed: 'Unsubscribed',
};

const EMPTY_COUNTS: ImportOutcome['counts'] = {
  rows: 0,
  subscribersCreated: 0,
  subscriptionsCreated: 0,
  subscriptionsUpdated: 0,
  unchanged: 0,
  failed: 0,
};

const EMPTY_CUSTOM: CustomMapping = { externalId: '', endpoint: '', target: 'ios', keepColumns: true };

type CustomMapping = { externalId: string; endpoint: string; target: ImportTarget; keepColumns: boolean };

type ImportActionData = SettingsActionData & { counts?: ImportOutcome['counts'] };

export type ImportDestination = { action: string; tenant: string };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

function addCounts(a: ImportOutcome['counts'], b: ImportOutcome['counts']): ImportOutcome['counts'] {
  return {
    rows: a.rows + b.rows,
    subscribersCreated: a.subscribersCreated + b.subscribersCreated,
    subscriptionsCreated: a.subscriptionsCreated + b.subscriptionsCreated,
    subscriptionsUpdated: a.subscriptionsUpdated + b.subscriptionsUpdated,
    unchanged: a.unchanged + b.unchanged,
    failed: a.failed + b.failed,
  };
}

function resolveCustomMapping(headers: string[], custom: CustomMapping): ImportMapping | null {
  if (!custom.externalId) return null;
  const picked = new Set([custom.externalId, custom.endpoint]);
  return {
    externalId: custom.externalId,
    ...(custom.endpoint ? { endpoint: custom.endpoint } : {}),
    target: { value: custom.target },
    ...(custom.keepColumns
      ? { attributes: { columns: headers.filter((header) => !picked.has(header)) } }
      : {}),
  };
}

function summarize(counts: ImportOutcome['counts']): string {
  const parts = [
    `${counts.subscribersCreated} new`,
    `${counts.subscriptionsCreated + counts.subscriptionsUpdated} subscriptions written`,
  ];
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  return `${parts.join(', ')}.`;
}

function ColumnSelect({
  id,
  value,
  headers,
  none,
  onChange,
}: {
  id: string;
  value: string;
  headers: string[];
  none?: string;
  onChange: (column: string) => void;
}) {
  const items = [
    ...(none ? [{ value: '', label: none }] : []),
    ...headers.map((header) => ({ value: header, label: header })),
  ];
  return (
    <Select value={value} items={items} onValueChange={(next) => onChange(String(next ?? ''))}>
      <SelectTrigger id={id} className='w-full'>
        <SelectValue placeholder='Pick a column' />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChoiceSelect<Value extends string>({
  id,
  value,
  items,
  onChange,
}: {
  id: string;
  value: Value;
  items: Array<{ value: Value; label: string }>;
  onChange: (next: Value) => void;
}) {
  return (
    <Select value={value} items={items} onValueChange={(next) => onChange(next as Value)}>
      <SelectTrigger id={id} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SummaryLine({ label, count, strong }: { label: string; count: number; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? 'flex items-center justify-between font-medium text-fg-4'
          : 'flex items-center justify-between text-fg-2'
      }
    >
      <span>{label}</span>
      <NumberFlow value={count} className='tabular-nums leading-none' />
    </div>
  );
}

function PlanSummary({ plan }: { plan: ImportPlan }) {
  const subscriptions = AVAILABLE_TARGETS.reduce((sum, target) => sum + plan.counts.byTarget[target.id], 0);
  const lines = [
    ...AVAILABLE_TARGETS.map((target) => ({ label: target.summary, count: plan.counts.byTarget[target.id] })),
    { label: 'Profiles without a subscription', count: plan.counts.rows - subscriptions },
    { label: 'Imported with the provider id', count: plan.counts.anonymous },
    { label: 'Imported as muted', count: plan.counts.muted },
  ].filter((line) => line.count > 0);
  const skipped = (Object.keys(SKIP_LABELS) as SkipReason[])
    .map((reason) => ({ label: SKIP_LABELS[reason], count: plan.counts.byReason[reason] }))
    .filter((line) => line.count > 0);

  return (
    <div className='corner-superellipse/1.125 flex w-full flex-col gap-2 rounded-xl bg-bg-2 px-3.5 py-3 text-sm'>
      <SummaryLine label='Rows to import' count={plan.counts.rows} strong />
      {lines.map((line) => (
        <SummaryLine key={line.label} {...line} />
      ))}
      {skipped.length > 0 && (
        <div className='mt-1 border-bg-4 border-t pt-2'>
          <SummaryLine label='Rows skipped' count={plan.skipped.length} strong />
        </div>
      )}
      {skipped.map((line) => (
        <SummaryLine key={line.label} {...line} />
      ))}
    </div>
  );
}

export function ImportForm({
  target,
  sandbox = true,
  onDone,
}: {
  target: ImportDestination;
  sandbox?: boolean;
  onDone: () => void;
}) {
  const fetcher = useFetcher<ImportActionData>();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [custom, setCustom] = useState<CustomMapping>(EMPTY_CUSTOM);
  const [environment, setEnvironment] = useState<ImportEnvironment>('production');
  const [anonymous, setAnonymous] = useState<AnonymousPolicy>('provider_id');
  const [unsubscribed, setUnsubscribed] = useState<UnsubscribedPolicy>('skip');
  const [progress, setProgress] = useState<{ batch: number; counts: ImportOutcome['counts'] } | null>(null);
  const handled = useRef<ImportActionData | null>(null);
  const parsed = useMemo(() => (file ? parseCsv(file.text) : null), [file]);
  const provider = parsed ? detectPreset(parsed.headers) : null;
  const preset = provider ? IMPORT_PRESETS[provider] : null;
  const plan = useMemo(() => {
    if (!parsed) return null;
    const mapping = preset ? preset.mapping : resolveCustomMapping(parsed.headers, custom);
    if (!mapping) return null;
    return planImport(parsed.records, mapping, {
      environment,
      anonymous,
      unsubscribed,
      idPrefix: preset?.idPrefix ?? 'import',
    });
  }, [parsed, preset, custom, environment, anonymous, unsubscribed]);
  const batches = useMemo(() => chunk<ImportRow>(plan?.rows ?? [], MAX_IMPORT_ROWS), [plan]);
  const hasApple = (plan?.counts.byTarget.ios ?? 0) > 0;
  const importing = progress !== null;
  const imported = progress ? progress.counts.rows : 0;

  const submitBatch = (index: number) => {
    void fetcher.submit(
      { intent: 'import', tenant: target.tenant, rows: JSON.stringify(batches[index]) },
      { method: 'post', action: target.action }
    );
  };
  const start = () => {
    if (batches.length === 0) return;
    handled.current = null;
    setProgress({ batch: 0, counts: EMPTY_COUNTS });
    submitBatch(0);
  };

  useEffect(() => {
    if (!progress || fetcher.state !== 'idle' || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.error || !fetcher.data.counts) {
      toast.error(fetcher.data.error ?? 'Failed to import subscribers', {
        description: fetcher.data.description,
      });
      setProgress(null);
      return;
    }
    const counts = addCounts(progress.counts, fetcher.data.counts);
    const next = progress.batch + 1;
    if (next < batches.length) {
      setProgress({ batch: next, counts });
      void fetcher.submit(
        { intent: 'import', tenant: target.tenant, rows: JSON.stringify(batches[next]) },
        { method: 'post', action: target.action }
      );
      return;
    }
    setProgress(null);
    onDone();
    toast.success(`Imported ${counts.rows} rows`, { description: summarize(counts) });
  }, [fetcher, progress, batches, target, onDone]);

  return (
    <FieldGroup className='w-full'>
      <div className='flex flex-col gap-2'>
        <FileDrop
          label='Export file'
          accept='.csv,text/csv'
          prompt='Choose a CSV export'
          hint='One row per subscription.'
          value={file}
          summary={parsed ? `${parsed.records.length} rows${preset ? `, ${preset.label} export` : ''}` : null}
          error={parsed && parsed.records.length === 0 ? 'The file has no rows below its header.' : null}
          onChange={(next) => {
            setFile(next);
            setCustom(EMPTY_CUSTOM);
          }}
        />
        {!file && (
          <a
            href='https://docs.buzzkit.dev/audience/importing'
            target='_blank'
            rel='noreferrer'
            className='w-fit text-fg-2 text-xs underline underline-offset-2 outline-none hover:text-fg-4 focus-visible:ring-2 focus-visible:ring-primary-2'
          >
            How to export from your provider
          </a>
        )}
      </div>

      {parsed && parsed.records.length > 0 && !preset && (
        <>
          <Field>
            <FieldLabel htmlFor='import-external-id'>External id</FieldLabel>
            <ColumnSelect
              id='import-external-id'
              value={custom.externalId}
              headers={parsed.headers}
              onChange={(externalId) => setCustom({ ...custom, externalId })}
            />
            <FieldDescription>The column that holds your own id for the user.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='import-endpoint'>Token or address</FieldLabel>
            <ColumnSelect
              id='import-endpoint'
              value={custom.endpoint}
              headers={parsed.headers}
              none='None, import profiles only'
              onChange={(endpoint) => setCustom({ ...custom, endpoint })}
            />
            <FieldDescription>The column that holds the device token or the email address.</FieldDescription>
          </Field>
          {custom.endpoint && (
            <Field>
              <FieldLabel htmlFor='import-target'>Column contents</FieldLabel>
              <ChoiceSelect
                id='import-target'
                value={custom.target}
                items={TARGETS}
                onChange={(next) => setCustom({ ...custom, target: next })}
              />
              <FieldDescription>Split the file per platform when it mixes them.</FieldDescription>
            </Field>
          )}
          <Field orientation='horizontal'>
            <div className='flex flex-col gap-0.5'>
              <FieldLabel htmlFor='import-keep-columns'>Keep other columns as attributes</FieldLabel>
              <FieldDescription>Every column not picked above lands on the subscriber.</FieldDescription>
            </div>
            <Switch
              id='import-keep-columns'
              checked={custom.keepColumns}
              onCheckedChange={(keepColumns) => setCustom({ ...custom, keepColumns })}
            />
          </Field>
        </>
      )}

      {plan && hasApple && sandbox && (
        <Field>
          <FieldLabel htmlFor='import-environment'>Apple environment</FieldLabel>
          <ChoiceSelect
            id='import-environment'
            value={environment}
            items={ENVIRONMENTS}
            onChange={setEnvironment}
          />
          <FieldDescription>
            Sandbox tokens come from debug builds and only reach the sandbox credential.
          </FieldDescription>
        </Field>
      )}
      {plan && preset?.mapping.id && (
        <Field>
          <FieldLabel htmlFor='import-anonymous'>Rows without an external id</FieldLabel>
          <ChoiceSelect id='import-anonymous' value={anonymous} items={ANONYMOUS} onChange={setAnonymous} />
          <FieldDescription>
            A subscriber imported with the provider id moves to your id once the app identifies the user.
          </FieldDescription>
        </Field>
      )}
      {plan && preset?.mapping.unsubscribed && (
        <Field>
          <FieldLabel htmlFor='import-unsubscribed'>Unsubscribed rows</FieldLabel>
          <ChoiceSelect
            id='import-unsubscribed'
            value={unsubscribed}
            items={UNSUBSCRIBED}
            onChange={setUnsubscribed}
          />
          <FieldDescription>
            A muted subscription is kept but receives nothing until it is unmuted.
          </FieldDescription>
        </Field>
      )}

      {plan && <PlanSummary plan={plan} />}

      {importing && (
        <div className='flex w-full flex-col gap-1.5'>
          <div className='flex items-center justify-between text-fg-2 text-sm'>
            <span>Importing</span>
            <span className='tabular-nums'>
              <NumberFlow value={imported} className='leading-none' /> of {plan?.counts.rows ?? 0}
            </span>
          </div>
          <div className='h-1.5 w-full overflow-hidden rounded-full bg-bg-3'>
            <div
              className='h-full rounded-full bg-primary-4 transition-[width] duration-300 ease-out'
              style={{ width: `${plan && plan.counts.rows > 0 ? (imported / plan.counts.rows) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <Button
        className='w-full'
        disabled={!plan || plan.counts.rows === 0 || importing}
        loading={importing}
        onClick={start}
      >
        Import subscribers
      </Button>
    </FieldGroup>
  );
}

export function ImportDialog({
  open,
  onOpenChange,
  target,
  sandbox,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ImportDestination;
  sandbox?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import subscribers</DialogTitle>
        </DialogHeader>
        <ImportForm target={target} sandbox={sandbox} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
