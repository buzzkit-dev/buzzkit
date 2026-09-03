import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Conditions } from '@buzzkit/web/components/conditions/chips';
import type { Expression } from 'buzzkit/expressions';
import { useEffect, useState } from 'react';

const ACTIVE_PRO: Expression[] = [
  { ref: 'attributes.plan', eq: 'pro' },
  { count: 'workout.completed', gte: 3, within: '7d' },
  { lastSeen: { within: '30d' } },
];

const MEMBERS = [
  { id: 'user_42', platform: 'iOS', seen: '2m ago' },
  { id: 'user_311', platform: 'iOS', seen: '26m ago' },
  { id: 'user_178', platform: 'Android', seen: '1h ago' },
  { id: 'user_907', platform: 'iOS', seen: '3h ago' },
];

const MATCH_COUNTS = [1291, 1288, 1302, 1284];

export function SegmentVignette() {
  const [count, setCount] = useState(1284);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setCount(MATCH_COUNTS[index % MATCH_COUNTS.length]!);
      index += 1;
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <div className='flex flex-col gap-2 px-4 py-3.5'>
        {ACTIVE_PRO.map((condition, index) => (
          <div key={JSON.stringify(condition)} className='flex items-center gap-2 text-sm'>
            <span className='w-10 text-fg-1 text-xs'>{index === 0 ? 'Where' : 'and'}</span>
            <Conditions expression={condition} />
          </div>
        ))}
        <span className='mt-1 flex items-center gap-2 font-medium text-fg-4 text-sm tabular-nums'>
          <LivePing />
          <NumberFlow className='leading-none' value={count} /> subscribers match right now
        </span>
      </div>
      <Table>
        <TableBody>
          {MEMBERS.map((member) => (
            <TableRow key={member.id}>
              <TableCell className='font-medium text-fg-4'>
                <span className='flex items-center gap-2.5'>
                  <PastelAvatar seed={member.id} variant='orb' size={20} />
                  {member.id}
                </span>
              </TableCell>
              <TableCell>
                <Badge size='sm' variant={member.platform === 'iOS' ? 'blue' : 'purple'}>
                  {member.platform}
                </Badge>
              </TableCell>
              <TableCell className='text-fg-2'>seen {member.seen}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
