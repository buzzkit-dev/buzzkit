import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Area, AreaChart } from '@buzzkit/ui/components/charts/area-chart';
import { Grid } from '@buzzkit/ui/components/charts/grid';
import { ChartTooltip } from '@buzzkit/ui/components/charts/tooltip/chart-tooltip';
import { XAxis } from '@buzzkit/ui/components/charts/x-axis';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { cn } from '@buzzkit/ui/lib/utils';
import { useMemo } from 'react';
import { type TableColumn, TableColumns } from '@/app/components/loading/table';
import type { Stats } from '@/app/lib/api.server';

const PLACEHOLDER_ROWS = ['a', 'b', 'c'];

const UTC = { timeZone: 'UTC' } as const;

const AXIS_FORMATS = {
  hour: new Intl.DateTimeFormat('en-US', { hour: 'numeric' }),
  hourDay: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', ...UTC }),
  day: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...UTC }),
  month: new Intl.DateTimeFormat('en-US', { month: 'short', ...UTC }),
  monthLong: new Intl.DateTimeFormat('en-US', { month: 'long', ...UTC }),
};

export const TONES = {
  sky: { fill: 'var(--sky-4)', dot: 'bg-sky-4' },
  purple: { fill: 'var(--purple-4)', dot: 'bg-purple-4' },
  green: { fill: 'var(--green-4)', dot: 'bg-green-4' },
  red: { fill: 'var(--red-4)', dot: 'bg-red-4' },
  amber: { fill: 'var(--amber-4)', dot: 'bg-amber-4' },
  blue: { fill: 'var(--blue-4)', dot: 'bg-blue-4' },
} as const;

const DELTA_ICONS: Record<'up' | 'down', { icon: IconName }> = {
  up: { icon: 'IconArrowUpRight' },
  down: { icon: 'IconArrowDownRight' },
};

type AxisPlan = {
  tick: (date: Date, index: number) => boolean;
  label: (date: Date) => string;
  title: (date: Date) => React.ReactNode;
};

export function dayOf(date: string): Date {
  return new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
}

function shortYear(date: Date): string {
  return `’${String(date.getUTCFullYear()).slice(-2)}`;
}

function Qualified({ qualifier, children }: { qualifier: string; children: React.ReactNode }) {
  return (
    <>
      <span className='text-chart-tooltip-muted'>{qualifier}</span> {children}
    </>
  );
}

export function axisPlan(interval: Stats['interval'], count: number): AxisPlan {
  const fromEnd = (_: Date, index: number) => (count - 1 - index) % 2 === 0;
  const monday = (date: Date) => date.getUTCDay() === 1;
  switch (interval) {
    case 'hour': {
      const step = count > 26 ? 8 : 4;
      return {
        tick: (date) => date.getHours() % step === 0,
        label: (date) => AXIS_FORMATS.hour.format(date),
        title: (date) => (
          <Qualified qualifier={AXIS_FORMATS.hourDay.format(date)}>
            {AXIS_FORMATS.hour.format(date)}
          </Qualified>
        ),
      };
    }
    case 'day': {
      const today = new Date().toISOString().slice(0, 10);
      const tick =
        count <= 8
          ? () => true
          : count <= 16
            ? fromEnd
            : count <= 62
              ? monday
              : (date: Date) => monday(date) && Math.floor(date.getTime() / (7 * 86_400_000)) % 2 === 0;
      const label =
        count <= 8
          ? (date: Date) =>
              date.toISOString().slice(0, 10) === today ? 'Today' : AXIS_FORMATS.weekday.format(date)
          : (date: Date) => AXIS_FORMATS.day.format(date);
      return {
        tick,
        label,
        title: (date) => (
          <Qualified qualifier={AXIS_FORMATS.weekday.format(date)}>{AXIS_FORMATS.day.format(date)}</Qualified>
        ),
      };
    }
    case 'week':
      return {
        tick: count <= 10 ? () => true : fromEnd,
        label: (date) => AXIS_FORMATS.day.format(date),
        title: (date) => <Qualified qualifier='Week of'>{AXIS_FORMATS.day.format(date)}</Qualified>,
      };
    case 'month':
      return {
        tick: () => true,
        label: (date) =>
          date.getUTCMonth() === 0
            ? `${AXIS_FORMATS.month.format(date)} ${shortYear(date)}`
            : AXIS_FORMATS.month.format(date),
        title: (date) => `${AXIS_FORMATS.monthLong.format(date)} ${shortYear(date)}`,
      };
  }
}

export function Delta({
  current,
  previous,
  upIsGood,
}: {
  current: number;
  previous: number;
  upIsGood: boolean;
}) {
  if (previous === 0 && current === 0) return null;
  const change = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
  const up = current > previous;
  const flat = current === previous;
  const count = `${current >= previous ? '+' : '−'}${Math.abs(current - previous).toLocaleString('en-US')}`;
  const label = change === null ? count : `${Math.abs(change)}% (${count})`;
  const tone = flat ? 'text-fg-2' : up === upIsGood ? 'text-green-4' : 'text-red-4';
  return (
    <span className={cn('flex items-center gap-0.5 font-medium text-sm', tone)}>
      {!flat && <Icon name={DELTA_ICONS[up ? 'up' : 'down'].icon} className='size-3.5 opacity-100' />}
      {label}
    </span>
  );
}

