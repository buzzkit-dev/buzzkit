import {
  type BranchStep,
  FALLBACK_CASE,
  type Step,
  type StepKind,
  type WorkflowExpression,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import { Badge } from '@buzzkit/ui/components/badge';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import { useLayoutEffect, useRef, useState } from 'react';
import { ConditionSummary } from '@/app/components/conditions/chips';
import { DetailRow } from '@/app/components/detail/row';
import { stepIcon, stepKind } from '@/app/components/workflows/describe';
import { StepDetails, type StepPayload, StepRules } from '@/app/components/workflows/details';
import { CancelConditions, TriggerConditions, whereTree } from '@/app/components/workflows/trigger';
import { TIME_TOOLTIP_DELAY } from '@/app/hooks/use-time-ago';

type Counts = Record<string, number>;

export type RunPath = {
  reached: Set<string>;
  skipped: Set<string>;
  current: string | null;
  taken: Record<string, string>;
  status: 'running' | 'sleeping' | 'waiting' | 'completed' | 'canceled' | 'failed';
};

type Tone = 'green' | 'blue' | 'purple' | 'sky' | 'red' | 'amber' | 'muted';

type NodeState = { label: string; tone: Tone } | null;

type Lane = { name: string; label: string; steps: Step[]; open: boolean; when: WorkflowExpression | null };

type Plan = { before: Step[]; fork: { step: BranchStep; lanes: Lane[]; rest: Step[] } | null };

type Trail = {
  path?: RunPath;
  active: boolean;
  after: boolean;
};

const LIVE_TONES: Record<'running' | 'sleeping' | 'waiting', Tone> = {
  running: 'blue',
  sleeping: 'sky',
  waiting: 'purple',
};

const CURRENT_LABELS: Record<RunPath['status'], string> = {
  running: 'Now',
  sleeping: 'Sleeping',
  waiting: 'Waiting',
  completed: 'Completed',
  canceled: 'Canceled',
  failed: 'Failed',
};

const STATE_DOT: Record<Tone, string> = {
  green: 'bg-green-4',
  blue: 'bg-blue-4',
  purple: 'bg-purple-4',
  sky: 'bg-sky-4',
  red: 'bg-red-4',
  amber: 'bg-amber-4',
  muted: 'bg-green-4',
};

const STATE_RING: Record<Tone, string> = {
  green: 'ring-green-4',
  blue: 'ring-blue-4',
  purple: 'ring-purple-4',
  sky: 'ring-sky-4',
  red: 'ring-red-4',
  amber: 'ring-amber-4',
  muted: 'ring-green-4',
};

const KIND_LABELS: Record<StepKind, string> = {
  wait: 'Wait',
  waitUntil: 'Wait until',
  waitFor: 'Wait for',
  branch: 'Branch',
  fetch: 'Fetch',
  set: 'Set',
  send: 'Send',
  exit: 'Exit',
};

const TRIGGER_HEADS = {
  event: { icon: 'IconZapFilled', label: 'Trigger' },
  schedule: { icon: 'IconCalendarClockFilled', label: 'Schedule' },
} satisfies Record<string, { icon: IconName; label: string }>;

const LANE = 'minmax(max-content, 1fr)';

function nameOf(step: Step): string {
  return 'exit' in step ? 'exit' : step.name;
}

function endsRun(steps: Step[]): boolean {
  const last = steps.at(-1);
  if (!last) return false;
  if ('exit' in last) return true;
  if ('branch' in last) {
    const cases = Array.isArray(last.branch) ? last.branch : [];
    return cases.every((entry) => endsRun(entry.steps)) && cases.some((entry) => entry.when === undefined);
  }
  return false;
}

function planColumn(steps: Step[]): Plan {
  const index = steps.findIndex((step) => 'branch' in step);
  if (index === -1) return { before: steps, fork: null };
  const step = steps[index] as BranchStep;
  const cases = Array.isArray(step.branch) ? step.branch : [];
  const lanes: Lane[] = cases.map((entry) => ({
    name: entry.name,
    label: entry.name,
    steps: entry.steps,
    open: !endsRun(entry.steps),
    when: entry.when ?? null,
  }));
  if (!cases.some((entry) => entry.when === undefined)) {
    lanes.push({ name: FALLBACK_CASE, label: 'Else', steps: [], open: true, when: null });
  }
  return { before: steps.slice(0, index), fork: { step, lanes, rest: steps.slice(index + 1) } };
}

function stoppedAt(path: RunPath | undefined): NodeState {
  if (!path) return null;
  if (path.status === 'failed') return { label: 'Failed', tone: 'red' };
  if (path.status === 'canceled') return { label: 'Canceled', tone: 'amber' };
  return null;
}

function stateOf(trail: Trail, name: string, previousOn: boolean): NodeState {
  const { path, active } = trail;
  if (!path || !active) return null;
  if (path.skipped.has(name)) return { label: 'Skipped', tone: 'amber' };
  if (path.current === name && path.status !== 'completed') {
    const tone: Tone =
      path.status === 'failed' ? 'red' : path.status === 'canceled' ? 'amber' : LIVE_TONES[path.status];
    return { label: CURRENT_LABELS[path.status], tone };
  }
  if (path.reached.has(name) || path.current === name) return { label: 'Completed', tone: 'muted' };
  if (path.current === null && previousOn) return stoppedAt(path);
  return null;
}

function reached(trail: Trail, name: string | null): boolean {
  const { path, active } = trail;
  return name !== null && active && path !== undefined && (path.reached.has(name) || path.current === name);
}

function Version({ spec, version }: { spec: WorkflowSpec; version?: FlowVersion }) {
  return (
    <dl className='flex flex-col border-bg-3 border-b'>
      {version && (
        <DetailRow label='Version'>
          <span>Version {version.number}</span>
          {version.note && <span className='text-fg-2'>{version.note}</span>}
        </DetailRow>
      )}
      {spec.cancelOn && spec.cancelOn.length > 0 && (
        <DetailRow label='Stops'>
          <span className='flex flex-col gap-1 py-2'>
            {spec.cancelOn.map((rule) => (
              <CancelConditions
                key={`${rule.event}:${JSON.stringify(rule.where ?? null)}`}
                rule={rule}
                wrap
              />
            ))}
          </span>
        </DetailRow>
      )}
      <DetailRow label='Runs'>
        {spec.concurrency === 'one-per-subscriber'
          ? 'Once at a time per subscriber'
          : 'schedule' in spec.trigger
            ? 'Once per subscriber every time it fires'
            : 'Once for every matching event'}
      </DetailRow>
      {spec.defaultTimezone && (
        <DetailRow label='Timezone'>
          {`${spec.defaultTimezone.replace(/_/g, ' ')} for subscribers without one of their own`}
        </DetailRow>
      )}
    </dl>
  );
}

const PHASE_MS = 150;

const GROW =
  'absolute inset-0 bg-green-4 transition-transform duration-150 ease-out motion-reduce:transition-none group-data-[still]/flow:transition-none';

const SETTLE =
  'transition-[box-shadow,background-color,color] duration-300 ease-out [transition-delay:var(--phase-delay,0ms)] motion-reduce:transition-none group-data-[still]/flow:transition-none';

function delay(phase: number): React.CSSProperties {
  return { transitionDelay: `${phase * PHASE_MS}ms` };
}

const APPEAR =
  'fade-in fill-mode-both animate-in duration-300 [--tw-animation-delay:var(--phase-delay,0ms)] motion-reduce:animate-none group-data-[still]/flow:animate-none';

function phaseDelay(phase: number): React.CSSProperties {
  return { '--phase-delay': `${phase * PHASE_MS}ms` } as React.CSSProperties;
}

function Line({
  className,
  active = false,
  phase = 0,
}: {
  className?: string;
  active?: boolean;
  phase?: number;
}) {
  return (
    <span className={cn('relative w-0.5 shrink-0 bg-bg-4', className)}>
      <span className={cn(GROW, 'origin-top', active ? 'scale-y-100' : 'scale-y-0')} style={delay(phase)} />
    </span>
  );
}

function Port({ active = false, tone }: { active?: boolean; tone?: NodeState }) {
  return (
    <span
      className={cn(
        'relative z-10 size-2 shrink-0 rounded-[3px] bg-bg-1 ring-1',
        SETTLE,
        tone ? STATE_RING[tone.tone] : active ? 'ring-green-4' : 'ring-bg-4'
      )}
    />
  );
}

function EndDot({ active = false, phase = 0 }: { active?: boolean; phase?: number }) {
  return (
    <span
      className={cn('size-2.5 shrink-0 rounded-[3px]', SETTLE, active ? 'bg-green-4' : 'bg-fg-1')}
      style={delay(phase)}
    />
  );
}

function Header({
  icon,
  label,
  count,
  state,
}: {
  icon: IconName;
  label: string;
  count?: number | null;
  state?: NodeState;
}) {
  return (
    <header className='flex items-center justify-between gap-4 border-bg-3 border-b bg-bg-2 px-2.5 py-1 text-fg-2 text-xs'>
      <span className='flex items-center gap-1.5'>
        <Icon name={icon} className='size-3.5 shrink-0' />
        {label}
      </span>
      {state ? (
        <span
          className={cn(
            'flex items-center gap-1.5 font-medium',
            APPEAR,
            state.tone === 'muted' ? 'text-green-4' : 'text-fg-4'
          )}
        >
          {state.tone !== 'muted' && (
            <span className='relative flex size-1.5'>
              {(state.tone === 'blue' || state.tone === 'purple' || state.tone === 'sky') && (
                <span
                  className={cn(
                    'absolute inline-flex size-full animate-ping rounded-full opacity-60',
                    STATE_DOT[state.tone]
                  )}
                />
              )}
              <span className={cn('relative inline-flex size-1.5 rounded-full', STATE_DOT[state.tone])} />
            </span>
          )}
          {state.label}
        </span>
      ) : (
        count !== null &&
        count !== undefined &&
        count > 0 && <span className='font-medium text-fg-3'>{count} here now</span>
      )}
    </header>
  );
}

function TriggerNode({ spec, active = false }: { spec: WorkflowSpec; active?: boolean }) {
  const head = 'schedule' in spec.trigger ? TRIGGER_HEADS.schedule : TRIGGER_HEADS.event;
  return (
    <div className='flex flex-col items-center'>
      <div
        className={cn(
          '-mb-1 w-fit max-w-96 overflow-hidden rounded-xl bg-bg-1 shadow-black/5 shadow-sm ring-1',
          SETTLE,
          active ? 'ring-green-4' : 'ring-bg-3'
        )}
      >
        <Header
          icon={head.icon}
          label={head.label}
          state={active ? { label: 'Completed', tone: 'muted' } : null}
        />
        <div className='px-2.5 py-2'>
          <TriggerConditions spec={spec} limit={8} wrap />
        </div>
      </div>
      <Port active={active} />
    </div>
  );
}

function Node({
  step,
  count,
  state,
  payload,
  phase = 0,
}: {
  step: Exclude<Step, { exit: true }>;
  count: number | null;
  state: NodeState;
  payload?: StepPayload;
  phase?: number;
}) {
  const kind = stepKind(step);
  return (
    <div className='flex flex-col items-center' style={phaseDelay(phase)}>
      <Port tone={state} />
      <div
        className={cn(
          '-my-1 w-fit max-w-72 overflow-hidden rounded-xl bg-bg-1 shadow-black/5 shadow-sm ring-1',
          SETTLE,
          state ? STATE_RING[state.tone] : 'ring-bg-3'
        )}
      >
        <Header icon={stepIcon(kind, step)} label={KIND_LABELS[kind]} count={count} state={state} />
        <div className='flex min-w-0 flex-col gap-1 px-2.5 py-2'>
          <span className='truncate font-medium text-fg-4 text-sm'>{step.name}</span>
          <StepDetails step={step} payload={payload} />
        </div>
        <StepRules step={step} />
      </div>
      <Port tone={state} />
    </div>
  );
}

function ExitNode({ active = false, phase = 0 }: { active?: boolean; phase?: number }) {
  return (
    <div className='flex flex-col items-center' style={phaseDelay(phase)}>
      <Port active={active} />
      <div
        className={cn(
          '-my-1 flex items-center gap-1.5 rounded-xl bg-bg-1 px-2.5 py-1.5 shadow-black/5 shadow-sm ring-1',
          SETTLE,
          active ? 'ring-green-4' : 'ring-bg-3'
        )}
      >
        <Icon name='IconArrowBoxRight' className={cn('size-4', active ? 'text-green-4' : 'text-fg-3')} />
        <span className='font-medium text-fg-4 text-sm'>Run ends</span>
      </div>
      <Port active={active} />
    </div>
  );
}

function Cell({ row, end, children }: { row: number; end?: number; children: React.ReactNode }) {
  return (
    <div className='flex flex-col items-center' style={{ gridRow: end ? `${row} / ${end}` : row }}>
      {children}
    </div>
  );
}

type Junction = { up: boolean; down: boolean; left: boolean; right: boolean };

function spineOf(total: number): { lane: number | null; before: number } {
  return total % 2 === 1
    ? { lane: (total - 1) / 2, before: (total - 1) / 2 }
    : { lane: null, before: total / 2 - 1 };
}

function forkJunction(index: number, total: number): Junction {
  const spine = spineOf(total);
  return { up: spine.lane === index, down: true, left: index > 0, right: index < total - 1 };
}

function mergeJunction(lanes: Lane[], index: number): Junction | null {
  const open = lanes.flatMap((entry, at) => (entry.open ? [at] : []));
  if (open.length === 0) return null;
  const spine = spineOf(lanes.length);
  const onSpine = spine.lane === index;
  const leftReach =
    open.some((at) => at < index) || (spine.lane === null ? index > spine.before : index > spine.lane);
  const rightReach =
    open.some((at) => at > index) || (spine.lane === null ? index <= spine.before : index < spine.lane);
  const up = lanes[index]?.open ?? false;
  const joins = up || onSpine;
  const left = leftReach && (joins || rightReach);
  const right = rightReach && (joins || leftReach);
  if (!up && !onSpine && !(left && right)) return null;
  return { up, down: onSpine, left, right };
}

type JunctionPath = { left: boolean; right: boolean; stub: boolean };

const JUNCTION_OFF: JunctionPath = { left: false, right: false, stub: false };

function junctionPath(index: number, total: number, taken: number, stubOn: boolean): JunctionPath {
  if (taken < 0) return JUNCTION_OFF;
  const spine = spineOf(total);
  const origin = spine.lane ?? spine.before + 0.5;
  const low = Math.min(origin, taken);
  const high = Math.max(origin, taken);
  return {
    left: index - 0.5 >= low && index <= high,
    right: index >= low && index + 0.5 <= high,
    stub: stubOn && index === taken,
  };
}

function JunctionMark({
  edge,
  junction,
  path = JUNCTION_OFF,
}: {
  edge: 'top' | 'bottom';
  junction: Junction | null;
  path?: JunctionPath;
}) {
  if (!junction) return <span className='block h-4' />;
  const { up, down, left, right } = junction;
  const active = path.stub || path.left || path.right;
  const color = active ? 'border-green-4' : 'border-bg-4';
  const vertical = edge === 'top' ? down : up;
  const through = edge === 'top' ? up : down;
  const corner = vertical && !through && left !== right;
  if (corner) {
    return (
      <span className='relative block h-4'>
        <span
          className={cn(
            'absolute top-0 bottom-0',
            SETTLE.replace('box-shadow,background-color,color', 'border-color'),
            color,
            edge === 'top' ? 'border-t-2' : 'border-b-2',
            right ? 'right-0 border-l-2' : 'left-0 border-r-2',
            right && edge === 'top' && 'rounded-tl-xl',
            right && edge === 'bottom' && 'rounded-bl-xl',
            !right && edge === 'top' && 'rounded-tr-xl',
            !right && edge === 'bottom' && 'rounded-br-xl'
          )}
          style={{ ...(right ? { left: 'calc(50% - 1px)' } : { right: 'calc(50% - 1px)' }), ...delay(1) }}
        />
      </span>
    );
  }
  const rail = edge === 'top' ? 'top-0' : 'bottom-0';
  const barPhase = edge === 'top' ? 1 : 2;
  const stubPhase = edge === 'top' ? 2 : 1;
  const joint = path.left || path.right;
  return (
    <span className='relative block h-4'>
      {left && (
        <span className={cn('absolute left-0 h-0.5 bg-bg-4', rail)} style={{ right: 'calc(50% - 1px)' }}>
          <span
            className={cn(GROW, 'origin-right', path.left ? 'scale-x-100' : 'scale-x-0')}
            style={delay(barPhase)}
          />
        </span>
      )}
      {right && (
        <span className={cn('absolute right-0 h-0.5 bg-bg-4', rail)} style={{ left: 'calc(50% - 1px)' }}>
          <span
            className={cn(GROW, 'origin-left', path.right ? 'scale-x-100' : 'scale-x-0')}
            style={delay(barPhase)}
          />
        </span>
      )}
      {(vertical || through) && (
        <span className='-translate-x-1/2 absolute top-0 bottom-0 left-1/2 w-0.5 bg-bg-4'>
          <span
            className={cn(GROW, 'origin-top', path.stub ? 'scale-y-100' : 'scale-y-0')}
            style={delay(stubPhase)}
          />
        </span>
      )}
      <span
        className={cn(
          '-translate-x-1/2 absolute left-1/2 h-0.5 w-0.5 bg-green-4 transition-opacity duration-150 ease-out motion-reduce:transition-none',
          rail,
          joint ? 'opacity-100' : 'opacity-0'
        )}
        style={delay(barPhase)}
      />
    </span>
  );
}

function CaseHint({ when, children }: { when: WorkflowExpression | null; children: React.ReactNode }) {
  const tree = when ? whereTree(when) : null;
  return (
    <TooltipProvider delay={TIME_TOOLTIP_DELAY}>
      <Tooltip>
        <TooltipTrigger render={<span className='flex cursor-default' />}>{children}</TooltipTrigger>
        <TooltipContent className='max-w-md p-2'>
          {tree ? <ConditionSummary tree={tree} /> : 'When no case above matches'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function rowsOf(steps: Step[]): number {
  const plan = planColumn(steps);
  return Math.max(1, plan.before.length + (plan.fork ? 3 : 0));
}

function LaneColumn({
  lane,
  lanes,
  counts,
  payloads,
  rows,
  trail,
  index,
  taken,
  after,
  terminal,
}: {
  lane: Lane;
  lanes: Lane[];
  counts?: Counts;
  payloads?: Payloads;
  rows: number;
  trail: Trail;
  index: number;
  taken: number;
  after: boolean;
  terminal: boolean;
}) {
  const on = trail.active && trail.path !== undefined;
  const completed = trail.path?.status === 'completed';
  return (
    <div
      className='grid min-w-36 px-3'
      style={{ gridRow: `1 / ${rows + 4}`, gridTemplateRows: 'subgrid', gridColumn: index + 1 }}
    >
      <div className='-mx-3' style={{ gridRow: 1 }}>
        <JunctionMark
          edge='top'
          junction={forkJunction(index, lanes.length)}
          path={junctionPath(index, lanes.length, taken, true)}
        />
      </div>
      <Cell row={2}>
        <CaseHint when={lane.when}>
          <Badge size='sm' variant={on ? 'green' : 'default'} style={phaseDelay(3)}>
            {lane.label}
          </Badge>
        </CaseHint>
        <Line className='min-h-4 grow' active={on} phase={4} />
      </Cell>
      {lane.steps.length === 0 ? (
        <Cell row={3}>
          <span className='relative z-10 rounded-xl border border-bg-3 border-dashed bg-bg-1 px-2.5 py-1.5 text-fg-2 text-sm'>
            Nothing
          </span>
          {terminal ? (
            <>
              <Line className='h-4' active={on && completed} />
              <EndDot active={on && completed} phase={1} />
            </>
          ) : (
            <Line className='min-h-4 grow' active={on && after} />
          )}
        </Cell>
      ) : (
        <Column
          steps={lane.steps}
          counts={counts}
          payloads={payloads}
          trail={trail}
          after={after}
          rows={rows}
          lane
          terminal={terminal}
        />
      )}
      <div className='-mx-3' style={{ gridRow: rows + 3 }}>
        <JunctionMark
          edge='bottom'
          junction={terminal ? null : mergeJunction(lanes, index)}
          path={junctionPath(index, lanes.length, after ? taken : -1, true)}
        />
      </div>
    </div>
  );
}

function Column({
  steps,
  counts,
  trail,
  after,
  rows,
  lane = false,
  terminal = false,
  leadPhase = 1,
  payloads,
}: {
  steps: Step[];
  counts?: Counts;
  payloads?: Payloads;
  trail: Trail;
  after: boolean;
  rows?: number;
  lane?: boolean;
  terminal?: boolean;
  leadPhase?: number;
}) {
  const plan = planColumn(steps);
  const { path, active } = trail;
  const completed = path?.status === 'completed';
  const items: React.ReactNode[] = [];
  const endOf = (last: boolean) => (lane && rows && last ? rows + 1 : undefined);

  plan.before.forEach((step, index) => {
    const name = nameOf(step);
    const here = reached(trail, name) && ('exit' in step ? completed : true);
    const previous = plan.before[index - 1];
    const previousOn =
      index === 0 ? active && path !== undefined : reached(trail, previous ? nameOf(previous) : null);
    const next = plan.before[index + 1] ?? plan.fork?.step ?? null;
    const onward = next ? reached(trail, nameOf(next)) : active && after;
    const last = !plan.fork && index === plan.before.length - 1;
    const topPhase = index === 0 ? leadPhase : 1;
    if ('exit' in step) {
      items.push(
        <Cell key='exit' row={index + 1} end={endOf(last)}>
          {!(lane && index === 0) && <Line className='h-4' active={here} phase={topPhase} />}
          <ExitNode active={here} phase={lane && index === 0 ? 0 : topPhase + 1} />
          <Line className='h-3' active={here} phase={lane && index === 0 ? 1 : topPhase + 2} />
          <EndDot active={here} phase={lane && index === 0 ? 2 : topPhase + 3} />
        </Cell>
      );
      return;
    }
    items.push(
      <Cell key={step.name} row={index + 1} end={endOf(last)}>
        {!(lane && index === 0) && <Line className='h-4' active={here} phase={topPhase} />}
        <Node
          step={step}
          count={counts ? (counts[step.name] ?? 0) : null}
          state={stateOf(trail, step.name, previousOn)}
          payload={payloads?.[step.name]}
          phase={lane && index === 0 ? 0 : topPhase + 1}
        />
        {last && (!lane || terminal) ? (
          <>
            <Line className='h-4' active={here && completed} phase={lane && index === 0 ? 1 : topPhase + 2} />
            <EndDot active={here && completed} phase={lane && index === 0 ? 2 : topPhase + 3} />
          </>
        ) : (
          <Line className='min-h-4 grow' active={onward} />
        )}
      </Cell>
    );
  });

  if (plan.fork) {
    const { step, lanes, rest } = plan.fork;
    const row = plan.before.length + 1;
    const here = reached(trail, step.name);
    const taken = path?.taken[step.name];
    const decided = here && taken !== undefined;
    const previous = plan.before.at(-1);
    const previousOn =
      plan.before.length === 0
        ? active && path !== undefined
        : reached(trail, previous ? nameOf(previous) : null);
    const restOn = rest.length > 0 ? reached(trail, nameOf(rest[0] as Step)) : active && after;
    const merges = rest.length > 0 && lanes.some((entry) => entry.open);
    const laneRows = Math.max(...lanes.map((entry) => rowsOf(entry.steps)));
    items.push(
      <Cell key={step.name} row={row}>
        {!(lane && plan.before.length === 0) && (
          <Line className='h-4' active={here} phase={plan.before.length === 0 ? leadPhase : 1} />
        )}
        <Node
          step={step}
          count={counts ? (counts[step.name] ?? 0) : null}
          state={stateOf(trail, step.name, previousOn)}
          payload={payloads?.[step.name]}
          phase={lane && plan.before.length === 0 ? 0 : (plan.before.length === 0 ? leadPhase : 1) + 1}
        />
        <Line className='min-h-3 grow' active={decided} />
      </Cell>,
      <div
        key={`${step.name}-lanes`}
        className='grid'
        style={{
          gridRow: row + 1,
          gridTemplateColumns: `repeat(${lanes.length}, ${LANE})`,
          gridTemplateRows: `auto auto repeat(${laneRows}, auto) auto`,
        }}
      >
        {lanes.map((entry, index) => (
          <LaneColumn
            key={entry.name}
            lane={entry}
            lanes={lanes}
            counts={counts}
            payloads={payloads}
            rows={laneRows}
            index={index}
            taken={decided ? lanes.findIndex((candidate) => candidate.name === taken) : -1}
            trail={{ path, active: decided && taken === entry.name, after: restOn }}
            after={restOn}
            terminal={rest.length === 0}
          />
        ))}
      </div>
    );
    if (rest.length > 0) {
      items.push(
        <div
          key='rest'
          className='flex flex-col items-center'
          style={{ gridRow: lane && rows ? `${row + 2} / ${rows + 1}` : row + 2 }}
        >
          {merges && <Line className='h-3' active={restOn} phase={3} />}
          <Column
            steps={rest}
            counts={counts}
            payloads={payloads}
            trail={trail}
            after={after}
            leadPhase={4}
          />
        </div>
      );
    } else if (merges && lane) {
      items.push(
        <Cell key='onwards' row={row + 2} end={endOf(true)}>
          <Line className='min-h-3 grow' active={active && after} />
        </Cell>
      );
    } else if (merges) {
      const ended = completed && active && path !== undefined && !path.reached.has('exit');
      items.push(
        <Cell key='end' row={row + 2}>
          <Line className='h-4' active={ended} />
          <EndDot active={ended} />
        </Cell>
      );
    }
  }

  return (
    <div
      className='grid justify-items-center'
      style={rows ? { gridRow: `3 / ${rows + 3}`, gridTemplateRows: 'subgrid' } : undefined}
    >
      {items}
    </div>
  );
}

function useCenteredScroll(scroller: React.RefObject<HTMLDivElement | null>) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const frame = scroller.current;
    if (!frame) return;
    const center = () => {
      frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
      setReady(true);
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [scroller]);
  return ready;
}

export type FlowVersion = { number: number; note: string | null };

export type Payloads = Record<string, StepPayload>;

export function WorkflowFlow({
  spec,
  counts,
  path,
  version,
  still = false,
  payloads,
}: {
  spec: WorkflowSpec;
  counts?: Counts;
  path?: RunPath;
  version?: FlowVersion;
  still?: boolean;
  payloads?: Payloads;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const ready = useCenteredScroll(scroller);
  const trail: Trail = { path, active: true, after: false };

  return (
    <div className='group/flow flex min-h-0 flex-1 flex-col' data-still={still ? '' : undefined}>
      <Version spec={spec} version={version} />
      <ScrollFade orientation='both' targetRef={scroller} />
      <div ref={scroller} className='min-h-0 flex-1 overflow-auto'>
        <div
          className={cn(
            'mx-auto flex w-max min-w-full flex-col items-center px-4 py-6 transition-opacity duration-150 ease-out',
            ready ? 'opacity-100' : 'opacity-0'
          )}
        >
          <TriggerNode spec={spec} active={path !== undefined} />
          <Column steps={spec.steps} payloads={payloads} counts={counts} trail={trail} after={false} />
        </div>
      </div>
    </div>
  );
}
