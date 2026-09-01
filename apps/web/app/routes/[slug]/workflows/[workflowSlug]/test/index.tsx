import type { Step } from '@buzzkit/schema/workflows';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem } from '@buzzkit/ui/components/combobox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Input } from '@buzzkit/ui/components/input';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useNavigate } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RunStatusBadge, WorkflowStatusBadge } from '@/app/components/badges';
import { describeRunEvent } from '@/app/components/workflows/describe';
import { type RunPath, WorkflowFlow } from '@/app/components/workflows/flow';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { workflowsAction } from '@/app/lib/actions/workflows.server';
import { getWorkflow, listSubscribers, type WorkflowTest } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

type Assumable =
  | { name: string; kind: 'waitFor'; event: string }
  | { name: string; kind: 'fetch'; host: string };

type Assumption = { matched: boolean; data: string; status: string };

function assumableSteps(steps: Step[], into: Assumable[] = []): Assumable[] {
  for (const step of steps) {
    if ('waitFor' in step) {
      into.push({
        name: step.name,
        kind: 'waitFor',
        event: step.waitFor.event ?? step.waitFor.events?.map((entry) => entry.event).join(' or ') ?? '',
      });
    }
    if ('fetch' in step) into.push({ name: step.name, kind: 'fetch', host: hostOf(step.fetch.url) });
    if ('repeat' in step) assumableSteps(step.repeat.steps, into);
    if ('forEach' in step) assumableSteps(step.forEach.steps, into);
    if ('branch' in step) {
      for (const entry of Array.isArray(step.branch) ? step.branch : []) assumableSteps(entry.steps, into);
    }
  }
  return into;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function jsonProblem(text: string, noun: string): string | null {
  if (!text.trim()) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return `${noun} must be a JSON object.`;
    return null;
  } catch {
    return `${noun} is not valid JSON.`;
  }
}

function testPath(result: WorkflowTest): RunPath {
  const done = result.steps.filter((entry) => entry.status === 'completed' || entry.status === 'skipped');
  return {
    reached: new Set(done.map((entry) => entry.step)),
    skipped: new Set(result.steps.filter((entry) => entry.status === 'skipped').map((entry) => entry.step)),
    current: result.outcome === 'failed' ? (result.step ?? result.path.at(-1) ?? null) : null,
    taken: Object.fromEntries(
      result.steps
        .filter((entry) => typeof entry.detail?.taken === 'string')
        .map((entry) => [entry.step, entry.detail?.taken as string])
    ),
    status: result.outcome,
  };
}