export function Tile({
  label,
  value,
  delta,
  tone,
  points,
}: {
  label: string;
  value: number;
  delta?: { current: number; previous: number; upIsGood: boolean };
  tone: keyof typeof TONES;
  points: { date: Date; value: number }[];
}) {
  const flat = points.every((point) => point.value === points[0]?.value);
  return (
    <Card className='gap-0 overflow-hidden'>
      <div className='flex flex-col px-4 pt-3.5'>
        <span className='text-fg-2 text-sm'>{label}</span>
        <span className='flex flex-wrap items-center gap-x-2'>
          <NumberFlow className='font-medium text-2xl text-fg-4 leading-none tracking-tight' value={value} />
          {delta && <Delta {...delta} />}
        </span>
      </div>
      <div className='h-14'>
        {!flat && (
          <AreaChart
            data={points}
            xDataKey='date'
            margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
            aspectRatio='auto'
            animationDuration={700}
            yDomainTween={false}
            interactive={false}
            className='h-full w-full'
            style={{ height: '100%' }}
          >
            <Area
              dataKey='value'
              fill={TONES[tone].fill}
              stroke={TONES[tone].fill}
              strokeWidth={1.5}
              fillOpacity={0.25}
              gradientToOpacity={0}
              fadeEdges
              showHighlight={false}
            />
          </AreaChart>
        )}
      </div>
    </Card>
  );
}

export function Key({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className='flex items-center gap-1.5 text-fg-2 text-xs'>
      <span className={cn('size-2 rounded-full', TONES[tone].dot)} />
      {children}
    </span>
  );
}

export type Line = {
  key: string;
  label: string;
  tone: keyof typeof TONES;
  pick: (day: Stats['series'][number]) => number;
};

export function PeriodChart({
  series,
  interval,
  lines,
  height = '16rem',
}: {
  series: Stats['series'];
  interval: Stats['interval'];
  lines: Line[];
  height?: string;
}) {
  const plan = useMemo(() => axisPlan(interval, series.length), [interval, series.length]);
  const data = series.map((day) => ({
    date: dayOf(day.date),
    ...Object.fromEntries(lines.map((line) => [line.key, line.pick(day)])),
  }));
  return (
    <AreaChart
      data={data}
      xDataKey='date'
      xDomain={[data[0]!.date, data.at(-1)!.date]}
      margin={{ top: 12, right: 24, bottom: 28, left: 24 }}
      aspectRatio='auto'
      animationDuration={700}
      yDomainTween={false}
      className='w-full'
      style={{ height }}
    >
      <Grid horizontal numTicksRows={3} strokeDasharray='none' />
      {lines.map((line) => (
        <Area
          key={line.key}
          dataKey={line.key}
          fill={TONES[line.tone].fill}
          stroke={TONES[line.tone].fill}
          strokeWidth={2}
          fillOpacity={0.14}
          gradientToOpacity={0}
        />
      ))}
      <XAxis ticks={plan.tick} format={plan.label} tickerHalfWidth={0} offset={6} />
      <ChartTooltip
        showDatePill={false}
        title={(point: Record<string, unknown>) => plan.title(point.date as Date)}
        rows={(point: Record<string, unknown>) =>
          lines.map((line) => ({
            color: TONES[line.tone].fill,
            label: line.label,
            value: Number(point[line.key]),
          }))
        }
      />
    </AreaChart>
  );
}

export const DELIVERY_LINES: Line[] = [
  { key: 'sent', label: 'Sent', tone: 'green', pick: (day) => day.sent },
  { key: 'delivered', label: 'Delivered', tone: 'blue', pick: (day) => day.delivered },
  { key: 'failed', label: 'Failed', tone: 'red', pick: (day) => day.failed + day.invalid },
];

export const CAPPED_LINE: Line = { key: 'capped', label: 'Capped', tone: 'amber', pick: (day) => day.capped };

export const EVENT_LINES: Line[] = [
  { key: 'events', label: 'Events', tone: 'amber', pick: (day) => day.events },
];

export const RUN_LINES: Line[] = [
  { key: 'started', label: 'Started', tone: 'blue', pick: (day) => day.runsStarted },
  { key: 'completed', label: 'Completed', tone: 'green', pick: (day) => day.runsCompleted },
  { key: 'failed', label: 'Failed', tone: 'red', pick: (day) => day.runsFailed },
];

export function TileSkeleton({ label }: { label: string }) {
  return (
    <Card className='gap-0 overflow-hidden'>
      <div className='flex flex-col px-4 pt-3.5'>
        <span className='text-fg-2 text-sm'>{label}</span>
        <span className='flex h-9 items-center gap-2'>
          <Skeleton className='h-6 w-14' />
        </span>
      </div>
      <div className='h-14' />
    </Card>
  );
}

export function ChartCardSkeleton({
  title,
  description,
  height,
}: {
  title: string;
  description: string;
  height: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='pt-1 pb-3'>
        <Skeleton className={cn('w-full rounded-xl', height)} />
      </CardContent>
    </Card>
  );
}

export function ListCardSkeleton({ title, columns }: { title: string; columns: TableColumn[] }) {
  return (
    <Card>
      <CardHeader className='py-3'>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <Table>
        <TableColumns columns={columns} />
        <TableBody>
          {PLACEHOLDER_ROWS.map((row) => (
            <TableRow key={row}>
              {columns.map((column) => (
                <TableCell key={column.label} className={column.className}>
                  <Skeleton className={column.fill ?? 'h-4 w-24'} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
