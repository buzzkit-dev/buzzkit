import { Avatar } from '@buzzkit/ui/components/avatar';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Flag } from '@buzzkit/ui/components/flag';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { PlatformBadge, VerifiedBadge } from '@buzzkit/web/components/badges/index';
import { SegmentBuilder } from '@buzzkit/web/components/segments/builder';
import { useEffect, useState } from 'react';
import { ScreenHeader } from './Screen';

type BuilderProps = Parameters<typeof SegmentBuilder>[0];
type Row = BuilderProps['rows'][number];
type Match = BuilderProps['match'];

const MODES = [
  { value: 'builder', label: 'Builder' },
  { value: 'json', label: 'JSON' },
];

const ROWS: Row[] = [
  { id: 1, kind: 'attribute', key: 'plan', operator: 'eq', value: 'pro' },
  { id: 2, kind: 'count', event: 'workout.completed', comparator: 'gte', count: '3', within: '7d' },
  { id: 3, kind: 'lastSeen', direction: 'within', within: '30d' },
];

const EVENT_NAMES = ['workout.completed', 'class.booked', 'trial.started', 'subscription.started'];

const MEMBERS = [
  { id: 'user_42', name: 'Maya Lindqvist', country: 'SE', platform: 'ios', joined: 'Mar 2', seen: '2m ago' },
  {
    id: 'user_311',
    name: 'Tomás Ferreira',
    country: 'PT',
    platform: 'ios',
    joined: 'Apr 18',
    seen: '26m ago',
  },
  {
    id: 'user_178',
    name: 'Priya Raman',
    country: 'IN',
    platform: 'android',
    joined: 'May 9',
    seen: '1h ago',
  },
  { id: 'user_907', name: 'Jonas Weber', country: 'DE', platform: 'ios', joined: 'Jun 21', seen: '3h ago' },
  { id: 'user_566', name: 'Amara Okafor', country: 'NG', platform: 'ios', joined: 'Jul 3', seen: '5h ago' },
  {
    id: 'user_230',
    name: 'Léa Moreau',
    country: 'FR',
    platform: 'android',
    joined: 'Jul 30',
    seen: '9h ago',
  },
] as const;

const COUNTRIES: Record<string, string> = {
  SE: 'Sweden',
  PT: 'Portugal',
  IN: 'India',
  DE: 'Germany',
  NG: 'Nigeria',
  FR: 'France',
};

const MATCH_COUNTS = [1284, 1291, 1288, 1302];

export function SegmentScreen() {
  const [match, setMatch] = useState<Match>('all');
  const [rows, setRows] = useState(ROWS);
  const [count, setCount] = useState(MATCH_COUNTS[0]!);

  useEffect(() => {
    let index = 1;
    const interval = setInterval(() => {
      setCount(MATCH_COUNTS[index % MATCH_COUNTS.length]!);
      index += 1;
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <ScreenHeader
        parent='Segments'
        title='Active pro members'
        description='Pro subscribers who trained this week and opened the app this month.'
      >
        <Button>Save</Button>
        <Button variant='soft' size='icon' icon='IconDotGrid1x3Horizontal' aria-label='Segment actions' />
      </ScreenHeader>
      <Card>
        <CardHeader divider className='py-3'>
          <CardTitle>Conditions</CardTitle>
          <CardAction>
            <PillTabs items={MODES} value='builder' itemClassName='h-6.5 px-2.5 text-xs' />
          </CardAction>
        </CardHeader>
        <SegmentBuilder
          match={match}
          rows={rows}
          eventNames={EVENT_NAMES}
          channels={['push']}
          showProblems={false}
          onMatchChange={setMatch}
          onRowsChange={setRows}
        />
      </Card>
      <Card>
        <CardHeader divider className='py-3'>
          <CardTitle>Matching now</CardTitle>
          <CardAction className='flex items-baseline gap-1.5'>
            <NumberFlow value={count} className='font-medium text-base text-fg-4 tabular-nums leading-none' />
            <span className='text-fg-2 text-sm'>subscribers</span>
          </CardAction>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subscriber</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Subscribed</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MEMBERS.map((member) => (
              <TableRow key={member.id}>
                <TableCell className='py-2'>
                  <span className='flex items-center gap-2.5'>
                    <Avatar name={member.id} label={member.name} />
                    <span className='flex min-w-0 flex-col'>
                      <span className='flex items-center gap-1.5 font-medium text-fg-4'>
                        {member.name}
                        <VerifiedBadge verified />
                      </span>
                      <span className='text-fg-2 text-xs'>{member.id}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className='flex items-center gap-1.5'>
                    <Flag code={member.country} />
                    {COUNTRIES[member.country]}
                  </span>
                </TableCell>
                <TableCell>
                  <PlatformBadge platform={member.platform} />
                </TableCell>
                <TableCell>{member.joined}</TableCell>
                <TableCell>{member.seen}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
