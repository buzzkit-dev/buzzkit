import { Badge } from '@buzzkit/ui/components/badge';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { cn } from '@buzzkit/ui/lib/utils';
import type { Step, StepKind, WorkflowSpec } from 'buzzkit/workflows';
import { useLayoutEffect, useRef, useState } from 'react';
import { DetailRow } from '@/app/components/detail/row';
import { describeStep, stepIcon, stepKind } from '@/app/components/workflows/describe';
import { CancelConditions, TriggerConditions } from '@/app/components/workflows/trigger';

type Counts = Record<string, number>;

export type RunPath = {
  reached: Set<string>;
  current: string | null;
  taken: Record<string, 'then' | 'else'>;
  status: 'running' | 'sleeping' | 'waiting' | 'completed' | 'cancelled' | 'failed';
};

type Tone = 'green' | 'blue' | 'purple' | 'sky' | 'red' | 'amber' | 'muted';

type NodeState = { label: string; tone: Tone } | null;

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
  cancelled: 'Cancelled',
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

function stoppedAt(path: RunPath | undefined): NodeState {
  if (!path) return null;
  if (path.status === 'failed') return { label: 'Failed', tone: 'red' };
  if (path.status === 'cancelled') return { label: 'Cancelled', tone: 'amber' };
  return null;
}

function stateOf(path: RunPath | undefined, active: boolean, name: string): NodeState {
  if (!path || !active) return null;
  if (path.current === name && path.status !== 'completed') {
    const tone: Tone =
      path.status === 'failed' ? 'red' : path.status === 'cancelled' ? 'amber' : LIVE_TONES[path.status];
    return { label: CURRENT_LABELS[path.status], tone };
  }
  if (path.reached.has(name) || path.current === name) return { label: 'Completed', tone: 'muted' };
  return null;
}

function firstName(steps: Step[]): string | null {
  const first = steps[0];
  if (!first) return null;
  return 'exit' in first ? 'exit' : first.name;
}

const KIND_LABELS: Record<StepKind, string> = {
  wait: 'Wait',
  waitUntil: 'Wait until',
  waitFor: 'Wait for',
  branch: 'Branch',
  send: 'Send',
  exit: 'Exit',
};

function endsRun(steps: Step[]): boolean {
  const last = steps.at(-1);
  if (!last) return false;
  if ('exit' in last) return true;
  if ('branch' in last) return endsRun(last.branch.then) && endsRun(last.branch.else ?? []);
  return false;
}

export type FlowVersion = { number: number; note: string | null };

function Rules({ spec, version }: { spec: WorkflowSpec; version?: FlowVersion }) {
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
          : 'Once for every matching event'}
      </DetailRow>
    </dl>
  );
}

function Line({ className, active = false }: { className?: string; active?: boolean }) {
  return <span className={cn('w-0.5 shrink-0', active ? 'bg-green-4' : 'bg-bg-4', className)} />;
}

const PORT_RING = STATE_RING;

function Port({ active = false, tone }: { active?: boolean; tone?: NodeState }) {
  return (
    <span
      className={cn(
        'relative z-10 size-2 shrink-0 rounded-[3px] bg-bg-1 ring-1',
        tone ? PORT_RING[tone.tone] : active ? 'ring-green-4' : 'ring-bg-4'
      )}
    />
  );
}

function EndDot({ active = false }: { active?: boolean }) {
  return <span className={cn('size-2.5 shrink-0 rounded-[3px]', active ? 'bg-green-4' : 'bg-fg-1')} />;
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
  return (
    <div className='flex flex-col items-center'>
      <div
        className={cn(
          '-mb-1 w-fit max-w-96 overflow-hidden rounded-xl bg-bg-1 shadow-black/5 shadow-sm ring-1',
          active ? 'ring-green-4' : 'ring-bg-3'
        )}
      >
        <Header
          icon='IconZapFilled'
          label='Trigger'
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
  ghost = false,
}: {
  step: Exclude<Step, { exit: true }>;
  count: number | null;
  state: NodeState;
  ghost?: boolean;
}) {
  const kind = stepKind(step);
  const reached = state !== null;
  return (
    <div className={cn('flex flex-col items-center', ghost && !reached && 'opacity-50')}>
      <Port tone={state} />
      <div
        className={cn(
          '-my-1 w-fit max-w-72 overflow-hidden rounded-xl bg-bg-1 shadow-black/5 shadow-sm ring-1',
          state ? STATE_RING[state.tone] : 'ring-bg-3'
        )}
      >
        <Header icon={stepIcon(kind)} label={KIND_LABELS[kind]} count={count} state={state} />
        <div className='flex min-w-0 flex-col px-2.5 py-2'>
          <span className='truncate font-medium text-fg-4 text-sm'>{step.name}</span>
          <span className='text-fg-2 text-xs'>{describeStep(step)}</span>
        </div>
      </div>
      <Port tone={state} />
    </div>
  );
}

