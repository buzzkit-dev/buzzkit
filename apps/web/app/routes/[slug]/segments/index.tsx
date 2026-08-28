import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { Conditions } from '@/app/components/segments/conditions';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { segmentsAction } from '@/app/lib/actions/segments.server';
import { listSegments, type Segment } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Segments · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const segments = await listSegments({ request, env }, token, params.slug, tenant);
  return { segments };
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
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Segments
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Groups of subscribers defined by their attributes, events and activity.
          </p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' nativeButton={false} render={<Link to={`${base}/new`} />}>
            New segment
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {segments.length === 0 ? (
          <EmptyState
            icon='IconTargetFilled'
            title='No segments yet'
            description='Describe who to reach with conditions on attributes, events and activity, then send to them.'
            className='py-10'
          >
            {canManage && (
              <Button icon='IconPlusMedium' nativeButton={false} render={<Link to={`${base}/new`} />}>
                New segment
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-72'>Segment</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead className='w-32'>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <SegmentRow key={segment.id} segment={segment} base={base} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
