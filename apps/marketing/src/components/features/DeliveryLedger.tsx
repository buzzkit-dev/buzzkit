import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';

const ATTEMPTS = [
  { attempt: 1, outcome: 'Retrying', tone: 'amber', code: 'rate_limited', latency: '412 ms', at: '09:00:04' },
  { attempt: 2, outcome: 'Retrying', tone: 'amber', code: 'timeout', latency: '5,000 ms', at: '09:00:36' },
  { attempt: 3, outcome: 'Sent', tone: 'green', code: '200 from APNs', latency: '142 ms', at: '09:01:40' },
] as const;

export function DeliveryLedger() {
  return (
    <Card>
      <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-3'>
        <span className='font-medium text-fg-4 text-sm'>Delivery to user_42</span>
        <Badge size='sm' variant='blue'>
          iOS
        </Badge>
        <Badge size='sm' variant='green' className='ml-auto'>
          Delivered
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Attempt</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ATTEMPTS.map((row) => (
            <TableRow key={row.attempt}>
              <TableCell className='font-medium text-fg-4'>{row.attempt}</TableCell>
              <TableCell>
                <Badge size='sm' variant={row.tone}>
                  {row.outcome}
                </Badge>
              </TableCell>
              <TableCell className='text-fg-2'>{row.code}</TableCell>
              <TableCell className='tabular-nums'>{row.latency}</TableCell>
              <TableCell className='text-fg-2 tabular-nums'>{row.at}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='flex items-center gap-3 border-bg-3 border-t px-4 py-2.5 text-fg-2 text-xs tabular-nums'>
        <span>2,418 total</span>
        <span className='text-green-4'>2,412 sent</span>
        <span className='text-green-4'>2,380 delivered</span>
        <span className='text-red-4'>3 failed</span>
        <span className='text-fg-1'>3 invalid</span>
      </div>
    </Card>
  );
}
