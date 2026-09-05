import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { Conditions } from '@/app/components/conditions/chips';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { useCanManage } from '@/app/hooks/use-known-role';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { segmentsAction } from '@/app/lib/actions/segments.server';
import { listSegments, type Segment } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Segments · BuzzKit' }];
}

const COLUMNS: TableColumn[] = [
  { label: 'Segment', className: 'w-72', fill: 'h-4 w-40' },
  { label: 'Conditions', fill: 'h-5 w-48 rounded-full' },
  { label: 'Updated', className: 'w-32', fill: 'h-4 w-16' },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  return { segments: listSegments({ request, env }, token, params.slug, tenant) };
}

export const action = segmentsAction;

function SegmentRow({ segment, base }: { segment: Segment; base: string }) {
  return (
    <TableRow>
      <TableCell className='font-medium text-fg-4'>
        <Link
          to={`${base}/${segment.slug}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate>{segment.name}</Truncate>
          <Truncate className='font-normal text-fg-2 text-xs'>{segment.description ?? segment.slug}</Truncate>
        </Link>
      </TableCell>
      <TableCell className='py-2'>
        {segment.version && <Conditions expression={segment.version.expression} />}
      </TableCell>
      <TableCell>
        <TimeAgo at={segment.updatedAt} />
      </TableCell>
    </TableRow>
  );
}

export default function SegmentsRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { segments } = loaderData;
  const base = `/${params.slug}/segments`;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <SegmentsHeader canManage={canManage} base={base} />

      <Deferred resolve={segments}>
        {(data) => {
          const rows = data ?? [];
          return data === undefined ? (
            <SegmentsSkeleton />
          ) : (
            <Card className='min-h-0 shrink'>
              {rows.length === 0 ? (
                <EmptyState
                  icon='IconTargetFilled'
                  title='No segments yet'
                  description='Describe who to reach with conditions on attributes, events and activity, then send to them.'
                  className='py-10'
                />
              ) : (
                <Table className='table-fixed'>
                  <TableColumns columns={COLUMNS} />
                  <TableBody>
                    {rows.map((segment) => (
                      <SegmentRow key={segment.id} segment={segment} base={base} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          );
        }}
      </Deferred>
    </div>
  );
}

function SegmentsHeader({ canManage, base }: { canManage: boolean | null; base?: string }) {
  const manage = useCanManage(canManage);

  return (
    <PageHeader
      title='Segments'
      description='Groups of subscribers defined by their attributes, events and activity.'
      actions={
        manage === false ? null : (
          <Button
            icon='IconPlusMedium'
            disabled={manage === null}
            nativeButton={false}
            render={<Link to={`${base}/new`} />}
          >
            New segment
          </Button>
        )
      }
    />
  );
}

function SegmentsSkeleton() {
  return <TableSkeleton columns={COLUMNS} />;
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <SegmentsHeader canManage={null} />
      <SegmentsSkeleton />
    </div>
  ),
};
