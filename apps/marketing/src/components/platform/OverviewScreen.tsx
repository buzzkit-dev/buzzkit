import { Button } from '@buzzkit/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';
import { Area, AreaChart } from '@buzzkit/ui/components/charts/area-chart';
import { Grid } from '@buzzkit/ui/components/charts/grid';
import { XAxis } from '@buzzkit/ui/components/charts/x-axis';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Delta, Key, ScreenHeader, TONES } from './Screen';

const DAY = 86_400_000;
const START = Date.UTC(2026, 7, 19);

const SENT = [1840, 1912, 2210, 2044, 2380, 2492, 2318, 2601, 2744, 2688, 2903, 3012, 2957, 3184];
const FAILED = [22, 18, 31, 24, 19, 27, 21, 30, 26, 22, 28, 24, 19, 23];
const SUBSCRIBERS = [
  12_140, 12_230, 12_318, 12_402, 12_540, 12_611, 12_704, 12_838, 12_902, 13_017, 13_141, 13_226, 13_318,
  13_460,
];
const EVENTS = [
  8420, 8790, 9130, 8880, 9640, 10_120, 9860, 10_480, 10_910, 10_730, 11_260, 11_690, 11_420, 12_050,
];

const series = SENT.map((sent, index) => ({
  date: new Date(START + index * DAY),
  sent,
  failed: FAILED[index]!,
  subscribers: SUBSCRIBERS[index]!,
  events: EVENTS[index]!,
}));

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Tile({
  label,
  value,
  delta,
  tone,
  dataKey,
}: {
  label: string;
  value: number;
  delta: string;
  tone: keyof typeof TONES;
  dataKey: 'sent' | 'subscribers' | 'events';
}) {
  return (
    <Card className='gap-0 overflow-hidden'>
      <div className='flex flex-col px-4 pt-3.5'>
        <span className='text-fg-2 text-sm'>{label}</span>
        <span className='flex items-center gap-2'>
          <NumberFlow className='font-medium text-2xl text-fg-4 leading-none tracking-tight' value={value} />
          <Delta>{delta}</Delta>
        </span>
      </div>
      <div className='h-14'>
        <AreaChart
          data={series}
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
            dataKey={dataKey}
            fill={TONES[tone].fill}
            stroke={TONES[tone].fill}
            strokeWidth={1.5}
            fillOpacity={0.25}
            gradientToOpacity={0}
            fadeEdges
            showHighlight={false}
          />
        </AreaChart>
      </div>
    </Card>
  );
}

export function OverviewScreen() {
  return (
    <>
      <ScreenHeader title='Overview' description='Subscribers, deliveries, events and runs over time.'>
        <Button variant='elevated' size='sm' icon={{ name: 'IconChevronDownMedium', position: 'inline-end' }}>
          Last 14 days
        </Button>
      </ScreenHeader>
      <div className='grid gap-5 lg:grid-cols-3'>
        <Tile label='Subscribers' value={13_460} delta='11%' tone='sky' dataKey='subscribers' />
        <Tile label='Delivered' value={35_285} delta='24%' tone='green' dataKey='sent' />
        <Tile label='Events' value={143_380} delta='18%' tone='amber' dataKey='events' />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>Sent and failed deliveries per day.</CardDescription>
          <CardAction className='gap-3'>
            <Key tone='green'>Sent</Key>
            <Key tone='red'>Failed</Key>
          </CardAction>
        </CardHeader>
        <CardContent className='pt-1 pb-16'>
          <AreaChart
            data={series}
            xDataKey='date'
            xDomain={[series[0]!.date, series.at(-1)!.date]}
            margin={{ top: 12, right: 24, bottom: 28, left: 24 }}
            aspectRatio='auto'
            animationDuration={700}
            yDomainTween={false}
            interactive={false}
            className='w-full'
            style={{ height: '15rem' }}
          >
            <Grid horizontal numTicksRows={3} strokeDasharray='none' />
            <XAxis
              ticks={(_date, index) => index % 2 === 1}
              format={(date) => dayLabel.format(date)}
              tickerHalfWidth={0}
              offset={6}
            />
            <Area
              dataKey='sent'
              fill={TONES.green.fill}
              stroke={TONES.green.fill}
              strokeWidth={2}
              fillOpacity={0.14}
              gradientToOpacity={0}
              fadeEdges
              showHighlight={false}
            />
            <Area
              dataKey='failed'
              fill={TONES.red.fill}
              stroke={TONES.red.fill}
              strokeWidth={2}
              fillOpacity={0.14}
              gradientToOpacity={0}
              fadeEdges
              showHighlight={false}
            />
          </AreaChart>
        </CardContent>
      </Card>
    </>
  );
}
