import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Table, TableBody, TableCell, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { WorkflowStatusBadge } from '@/app/components/badges';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
import { LiveRuns } from '@/app/components/workflows/live-runs';
import { TriggerConditions } from '@/app/components/workflows/trigger';
import { useCanManage } from '@/app/hooks/use-known-role';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { workflowsAction } from '@/app/lib/actions/workflows.server';
import { listWorkflows, type Workflow } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Workflows · BuzzKit' }];
}

const COLUMNS: TableColumn[] = [
  { label: 'Workflow', className: 'w-64', fill: 'h-4 w-40' },
  { label: 'Trigger', fill: 'h-5 w-48 rounded-full' },
  { label: 'Status', className: 'w-24', fill: 'h-5 w-16 rounded-full' },
  { label: 'Live runs', className: 'w-32', fill: 'h-4 w-20' },
  { label: 'Updated', className: 'w-28', fill: 'h-4 w-16' },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  return { workflows: listWorkflows({ request, env }, token, params.slug, tenant) };
}

export const action = workflowsAction;

function WorkflowRow({ workflow, base }: { workflow: Workflow; base: string }) {
  const runs = workflow.runs ?? { running: 0, sleeping: 0, waiting: 0, steps: {} };
  return (
    <TableRow>
      <TableCell className='font-medium text-fg-4'>
        <Link
          to={`${base}/${workflow.slug}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate>{workflow.name}</Truncate>
          <Truncate className='font-normal text-fg-2 text-xs'>
            {workflow.description ?? workflow.slug}
          </Truncate>
        </Link>
      </TableCell>
      <TableCell className='py-2'>
        <TriggerConditions spec={workflow.spec} />
      </TableCell>
      <TableCell>
        <WorkflowStatusBadge status={workflow.status} />
      </TableCell>
      <TableCell>
        <LiveRuns runs={runs} />
      </TableCell>
      <TableCell>
        <TimeAgo at={workflow.updatedAt} />
      </TableCell>
    </TableRow>
  );
}

export default function WorkflowsRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { workflows } = loaderData;
  const base = `/${params.slug}/workflows`;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <WorkflowsHeader canManage={canManage} base={base} />

      <Deferred resolve={workflows}>
        {(data) => {
          const rows = data ?? [];
          return data === undefined ? (
            <WorkflowsSkeleton />
          ) : (
            <Card className='min-h-0 shrink'>
              {rows.length === 0 ? (
                <EmptyState
                  icon='IconAgentsFilled'
                  title='No workflows yet'
                  description='Create a workflow and it runs for every subscriber whose events match its trigger.'
                  className='py-10'
                />
              ) : (
                <Table className='table-fixed'>
                  <TableColumns columns={COLUMNS} />
                  <TableBody>
                    {rows.map((workflow) => (
                      <WorkflowRow key={workflow.id} workflow={workflow} base={base} />
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

function WorkflowsHeader({ canManage, base }: { canManage: boolean | null; base?: string }) {
  const manage = useCanManage(canManage);

  return (
    <PageHeader
      title='Workflows'
      description='Automate messages that follow what subscribers do.'
      actions={
        manage === false ? null : (
          <Button
            icon='IconPlusMedium'
            disabled={manage === null}
            nativeButton={false}
            render={<Link to={`${base}/new`} />}
          >
            Create workflow
          </Button>
        )
      }
    />
  );
}

function WorkflowsSkeleton() {
  return <TableSkeleton columns={COLUMNS} />;
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <WorkflowsHeader canManage={null} />
      <WorkflowsSkeleton />
    </div>
  ),
};