function ExitNode({ active = false, ghost = false }: { active?: boolean; ghost?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center', ghost && !active && 'opacity-50')}>
      <Port active={active} />
      <div
        className={cn(
          '-my-1 flex items-center gap-1.5 rounded-xl bg-bg-1 px-2.5 py-1.5 shadow-black/5 shadow-sm ring-1',
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

type BranchStep = Extract<Step, { branch: unknown }>;

type Lane = { label: string; side: 'left' | 'right'; steps: Step[]; open: boolean; fold: Step[] };

type Plan = {
  before: Step[];
  fork: { step: BranchStep; lanes: Lane[]; rest: Step[] } | null;
};

const TRACK = 'minmax(9rem, auto)';

function planColumn(steps: Step[], continues: boolean): Plan {
  const index = steps.findIndex((step) => 'branch' in step);
  if (index === -1) return { before: steps, fork: null };
  const step = steps[index] as BranchStep;
  const before = steps.slice(0, index);
  let rest = steps.slice(index + 1);
  const lanes: Lane[] = [
    { label: 'Then', side: 'left', steps: step.branch.then, open: false, fold: [] },
    { label: 'Otherwise', side: 'right', steps: step.branch.else ?? [], open: false, fold: [] },
  ];
  for (const lane of lanes) lane.open = !endsRun(lane.steps) && (rest.length > 0 || continues);
  const open = lanes.filter((lane) => lane.open);
  if (open.length === 1 && !continues && rest.length > 0) {
    open[0]!.fold = rest;
    open[0]!.open = false;
    rest = [];
  }
  return { before, fork: { step, lanes, rest } };
}

function rowsOf(plan: Plan): number {
  return plan.before.length + (plan.fork ? 2 + (plan.fork.rest.length > 0 ? 1 : 0) : 0);
}

function laneRows(lane: Lane, continues: boolean): number {
  return Math.max(1, rowsOf(planColumn(lane.steps, continues))) + (lane.fold.length > 0 ? 1 : 0);
}

function Corner({
  side,
  edge,
  inset,
  row,
  active = false,
}: {
  side: 'left' | 'right';
  edge: 'top' | 'bottom';
  inset: boolean;
  row?: number;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        'h-4',
        active ? 'border-green-4' : 'border-bg-4',
        edge === 'top' ? 'self-start border-t-2' : 'self-end border-b-2',
        side === 'left' ? 'border-l-2' : 'border-r-2',
        edge === 'top' && side === 'left' && 'rounded-tl-xl',
        edge === 'top' && side === 'right' && 'rounded-tr-xl',
        edge === 'bottom' && side === 'left' && 'rounded-bl-xl',
        edge === 'bottom' && side === 'right' && 'rounded-br-xl',
        inset
          ? side === 'left'
            ? 'absolute right-0 left-[calc(50%-1px)]'
            : 'absolute right-[calc(50%-1px)] left-0'
          : side === 'left'
            ? '-ml-px w-[calc(100%+0.75rem+1px)] justify-self-start'
            : '-mr-px w-[calc(100%+0.75rem+1px)] justify-self-end',
        !inset && edge === 'top' && '-mt-4',
        !inset && edge === 'bottom' && '-mb-4'
      )}
      style={inset ? { [edge]: 0 } : { gridRow: row, gridColumn: side === 'left' ? 2 : 1 }}
    />
  );
}

function Column({
  steps,
  counts,
  continues,
  lane,
  rows,
  subgrid,
  head,
  path,
  active = true,
  after = false,
}: {
  steps: Step[];
  counts?: Counts;
  continues: boolean;
  lane?: Lane;
  rows?: number;
  subgrid?: 'columns';
  head?: React.ReactNode;
  path?: RunPath;
  active?: boolean;
  after?: boolean;
}) {
  const plan = planColumn(steps, continues);
  const on = (name: string | null) =>
    name !== null && active && path !== undefined && (path.reached.has(name) || path.current === name);
  const completed = path?.status === 'completed';
  const stalled = path !== undefined && path.current === null && stoppedAt(path) !== null;
  const stateFor = (name: string, previousOn: boolean): NodeState => {
    const state = stateOf(path, active, name);
    if (state) return state;
    return stalled && active && previousOn ? stoppedAt(path) : null;
  };
  const twoTracks = plan.fork !== null || subgrid === 'columns';
  const offset = lane || head ? 2 : 1;
  const laneCount = rows ?? rowsOf(plan) + (lane || head ? 1 : 0);
  const forkRow = offset + plan.before.length;
  const forkRows = plan.fork
    ? 1 +
      Math.max(1, ...plan.fork.lanes.map((entry) => laneRows(entry, plan.fork!.rest.length > 0 || continues)))
    : 0;
  const restRow = forkRow + 1;
  const lastRow = laneCount;

  const cell = (row: number, children: React.ReactNode, key: string) => (
    <div
      key={key}
      className={cn('flex flex-col items-center', twoTracks && 'translate-x-1/2 justify-self-end')}
      style={{ gridRow: row, gridColumn: twoTracks ? 1 : undefined }}
    >
      {children}
    </div>
  );

  const items: React.ReactNode[] = [];

  if (head) items.push(cell(1, head, 'head'));
  const laneOn = lane !== undefined && active && path !== undefined;

  if (lane && twoTracks) {
    items.push(
      <Corner key='corner-top' side={lane.side} edge='top' inset={false} row={1} active={laneOn} />,
      ...(lane.open
        ? [
            <Corner
              key='corner-bottom'
              side={lane.side}
              edge='bottom'
              inset={false}
              row={lastRow}
              active={laneOn && after}
            />,
          ]
        : [])
    );
  }

  if (lane) {
    items.push(
      cell(
        1,
        <>
          <Badge
            size='sm'
            variant={laneOn ? 'green' : 'default'}
            className={cn(path && !laneOn && 'opacity-50')}
          >
            {lane.label}
          </Badge>
          <Line className='min-h-4 grow' active={laneOn && on(firstName(steps))} />
        </>,
        'label'
      )
    );
  }

  if (lane && steps.length === 0) {
    items.push(
      <div
        key='empty'
        className={cn(
          'relative flex flex-col items-center justify-center pb-4',
          twoTracks && 'translate-x-1/2 justify-self-end'
        )}
        style={{ gridRow: 2, gridColumn: twoTracks ? 1 : undefined }}
      >
        {lane.open && (
          <Line className='-translate-x-1/2 absolute inset-y-0 left-1/2' active={laneOn && after} />
        )}
        <span className='relative z-10 rounded-xl border border-bg-3 border-dashed bg-bg-1 px-2.5 py-1.5 text-fg-2 text-sm'>
          Nothing
        </span>
      </div>
    );
  }

  plan.before.forEach((step, index) => {
    const row = offset + index;
    const last = !plan.fork && index === plan.before.length - 1;
    const name = 'exit' in step ? 'exit' : step.name;
    const here = on(name) && ('exit' in step ? completed : true);
    const previous = plan.before[index - 1];
    const previousOn =
      index === 0
        ? lane
          ? laneOn
          : active && path !== undefined
        : on(previous && 'exit' in previous ? 'exit' : (previous?.name ?? null));
    const next = plan.before[index + 1] ?? plan.fork?.step ?? null;
    const onward = next ? on('exit' in next ? 'exit' : next.name) : active && after;
    if ('exit' in step) {
      items.push(
        cell(
          row,
          <>
            {!(lane && index === 0) && <Line className='h-4' active={here} />}
            <ExitNode active={here} ghost={path !== undefined} />
            <Line className='h-3' active={here} />
            <EndDot active={here} />
          </>,
          'exit'
        )
      );
      return;
    }
    const finished = last && !continues && !lane?.open;
    items.push(
      cell(
        row,
        <>
          {!(lane && index === 0) && <Line className='h-4' active={here} />}
          <Node
            step={step}
            count={counts ? (counts[step.name] ?? 0) : null}
            state={stateFor(step.name, previousOn)}
            ghost={path !== undefined}
          />
          {finished && (
            <>
              <Line className='h-4' active={here && completed} />
              <EndDot active={here && completed} />
            </>
          )}
          {!finished && <Line className='min-h-4 grow' active={onward} />}
        </>,
        step.name
      )
    );
  });

  if (plan.fork) {
    const { step, lanes, rest } = plan.fork;
    const laneContinues = rest.length > 0 || continues;
    const merge = lanes.some((entry) => entry.open);
    const here = on(step.name);
    const decided = here && path?.taken[step.name] !== undefined;
    const last = plan.before.at(-1);
    const forkPreviousOn =
      plan.before.length === 0
        ? lane
          ? laneOn
          : active && path !== undefined
        : on(last && 'exit' in last ? 'exit' : (last?.name ?? null));
    const restReached = rest.length > 0 ? on(firstName(rest)) : after;
    items.push(
      cell(
        forkRow,
        <>
          {!(lane && plan.before.length === 0) && <Line className='h-4' active={here} />}
          <Node
            step={step}
            count={counts ? (counts[step.name] ?? 0) : null}
            state={stateFor(step.name, forkPreviousOn)}
            ghost={path !== undefined}
          />
          <Line className='min-h-3 grow' active={decided} />
        </>,
        step.name
      )
    );
    items.push(
      <div
        key={`${step.name}-lanes`}
        className='grid grid-cols-subgrid'
        style={{ gridRow: forkRow + 1, gridColumn: '1 / 3', gridTemplateRows: `repeat(${forkRows}, auto)` }}
      >
        {lanes.map((entry) => (
          <LaneColumn
            key={entry.label}
            lane={entry}
            counts={counts}
            continues={laneContinues}
            rows={forkRows}
            path={path}
            active={decided && path?.taken[step.name] === (entry.side === 'left' ? 'then' : 'else')}
            after={restReached}
          />
        ))}
      </div>
    );
    if (rest.length > 0) {
      items.push(
        <div
          key='rest'
          className='grid grid-cols-subgrid'
          style={{ gridRow: restRow + 1, gridColumn: '1 / 3' }}
        >
          {merge && cell(1, <Line className='h-3' active={restReached} />, 'merge')}
          <Column
            steps={rest}
            counts={counts}
            continues={continues}
            subgrid='columns'
            path={path}
            active={active}
            after={after}
          />
        </div>
      );
    } else if (merge && (continues || lane?.open)) {
      items.push(
        <div
          key='onwards'
          className={cn('flex flex-col items-center', twoTracks && 'translate-x-1/2 justify-self-end')}
          style={{ gridRow: `${restRow + 1} / ${lastRow + 1}`, gridColumn: 1 }}
        >
          <Line className='min-h-3 grow' active={active && after} />
        </div>
      );
    } else if (merge && !lane && !continues) {
      const ended = completed && active && path !== undefined && !path.reached.has('exit');
      items.push(
        cell(
          restRow + 1,
          <>
            <Line className='h-4' active={ended} />
            <EndDot active={ended} />
          </>,
          'end'
        )
      );
    }
  }

  if (lane && lane.fold.length > 0) {
    items.push(
      <div
        key='fold'
        className={cn('flex flex-col items-center', twoTracks && 'translate-x-1/2 justify-self-end')}
        style={{ gridRow: offset + rowsOf(plan), gridColumn: twoTracks ? 1 : undefined }}
      >
        <Column steps={lane.fold} counts={counts} continues={false} path={path} active={active} />
      </div>
    );
  }

  if (lane?.open && !plan.fork && steps.length > 0 && plan.before.length + offset <= lastRow) {
    items.push(
      <div
        key='fill'
        className='flex flex-col items-center'
        style={{ gridRow: `${plan.before.length + offset} / ${lastRow + 1}` }}
      >
        <Line className='min-h-0 grow' active={laneOn && after} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid',
        subgrid === 'columns' ? 'grid-cols-subgrid' : twoTracks ? '' : 'justify-items-center'
      )}
      style={{
        gridTemplateColumns: subgrid === 'columns' ? undefined : twoTracks ? `${TRACK} ${TRACK}` : undefined,
        gridColumn: subgrid === 'columns' ? '1 / 3' : undefined,
        gridTemplateRows: rows ? 'subgrid' : undefined,
        gridRow: rows ? `1 / ${rows + 1}` : undefined,
      }}
    >
      {items}
    </div>
  );
}

function LaneColumn({
  lane,
  counts,
  continues,
  rows,
  path,
  active = true,
  after = false,
}: {
  lane: Lane;
  counts?: Counts;
  continues: boolean;
  rows: number;
  path?: RunPath;
  active?: boolean;
  after?: boolean;
}) {
  const plan = planColumn(lane.steps, continues);
  const twoTracks = plan.fork !== null;
  const laneOn = active && path !== undefined;
  const onward =
    lane.fold.length > 0
      ? laneOn && (path.reached.has(firstName(lane.fold) ?? '') || path.current === firstName(lane.fold))
      : after;
  return (
    <div
      className={cn(
        'relative grid px-3 pt-4',
        lane.side === 'left' ? 'justify-self-end' : 'justify-self-start',
        lane.open && 'pb-4'
      )}
      style={{ gridRow: `1 / ${rows + 1}`, gridTemplateRows: 'subgrid' }}
    >
      {twoTracks ? null : (
        <>
          <Corner side={lane.side} edge='top' inset active={laneOn} />
          {lane.open && <Corner side={lane.side} edge='bottom' inset active={laneOn && after} />}
        </>
      )}
      <Column
        steps={lane.steps}
        counts={counts}
        continues={lane.open ? continues : lane.fold.length > 0}
        lane={lane}
        rows={rows}
        path={path}
        active={active}
        after={onward}
      />
    </div>
  );
}

function useCentredBoundary(
  scroller: React.RefObject<HTMLDivElement | null>,
  marker: React.RefObject<HTMLDivElement | null>
) {
  const [padding, setPadding] = useState({ left: 0, right: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const frame = scroller.current;
    const anchor = marker.current;
    if (!frame || !anchor) return;
    const content = frame.firstElementChild as HTMLElement | null;
    if (!content) return;

    const measure = () => {
      const styles = getComputedStyle(content);
      const inner = content.getBoundingClientRect();
      const box = anchor.getBoundingClientRect();
      const centre = box.left + box.width / 2 - inner.left - Number.parseFloat(styles.paddingLeft);
      const width =
        inner.width - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
      const left = Math.max(0, Math.round(width - 2 * centre));
      const right = Math.max(0, Math.round(2 * centre - width));
      setPadding((current) => (current.left === left && current.right === right ? current : { left, right }));
      frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
      setReady(true);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scroller, marker]);

  return { padding, ready };
}

export function WorkflowFlow({
  spec,
  counts,
  path,
  version,
}: {
  spec: WorkflowSpec;
  counts?: Counts;
  path?: RunPath;
  version?: FlowVersion;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const { padding, ready } = useCentredBoundary(scroller, marker);

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <Rules spec={spec} version={version} />
      <ScrollFade orientation='both' targetRef={scroller} />
      <div ref={scroller} className='min-h-0 flex-1 overflow-auto'>
        <div
          className={cn(
            'mx-auto flex w-max min-w-full flex-col items-center py-6 transition-opacity duration-150 ease-out',
            ready ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            paddingLeft: `calc(1rem + ${padding.left}px)`,
            paddingRight: `calc(1rem + ${padding.right}px)`,
          }}
        >
          <Column
            steps={spec.steps}
            counts={counts}
            continues={false}
            path={path}
            after={false}
            head={
              <div ref={marker} className='flex flex-col items-center'>
                <TriggerNode spec={spec} active={path !== undefined} />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
