import { Area, AreaChart } from '@buzzkit/ui/components/charts/area-chart';
import { Grid } from '@buzzkit/ui/components/charts/grid';
import { ChartTooltip } from '@buzzkit/ui/components/charts/tooltip/chart-tooltip';
import { XAxis } from '@buzzkit/ui/components/charts/x-axis';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { useMemo } from 'react';
import type { EventVolume } from '@/app/lib/api.server';

const FORMATS = {
  hour: new Intl.DateTimeFormat('en-US', { hour: 'numeric' }),
  hourDay: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }),
  day: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
};

function Qualified({ qualifier, children }: { qualifier: string; children: React.ReactNode }) {
  return (
    <>
      <span className='text-chart-tooltip-muted'>{qualifier}</span> {children}
    </>
  );
}

function fill(volume: EventVolume): Array<{ date: Date; count: number; subscribers: number }> {
  const step = volume.bucketSeconds * 1000;
  const counts = new Map(volume.buckets.map((bucket) => [new Date(bucket.at).getTime(), bucket]));
  const start = Math.floor(new Date(volume.from).getTime() / step) * step;
  const end = new Date(volume.to).getTime();
  const points: Array<{ date: Date; count: number; subscribers: number }> = [];
  for (let at = start; at <= end; at += step) {
    const bucket = counts.get(at);
    points.push({ date: new Date(at), count: bucket?.count ?? 0, subscribers: bucket?.subscribers ?? 0 });
  }
  return points;
}

function plan(bucketSeconds: number, count: number) {
  if (bucketSeconds <= 3600) {
    const step = count > 26 ? 8 : 4;
    return {
      tick: (date: Date) => date.getHours() % step === 0,
      label: (date: Date) => FORMATS.hour.format(date),
      title: (date: Date) => (
        <Qualified qualifier={FORMATS.hourDay.format(date)}>{FORMATS.hour.format(date)}</Qualified>
      ),
    };
  }
  if (bucketSeconds < 86_400) {
    return {
      tick: (date: Date) => date.getUTCHours() === 0,
      label: (date: Date) => FORMATS.weekday.format(date),
      title: (date: Date) => (
        <Qualified qualifier={FORMATS.day.format(date)}>{FORMATS.hour.format(date)}</Qualified>
      ),
    };
  }
  return {
    tick: (_: Date, index: number) => (count - 1 - index) % 5 === 0,
    label: (date: Date) => FORMATS.day.format(date),
    title: (date: Date) => (
      <Qualified qualifier={FORMATS.weekday.format(date)}>{FORMATS.day.format(date)}</Qualified>
    ),
  };
}

export function VolumeChart({ volume }: { volume: EventVolume }) {
  const data = useMemo(() => fill(volume), [volume]);
  const axis = useMemo(() => plan(volume.bucketSeconds, data.length), [volume.bucketSeconds, data.length]);
  const total = data.reduce((sum, point) => sum + point.count, 0);

  if (total === 0 || data.length < 2) {
    return (
      <EmptyState
        size='sm'
        className='pt-0'
        icon='IconHistoryFilled'
        title='No events in this period'
        description='Track an event and its volume appears here.'
      />
    );
  }

  return (
    <AreaChart
      data={data}
      xDataKey='date'
      xDomain={[data[0]!.date, data.at(-1)!.date]}
      margin={{ top: 12, right: 24, bottom: 28, left: 24 }}
      aspectRatio='auto'
      animationDuration={700}
      yDomainTween={false}
      className='h-56 w-full'
      style={{ height: '14rem' }}
    >
      <Grid horizontal numTicksRows={3} strokeDasharray='none' />
      <Area
        dataKey='count'
        fill='var(--sky-4)'
        stroke='var(--sky-4)'
        strokeWidth={2}
        fillOpacity={0.14}
        gradientToOpacity={0}
      />
      <XAxis ticks={axis.tick} format={axis.label} tickerHalfWidth={0} offset={6} />
      <ChartTooltip
        showDatePill={false}
        title={(point: Record<string, unknown>) => axis.title(point.date as Date)}
        rows={(point: Record<string, unknown>) => [
          { color: 'var(--sky-4)', label: 'Events', value: Number(point.count) },
          { color: 'var(--purple-4)', label: 'Subscribers', value: Number(point.subscribers) },
        ]}
      />
    </AreaChart>
  );
}
