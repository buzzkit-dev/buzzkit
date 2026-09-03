import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';

const ZONES = [
  { zone: 'Auckland', offset: 'UTC+12', state: 'Sent' },
  { zone: 'Tokyo', offset: 'UTC+9', state: 'Sent' },
  { zone: 'Berlin', offset: 'UTC+2', state: 'Sent' },
  { zone: 'New York', offset: 'UTC−4', state: 'Next' },
  { zone: 'Los Angeles', offset: 'UTC−7', state: 'Scheduled' },
] as const;

export function ScheduleVignette() {
  return (
    <Card>
      <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-3'>
        <span className='font-medium text-fg-4 text-sm'>Weekly recap</span>
        <Badge size='sm' variant='sky'>
          Scheduled
        </Badge>
        <span className='ml-auto text-fg-2 text-xs tabular-nums'>09:00, subscriber time</span>
      </div>
      <Table>
        <TableBody>
          {ZONES.map((entry) => (
            <TableRow key={entry.zone}>
              <TableCell className='font-medium text-fg-4'>{entry.zone}</TableCell>
              <TableCell className='text-fg-2 tabular-nums'>{entry.offset}</TableCell>
              <TableCell>
                {entry.state === 'Sent' && (
                  <Badge size='sm' variant='green'>
                    Sent
                  </Badge>
                )}
                {entry.state === 'Next' && (
                  <span className='flex items-center gap-1.5 text-fg-3 text-xs'>
                    <LivePing />
                    Releasing at 09:00
                  </span>
                )}
                {entry.state === 'Scheduled' && <Badge size='sm'>Scheduled</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
