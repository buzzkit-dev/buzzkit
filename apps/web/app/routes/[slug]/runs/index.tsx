import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterBar, FilterClear, FilterSelect } from '@buzzkit/ui/components/filter-bar';
import { Table, TableBody, TableCell, TablePagination, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RunStatusBadge } from '@/app/components/badges';
import { PageHeader } from '@/app/components/layout/page-header';
import { Deferred } from '@/app/components/loading/deferred';
import type { PageHandle } from '@/app/components/loading/handle';
import { type TableColumn, TableColumns, TableSkeleton } from '@/app/components/loading/table';
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
  { value: 'canceled', label: 'Canceled' },
  { value: 'failed', label: 'Failed' },
];

const COLUMNS: TableColumn[] = [
  { label: 'Subscriber', fill: 'h-4 w-40' },
  { label: 'Workflow', fill: 'h-4 w-32' },
  { label: 'Status', fill: 'h-5 w-16 rounded-full' },
  { label: 'Step', fill: 'h-4 w-24' },
  { label: 'Started', fill: 'h-4 w-16' },
  { label: 'Updated', fill: 'h-4 w-16' },
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
  return {
    filtered: status !== undefined || workflow !== undefined,
    page: (async () => {
      const [page, workflows] = await Promise.all([
        listRuns(ctx, token, params.slug, tenant, { ...readPage(request), status, workflow }),
        listWorkflows(ctx, token, params.slug, tenant),
      ]);
      return { ...paginate(request, page), workflows };
    })(),
  };
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
  const filters = useFilters(FILTER_KEYS);
  const { page, filtered } = loaderData;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <RunsHeader />

      <Deferred resolve={page}>
        {(data) => {
          const cold = data === undefined;
          const runs = data?.items ?? [];
          const workflows = data?.workflows ?? [];
          const fresh = data !== undefined && !filtered && runs.length === 0;
          if (cold) return <RunsSkeleton />;
          return (
            <>
              {!fresh && <RunsFilters workflows={workflows} cold={cold} />}

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
                    <TableColumns columns={COLUMNS} />
                    <TableBody>
                      {runs.map((run) => (
                        <RunRow key={run.id} run={run} slug={params.slug} />
                      ))}
                    </TableBody>
                    <TablePagination {...data.pagination} />
                  </Table>
                )}
              </Card>
            </>
          );
        }}
      </Deferred>
    </div>
  );
}

function RunsHeader() {
  return <PageHeader title='Runs' description='Every workflow run in this workspace, newest first.' />;
}

function RunsFilters({
  workflows,
  cold,
}: {
  workflows: Array<{ slug: string; name: string }>;
  cold: boolean;
}) {
  const filters = useFilters(FILTER_KEYS);

  return (
    <FilterBar>
      <FilterSelect
        label='Status'
        value={filters.values.status as RunStatus | null}
        options={STATUS_OPTIONS}
        onValueChange={(value) => filters.set('status', value)}
        disabled={cold}
      />
      <FilterSelect
        label='Workflow'
        value={filters.values.workflow}
        options={workflows.map((workflow) => ({ value: workflow.slug, label: workflow.name }))}
        onValueChange={(value) => filters.set('workflow', value)}
        disabled={cold}
      />
      {filters.active && <FilterClear onClick={filters.clear} disabled={cold} />}
    </FilterBar>
  );
}

function RunsSkeleton() {
  return (
    <>
      <RunsFilters workflows={[]} cold />
      <TableSkeleton columns={COLUMNS} fixed={false} />
    </>
  );
}

export const handle: PageHandle = {
  skeleton: (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <RunsHeader />
      <RunsSkeleton />
    </div>
  ),
};
