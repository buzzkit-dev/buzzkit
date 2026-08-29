import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterBar, FilterClear, FilterSelect } from '@buzzkit/ui/components/filter-bar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RunStatusBadge } from '@/app/components/badges';
import { useFilters } from '@/app/hooks/use-filters';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { listRuns, listWorkflows, type Run, type RunStatus } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const FILTER_KEYS = ['status', 'workflow'] as const;

const STATUS_OPTIONS: { value: RunStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

export function meta() {
  return [{ title: 'Runs · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const search = requestUrl(request).searchParams;
  const status = STATUS_OPTIONS.find((option) => option.value === search.get('status'))?.value;
  const workflow = search.get('workflow') || undefined;
  const ctx = { request, env };
  const [page, workflows] = await Promise.all([
    listRuns(ctx, token, params.slug, tenant, { ...readPage(request), status, workflow }),
    listWorkflows(ctx, token, params.slug, tenant),
  ]);
  return { ...paginate(request, page), workflows, filtered: status !== undefined || workflow !== undefined };
}

function RunRow({ run, slug }: { run: Run; slug: string }) {
  return (
    <TableRow>
      <TableCell className='max-w-64 py-2'>
        <Link
          to={`/${slug}/runs/${run.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate className='font-medium text-fg-4'>{run.externalId}</Truncate>
          {run.summary && <Truncate className='text-fg-2 text-xs'>{run.summary}</Truncate>}
        </Link>
      </TableCell>
      <TableCell className='max-w-56'>
        <Link to={`/${slug}/workflows/${run.workflow}`} className='outline-none focus-visible:underline'>
          <Truncate>{run.workflow}</Truncate>
        </Link>
      </TableCell>
      <TableCell>
        <RunStatusBadge status={run.status} />
      </TableCell>
      <TableCell>{run.step}</TableCell>
      <TableCell>
        <TimeAgo at={run.startedAt} />
      </TableCell>
      <TableCell>
        <TimeAgo at={run.updatedAt} />
      </TableCell>
    </TableRow>
  );
}

export default function RunsRoute({ loaderData, params }: Route.ComponentProps) {
  const { items: runs, pagination, workflows, filtered } = loaderData;
  const fresh = !filtered && runs.length === 0;
  const filters = useFilters(FILTER_KEYS);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>Runs</h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Every workflow run in this workspace, newest first.
          </p>
        </div>
      </header>

      {!fresh && (
        <FilterBar>
          <FilterSelect
            label='Status'
            value={filters.values.status as RunStatus | null}
            options={STATUS_OPTIONS}
            onValueChange={(value) => filters.set('status', value)}
          />
          <FilterSelect
            label='Workflow'
            value={filters.values.workflow}
            options={workflows.map((workflow) => ({ value: workflow.slug, label: workflow.name }))}
            onValueChange={(value) => filters.set('workflow', value)}
          />
          {filters.active && <FilterClear onClick={filters.clear} />}
        </FilterBar>
      )}

      <Card className='min-h-0 shrink'>
        {fresh ? (
          <EmptyState
            icon='IconAgentsFilled'
            title='No runs yet'
            description='A run starts when an event matches the trigger of an active workflow.'
            className='py-10'
          />
        ) : runs.length === 0 ? (
          <EmptyState
            icon='IconAgentsFilled'
            title='No runs match'
            description='No run in this workspace matches these filters.'
            className='py-10'
          >
            <Button variant='soft' onClick={filters.clear}>
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subscriber</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} slug={params.slug} />
              ))}
            </TableBody>
            <TablePagination {...pagination} />
          </Table>
        )}
      </Card>
    </div>
  );
}