function nameOf(attributes: unknown): string | null {
  const name = (attributes as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

const PLAYBACK_STEP_MS = 250;

const SUGGESTION_LIMIT = 8;

function elapsedLabel(ms: number): string {
  if (ms < 1000) return '+0s';
  const units: Array<[string, number]> = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
  ];
  const parts: string[] = [];
  let rest = ms;
  for (const [unit, size] of units) {
    const amount = Math.floor(rest / size);
    if (amount > 0 && parts.length < 2) {
      parts.push(`${amount}${unit}`);
      rest -= amount * size;
    }
  }
  return `+${parts.join(' ')}`;
}

function sentBody(detail: Record<string, unknown> | null): string | null {
  const payload = detail?.payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const body = (payload as { body?: unknown }).body;
  return typeof body === 'string' ? body : null;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Test ${loaderData.workflow.name} · BuzzKit` : 'Test workflow · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const query = search.get('q')?.trim() ?? '';
  const [workflow, suggested] = await Promise.all([
    getWorkflow(ctx, token, params.slug, tenant, params.workflowSlug),
    query
      ? listSubscribers(ctx, token, params.slug, tenant, { search: query, limit: SUGGESTION_LIMIT })
      : Promise.resolve(null),
  ]);
  const requested = Number(search.get('version'));
  const versions = workflow.versions ?? [];
  const version = versions.find((entry) => entry.number === requested) ?? versions[0] ?? null;
  return {
    workflow,
    version,
    suggestions:
      suggested?.items.map((item) => ({
        externalId: item.externalId,
        name: nameOf(item.attributes),
      })) ?? [],
  };
}

export const action = workflowsAction;

function TestTrace({ result, complete }: { result: WorkflowTest; complete: boolean }) {
  const startedAt = Date.parse(result.steps[0]?.at ?? '') || Date.now();
  const entries = [
    ...result.steps.map((entry) => ({
      key: `${entry.step}:${entry.status}:${entry.at}`,
      ...describeRunEvent({
        name: '$run.step',
        step: entry.step,
        data: { status: entry.status, summary: entry.summary },
      }),
      body: sentBody(entry.detail),
      at: entry.at,
    })),
    ...(complete
      ? [
          {
            key: 'outcome',
            ...describeRunEvent({
              name: result.outcome === 'failed' ? '$run.failed' : '$run.completed',
              step: null,
              data: result.error ? { error: result.error } : {},
            }),
            body: null,
            at: result.steps.at(-1)?.at ?? null,
          },
        ]
      : []),
  ];
  return (
    <ul className='flex flex-col divide-y divide-bg-3'>
      {entries.map((entry) => (
        <li key={entry.key} className='flex items-center gap-3 px-4 py-2.5'>
          <IconTile icon={entry.icon} size='sm' />
          <div className='flex min-w-0 flex-1 flex-col'>
            <Truncate className='max-w-full font-medium text-fg-4 text-sm'>{entry.label}</Truncate>
            {entry.detail && <Truncate className='max-w-full text-fg-2 text-xs'>{entry.detail}</Truncate>}
            {entry.body && <Truncate className='max-w-full text-fg-2 text-xs'>{entry.body}</Truncate>}
          </div>
          {entry.at && (
            <span className='shrink-0 text-fg-2 text-xs tabular-nums'>
              <TimeAgo at={entry.at} label={elapsedLabel(Date.parse(entry.at) - startedAt)} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function WorkflowTestRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const suggest = useFetcher<typeof loader>();
  const { workflow, version } = loaderData;
  const base = `/${params.slug}/workflows/${workflow.slug}`;
  const versions = workflow.versions ?? [];
  const spec = version?.spec ?? workflow.spec;
  const scheduled = 'schedule' in spec.trigger;
  const eventName = 'event' in spec.trigger ? spec.trigger.event : null;
  const assumable = assumableSteps(spec.steps);
  const [externalId, setExternalId] = useState('');
  const [attributes, setAttributes] = useState('');
  const [eventData, setEventData] = useState('');
  const [at, setAt] = useState('');
  const [assumptions, setAssumptions] = useState<Record<string, Assumption>>({});
  const [result, setResult] = useState<WorkflowTest | null>(null);
  const [queued, setQueued] = useState<WorkflowTest | null>(null);
  const [revealed, setRevealed] = useState(0);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { submit, pending } = useActionFetcher((data) => {
    if (data.test) {
      setResult(null);
      setRevealed(0);
      setQueued(data.test as WorkflowTest);
    }
  });

  const madeUp = !externalId.trim();
  const attributesProblem = madeUp ? jsonProblem(attributes, 'Attributes') : null;
  const eventProblem = eventName ? jsonProblem(eventData, 'Event data') : null;
  const assumptionOf = (name: string): Assumption =>
    assumptions[name] ?? { matched: false, data: '', status: '' };
  const assumptionProblems = Object.fromEntries(
    assumable.map((step) => [step.name, jsonProblem(assumptionOf(step.name).data, 'Data')])
  );
  const hasSubject = !madeUp || attributes.trim().length > 0;
  const canRun =
    !pending &&
    hasSubject &&
    !attributesProblem &&
    !eventProblem &&
    Object.values(assumptionProblems).every((problem) => problem === null);
  const total = result ? result.steps.length + 1 : 0;
  const complete = result !== null && revealed >= total;
  const shown = result
    ? {
        ...result,
        steps: result.steps.slice(0, revealed),
        ...(complete ? {} : { outcome: 'completed' as const }),
      }
    : null;
  const path =
    shown && result
      ? { ...testPath(shown), status: complete ? result.outcome : ('running' as const) }
      : undefined;
  const payloads = Object.fromEntries(
    (shown?.steps ?? []).flatMap((entry) => {
      const detail = entry.detail;
      if (!detail) return [];
      if (typeof detail.payload === 'object' && detail.payload !== null) {
        return [[entry.step, detail.payload as Record<string, unknown>]];
      }
      if ('value' in detail) {
        return [
          [
            entry.step,
            { value: typeof detail.value === 'string' ? detail.value : JSON.stringify(detail.value) },
          ],
        ];
      }
      return [];
    })
  );
  const suggestions = externalId.trim() ? (suggest.data?.suggestions ?? []) : [];
  const suggestionIds = suggestions.map((entry) => entry.externalId);

  const typeExternalId = (value: string) => {
    setExternalId(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim()) return;
    suggestTimer.current = setTimeout(
      () => suggest.load(`${base}/test?q=${encodeURIComponent(value.trim())}`),
      200
    );
  };
  const setAssumption = (name: string, patch: Partial<Assumption>) =>
    setAssumptions((current) => ({ ...current, [name]: { ...assumptionOf(name), ...patch } }));
  const run = () => {
    const assume: Record<string, { matched?: boolean; data?: unknown; status?: number }> = {};
    for (const step of assumable) {
      const entry = assumptionOf(step.name);
      const data = entry.data.trim() ? (JSON.parse(entry.data) as unknown) : undefined;
      if (step.kind === 'waitFor') {
        assume[step.name] = { matched: entry.matched, ...(data !== undefined ? { data } : {}) };
      } else if (entry.status.trim() || data !== undefined) {
        const status = Number(entry.status);
        assume[step.name] = {
          ...(Number.isInteger(status) && status >= 100 ? { status } : {}),
          ...(data !== undefined ? { data } : {}),
        };
      }
    }
    void submit('test', {
      workflow: workflow.slug,
      ...(version ? { version: String(version.number) } : {}),
      externalId: externalId.trim(),
      attributes: attributes.trim(),
      ...(eventName ? { event: eventName, eventData: eventData.trim() } : {}),
      at: at ? new Date(at).toISOString() : '',
      assume: JSON.stringify(assume),
    });
  };

  useEffect(() => {
    if (!queued) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        setResult(queued);
        setQueued(null);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [queued]);

  useEffect(() => {
    if (!result || revealed >= result.steps.length + 1) return;
    const timer = setTimeout(() => setRevealed((count) => count + 1), PLAYBACK_STEP_MS);
    return () => clearTimeout(timer);
  }, [result, revealed]);

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
        {workflow.name}
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h1 className='flex items-center gap-2.5 text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            <Truncate>Test {workflow.name}</Truncate>
            {version && (
              <WorkflowStatusBadge
                status={
                  workflow.current?.id === version.id ? 'active' : version.publishedAt ? 'paused' : 'draft'
                }
              />
            )}
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Run a version for a subscriber and see the path it takes and what every step would do. Nothing is
            sent.
          </p>
        </div>
        {versions.length > 1 && (
          <Select
            value={String(version?.number ?? '')}
            items={versions.map((entry) => ({
              value: String(entry.number),
              label: `Version ${entry.number}`,
            }))}
            onValueChange={(value) => navigate(`${base}/test?version=${value}`, { replace: true })}
          >
            <SelectTrigger aria-label='Version' className='shrink-0'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
              {versions.map((entry) => (
                <SelectItem key={entry.id} value={String(entry.number)}>
                  Version {entry.number}
                  {workflow.current?.id === entry.id ? ', live' : entry.publishedAt ? '' : ', draft'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      <div className='grid min-h-0 flex-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]'>
        <Card className='flex min-h-0 flex-col'>
          <CardHeader divider className='py-3'>
            <CardTitle>Input</CardTitle>
          </CardHeader>
          <div className='min-h-0 flex-1 overflow-y-auto p-4'>
            <FieldGroup className='w-full'>
              <Field>
                <FieldLabel htmlFor='test-subscriber'>Subscriber</FieldLabel>
                <Combobox
                  items={suggestionIds}
                  filter={null}
                  value={suggestionIds.includes(externalId) ? externalId : null}
                  inputValue={externalId}
                  onInputValueChange={(next, details) => {
                    if (
                      details.reason === 'input-change' ||
                      details.reason === 'clear-press' ||
                      details.reason === 'item-press'
                    ) {
                      typeExternalId(next);
                    }
                  }}
                  onValueChange={(value) => {
                    if (typeof value === 'string') setExternalId(value);
                  }}
                >
                  <ComboboxInput
                    id='test-subscriber'
                    placeholder='user_42'
                    autoComplete='off'
                    spellCheck={false}
                    showTrigger={false}
                  />
                  <ComboboxContent>
                    {(item: string) => {
                      const name = suggestions.find((entry) => entry.externalId === item)?.name ?? null;
                      return (
                        <ComboboxItem key={item} value={item}>
                          <span className='flex min-w-0 items-center gap-2'>
                            <PastelAvatar seed={item} variant='orb' size={20} className='shrink-0' />
                            <span className='flex min-w-0 flex-col leading-tight'>
                              {name && <Truncate className='max-w-full text-fg-4'>{name}</Truncate>}
                              <Truncate
                                className={cn('max-w-full', name ? 'text-fg-2 text-xs' : 'text-fg-4')}
                              >
                                {item}
                              </Truncate>
                            </span>
                          </span>
                        </ComboboxItem>
                      );
                    }}
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>
                  The external id of the subscriber to run it for, or leave it empty and describe one below.
                </FieldDescription>
              </Field>
              {madeUp && (
                <Field>
                  <FieldLabel htmlFor='test-attributes'>Attributes</FieldLabel>
                  <Textarea
                    id='test-attributes'
                    value={attributes}
                    onChange={(event) => setAttributes(event.target.value)}
                    placeholder='{ "name": "Ada", "$timezone": "Europe/Paris" }'
                    rows={3}
                    spellCheck={false}
                    aria-invalid={attributesProblem ? true : undefined}
                  />
                  {attributesProblem ? (
                    <FieldError>{attributesProblem}</FieldError>
                  ) : (
                    <FieldDescription>The attributes of a made-up subscriber, as JSON.</FieldDescription>
                  )}
                </Field>
              )}
              {eventName && (
                <Field>
                  <FieldLabel htmlFor='test-event'>Event data</FieldLabel>
                  <Textarea
                    id='test-event'
                    value={eventData}
                    onChange={(event) => setEventData(event.target.value)}
                    placeholder='{ "plan": "monthly" }'
                    rows={3}
                    spellCheck={false}
                    aria-invalid={eventProblem ? true : undefined}
                  />
                  {eventProblem ? (
                    <FieldError>{eventProblem}</FieldError>
                  ) : (
                    <FieldDescription>
                      The data of the {eventName} event that starts the run.
                    </FieldDescription>
                  )}
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor='test-at'>Clock</FieldLabel>
                <Input
                  id='test-at'
                  type='datetime-local'
                  value={at}
                  onChange={(event) => setAt(event.target.value)}
                />
                <FieldDescription>
                  {scheduled
                    ? 'The moment the schedule comes due. Waits move the clock forward, so every step shows when it would happen. Now when empty.'
                    : 'The moment the run starts. Waits move the clock forward, so every step shows when it would happen. Now when empty.'}
                </FieldDescription>
              </Field>
              {assumable.map((step) => (
                <Field key={step.name}>
                  <FieldLabel htmlFor={`test-${step.name}`}>
                    {step.kind === 'waitFor' ? `Wait for ${step.event}` : `Fetch ${step.host}`}
                  </FieldLabel>
                  {step.kind === 'waitFor' ? (
                    <>
                      <Select
                        value={assumptionOf(step.name).matched ? 'arrives' : 'missing'}
                        items={[
                          { value: 'arrives', label: `${step.event} arrives` },
                          { value: 'missing', label: `${step.event} never arrives` },
                        ]}
                        onValueChange={(value) => setAssumption(step.name, { matched: value === 'arrives' })}
                      >
                        <SelectTrigger id={`test-${step.name}`} className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='arrives'>{step.event} arrives</SelectItem>
                          <SelectItem value='missing'>{step.event} never arrives</SelectItem>
                        </SelectContent>
                      </Select>
                      {assumptionOf(step.name).matched && (
                        <Textarea
                          value={assumptionOf(step.name).data}
                          onChange={(event) => setAssumption(step.name, { data: event.target.value })}
                          placeholder='{ "reason": "price" }'
                          rows={2}
                          spellCheck={false}
                          aria-label={`Data of ${step.event}`}
                          aria-invalid={assumptionProblems[step.name] ? true : undefined}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Input
                        id={`test-${step.name}`}
                        value={assumptionOf(step.name).status}
                        onChange={(event) => setAssumption(step.name, { status: event.target.value })}
                        placeholder='200'
                        inputMode='numeric'
                        aria-label={`Status ${step.host} answers`}
                      />
                      <Textarea
                        value={assumptionOf(step.name).data}
                        onChange={(event) => setAssumption(step.name, { data: event.target.value })}
                        placeholder='{ "checks": 3 }'
                        rows={2}
                        spellCheck={false}
                        aria-label={`Reply from ${step.host}`}
                        aria-invalid={assumptionProblems[step.name] ? true : undefined}
                      />
                    </>
                  )}
                  {assumptionProblems[step.name] ? (
                    <FieldError>{assumptionProblems[step.name]}</FieldError>
                  ) : (
                    <FieldDescription>
                      {step.kind === 'waitFor'
                        ? `Whether ${step.event} arrives while the ${step.name} step waits, and its data.`
                        : `The status and JSON reply the ${step.name} step gets. Empty records the call without answering.`}
                    </FieldDescription>
                  )}
                </Field>
              ))}
            </FieldGroup>
          </div>
          <CardFooter>
            <Button className='w-full' disabled={!canRun} loading={pending} onClick={run}>
              Run test
            </Button>
          </CardFooter>
        </Card>

        <div className='flex min-h-0 flex-col gap-5'>
          <Card className='flex min-h-0 flex-1 flex-col'>
            <CardHeader divider className='py-3'>
              <CardTitle>Path</CardTitle>
              {path && (
                <CardAction>
                  <RunStatusBadge status={path.status} />
                </CardAction>
              )}
            </CardHeader>
            <WorkflowFlow spec={spec} path={path} still={queued !== null} payloads={payloads} />
          </Card>
          {shown && (
            <Card className='flex max-h-80 min-h-0 shrink-0 flex-col'>
              <CardHeader divider className='py-3'>
                <CardTitle>Steps</CardTitle>
              </CardHeader>
              <div className='min-h-0 overflow-y-auto'>
                <TestTrace result={shown} complete={complete} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
