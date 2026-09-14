import { Card } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { FilterSearch } from '@buzzkit/ui/components/filter-bar';
import { Table, TableBody, TableCell, TablePagination, TableRow } from '@buzzkit/ui/components/table';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RoleBadge } from '@/app/components/badges';
import { PageHeader } from '@/app/components/layout/page-header';
import { WorkspaceAvatar } from '@/app/components/layout/workspace-switcher';
import { type TableColumn, TableColumns } from '@/app/components/loading/table';
import { useFilters } from '@/app/hooks/use-filters';
import { Time } from '@/app/hooks/use-time-ago';
import { listEveryWorkspace } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

type EveryWorkspace = Awaited<ReturnType<typeof listEveryWorkspace>>['items'][number];

const COLUMNS: TableColumn[] = [
  { label: 'Workspace', fill: 'h-4 w-48' },
  { label: 'Your role', className: 'w-32', fill: 'h-4 w-16' },
  { label: 'Created', className: 'w-32', fill: 'h-4 w-20' },
];

export function meta() {
  return [{ title: 'Workspaces · Admin · BuzzKit' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const q = requestUrl(request).searchParams.get('q')?.trim() || undefined;
  const page = await listEveryWorkspace({ request, env }, token, { ...readPage(request), q });
  return { filtered: Boolean(q), workspaces: paginate(request, page) };
}

function WorkspaceRow({ workspace }: { workspace: EveryWorkspace }) {
  return (
    <TableRow>
      <TableCell className='py-2'>
        <Link to={`/${workspace.slug}`} className='flex min-w-0 items-center gap-3 outline-none'>
          <WorkspaceAvatar slug={workspace.slug} avatarUrl={workspace.avatarUrl} size={28} />
          <span className='flex min-w-0 flex-col'>
            <Truncate className='font-medium text-fg-4 hover:underline'>{workspace.name}</Truncate>
            <Truncate className='text-fg-2 text-xs'>{workspace.slug}</Truncate>
          </span>
        </Link>
      </TableCell>
      <TableCell>
        {workspace.role ? <RoleBadge role={workspace.role} /> : <span className='text-fg-2'>Support</span>}
      </TableCell>
      <TableCell>
        <Time at={workspace.createdAt} />
      </TableCell>
    </TableRow>
  );
}

export default function AdminWorkspacesRoute({ loaderData }: Route.ComponentProps) {
  const { filtered, workspaces } = loaderData;
  const filters = useFilters([]);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <PageHeader
        title='Workspaces'
        description='Every workspace on this deployment. Open one to support it as an owner.'
        actions={
          <FilterSearch
            value={filters.search}
            onChange={(change) => filters.setSearch(change.target.value)}
            loading={filters.searching}
            placeholder='Search workspaces'
            aria-label='Search workspaces'
            className='w-full sm:w-64'
          />
        }
      />
      <Card className='min-h-0 shrink'>
        {workspaces.items.length === 0 ? (
          <EmptyState
            icon='IconHomeRoundDoorFilled'
            title={filtered ? 'No workspaces match' : 'No workspaces yet'}
            description={
              filtered
                ? 'Nothing on this deployment matches that search.'
                : 'Workspaces appear here as soon as someone creates one.'
            }
            className='py-10'
          />
        ) : (
          <Table className='table-fixed'>
            <TableColumns columns={COLUMNS} />
            <TableBody>
              {workspaces.items.map((workspace) => (
                <WorkspaceRow key={workspace.id} workspace={workspace} />
              ))}
            </TableBody>
            <TablePagination {...workspaces.pagination} />
          </Table>
        )}
      </Card>
    </div>
  );
}
