import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Table, TableBody } from '@buzzkit/ui/components/table';
import { cn } from '@buzzkit/ui/lib/utils';
import { SubscriberColumns, SubscriberRow } from '@/app/components/subscribers/table';
import type { SegmentMember } from '@/app/lib/api.server';

export function SegmentPreviewPanel({
  count,
  sample,
  pending,
  problem,
  subscribersBase,
}: {
  count: number | null;
  sample: SegmentMember[];
  pending: boolean;
  problem: string | null;
  subscribersBase: string;
}) {
  return (
    <Card>
      <CardHeader divider className='py-3'>
        <CardTitle>Matching now</CardTitle>
        <CardAction className='flex items-center gap-2'>
          <Spinner
            className={cn('size-4 text-fg-2 transition-opacity', pending ? 'opacity-100' : 'opacity-0')}
          />
          <span className='flex items-baseline gap-1.5'>
            {count === null ? (
              <span className='font-medium text-base text-fg-2 leading-none'>–</span>
            ) : (
              <NumberFlow
                value={count}
                className='font-medium text-base text-fg-4 tabular-nums leading-none'
              />
            )}
            <span className='text-fg-2 text-sm'>{count === 1 ? 'subscriber' : 'subscribers'}</span>
          </span>
        </CardAction>
      </CardHeader>
      {problem ? (
        <EmptyState
          icon='IconExclamationTriangle'
          title='Fix the conditions first'
          description={problem}
          className='border-bg-3 border-t py-10'
        />
      ) : count === null ? (
        <EmptyState
          icon='IconTargetFilled'
          title='Nothing to match yet'
          description='Add a condition to see who this segment reaches.'
          className='border-bg-3 border-t py-10'
        />
      ) : sample.length === 0 ? (
        <EmptyState
          icon='IconTeamFilled'
          title='No subscriber matches yet'
          description='Nobody on this tenant meets these conditions right now.'
          className='border-bg-3 border-t py-10'
        />
      ) : (
        <div>
          <Table>
            <SubscriberColumns />
            <TableBody>
              {sample.map((member) => (
                <SubscriberRow key={member.id} subscriber={member} base={subscribersBase} />
              ))}
            </TableBody>
          </Table>
          {count !== null && count > sample.length && (
            <p className='border-bg-3 border-t px-4 py-2.5 text-fg-2 text-xs'>
              Showing {sample.length} of {count.toLocaleString()}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
