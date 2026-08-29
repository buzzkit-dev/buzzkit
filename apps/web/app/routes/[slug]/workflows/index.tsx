import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { NumberFlow } from '@buzzkit/ui/components/number-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';
import { Tooltip, TooltipContent, TooltipLabel, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { cn } from '@buzzkit/ui/lib/utils';
import { Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { WorkflowStatusBadge } from '@/app/components/badges';
import { TriggerConditions } from '@/app/components/workflows/trigger';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { workflowsAction } from '@/app/lib/actions/workflows.server';
import { listWorkflows, type Workflow } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Workflows · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const workflows = await listWorkflows({ request, env }, token, params.slug, tenant);
  return { workflows };
}

export const action = workflowsAction;

const LIVE_STATUSES = [
  { status: 'running', label: 'Running', dot: 'bg-blue-4' },
  { status: 'sleeping', label: 'Sleeping', dot: 'bg-sky-4' },
  { status: 'waiting', label: 'Waiting', dot: 'bg-purple-4' },
] as const;

function LiveRuns({ runs }: { runs: NonNullable<Workflow['runs']> }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className='flex w-fit cursor-default items-center gap-3'>
            {LIVE_STATUSES.map(({ status, dot }) => (
              <span key={status} className='flex items-center gap-1.5'>
                <span
                  className={cn('size-1.5 shrink-0 rounded-full', runs[status] === 0 ? 'bg-bg-3' : dot)}
                />
                <NumberFlow
                  value={runs[status]}
                  className={cn(
                    'text-sm leading-none tabular-nums',
                    runs[status] === 0 ? 'text-fg-1' : 'font-medium text-fg-4'
                  )}
                />
              </span>
            ))}
          </span>
        }
      />
      <TooltipContent>
        <span className='flex items-center gap-1.5 whitespace-nowrap'>
          {LIVE_STATUSES.map(({ status, label }, index) => (
            <span key={status} className='flex items-center gap-1.5'>
              {index > 0 && <TooltipLabel>·</TooltipLabel>}
              <span>{runs[status]}</span>
              <TooltipLabel>{label}</TooltipLabel>
            </span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

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
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Workflows
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Automate messages that follow what subscribers do.
          </p>
        </div>
        {canManage && (
          <Button icon='IconPlusMedium' nativeButton={false} render={<Link to={`${base}/new`} />}>
            Create workflow
          </Button>
        )}
      </header>

      <Card className='min-h-0 shrink'>
        {workflows.length === 0 ? (
          <EmptyState
            icon='IconAgentsFilled'
            title='No workflows yet'
            description='Create a workflow and it runs for every subscriber whose events match its trigger.'
            className='py-10'
          >
            {canManage && (
              <Button variant='soft' nativeButton={false} render={<Link to={`${base}/new`} />}>
                Create workflow
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table className='table-fixed'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-64'>Workflow</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className='w-24'>Status</TableHead>
                <TableHead className='w-32'>Live runs</TableHead>
                <TableHead className='w-28'>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((workflow) => (
                <WorkflowRow key={workflow.id} workflow={workflow} base={base} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
