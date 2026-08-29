import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@buzzkit/ui/components/alert-dialog';
import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@buzzkit/ui/components/dropdown-menu';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Field, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { Input } from '@buzzkit/ui/components/input';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { toast } from '@buzzkit/ui/components/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RunStatusBadge, WorkflowStatusBadge } from '@/app/components/badges';
import { describeTrigger, describeVersionChanges } from '@/app/components/workflows/describe';
import { WorkflowFlow } from '@/app/components/workflows/flow';
import { parseSpec, prettySpec, SpecEditor } from '@/app/components/workflows/spec-editor';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { workflowsAction } from '@/app/lib/actions/workflows.server';
import {
  getWorkflow,
  listWorkflowRuns,
  type RunStatus,
  type WorkflowDetail,
  type WorkflowRun,
  type WorkflowVersion,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const TABS = [
  { value: 'steps', label: 'Steps' },
  { value: 'code', label: 'Code' },
  { value: 'versions', label: 'Versions' },
  { value: 'runs', label: 'Runs' },
] as const;

const RUN_FILTERS: { value: RunFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

type Tab = (typeof TABS)[number]['value'];

type RunFilter = RunStatus | 'all';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.workflow.name} · BuzzKit` : 'Workflow · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const search = requestUrl(request).searchParams;
  const tab = TABS.find((entry) => entry.value === search.get('tab'))?.value ?? 'steps';
  const runStatus = RUN_FILTERS.find((entry) => entry.value === search.get('status'))?.value ?? 'all';
  const [workflow, runs] = await Promise.all([
    getWorkflow(ctx, token, params.slug, tenant, params.workflowSlug),
    tab === 'runs'
      ? listWorkflowRuns(ctx, token, params.slug, tenant, params.workflowSlug, {
          ...readPage(request),
          ...(runStatus === 'all' ? {} : { status: runStatus }),
        })
      : Promise.resolve(null),
  ]);
  return { workflow, tab, runStatus, runs: runs ? paginate(request, runs) : null };
}

export const action = workflowsAction;

function VersionRow({
  version,
  previous,
  workflow,
  onSelect,
}: {
  version: WorkflowVersion;
  previous: WorkflowVersion | null;
  workflow: WorkflowDetail;
  onSelect: () => void;
}) {
  const published = workflow.current?.id === version.id;
  const draft = !version.publishedAt;
  return (
    <li>
      <button
        type='button'
        onClick={onSelect}
        className='flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-bg-2/60 focus-visible:bg-bg-2'
      >
        <IconTile icon='IconHistoryFilled' size='sm' />
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='flex items-center gap-2 font-medium text-fg-4 text-sm'>
            Version {version.number}
            {published && <WorkflowStatusBadge status='active' />}
            {draft && <WorkflowStatusBadge status='draft' />}
          </span>
          <Truncate className='max-w-full text-fg-2 text-xs'>
            {describeVersionChanges(version.spec, previous?.spec ?? null).join(' · ')}
          </Truncate>
        </div>
        <span className='shrink-0 text-fg-2 text-xs'>
          {version.publishedAt ? (
            <>
              Published <Time at={version.publishedAt} />
            </>
          ) : (
            <>
              Created <Time at={version.createdAt} />
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function RunRow({ run, slug }: { run: WorkflowRun; slug: string }) {
  return (
    <TableRow>
      <TableCell className='max-w-72 py-2'>
        <Link
          to={`/${slug}/runs/${run.id}`}
          className='flex min-w-0 flex-col outline-none focus-visible:underline'
        >
          <Truncate className='font-medium text-fg-4'>{run.externalId}</Truncate>
          {run.summary && <Truncate className='text-fg-2 text-xs'>{run.summary}</Truncate>}
        </Link>
      </TableCell>
      <TableCell>
        <RunStatusBadge status={run.status} />
      </TableCell>
      <TableCell>{run.step ? <span>{run.step}</span> : null}</TableCell>
      <TableCell>
        <TimeAgo at={run.startedAt} />
      </TableCell>
      <TableCell>
        <TimeAgo at={run.updatedAt} />
      </TableCell>
    </TableRow>
  );
}

function CodeTab({ workflow }: { workflow: WorkflowDetail }) {
  const saved = prettySpec(workflow.spec);
  const [text, setText] = useState(saved);
  const { submit, pending } = useActionFetcher((data) => {
    toast.success(
      typeof data.draft === 'number'
        ? `Saved as draft version ${data.draft}`
        : 'Nothing changed in the definition'
    );
  });

  const result = parseSpec(text);
  const dirty = text !== saved;
  const canSave = dirty && result.spec !== null && !pending;

  return (
    <>
      <div className='flex min-h-0 shrink flex-col p-4'>
        <SpecEditor text={text} result={result} onChange={setText} fill />
      </div>
      <CardFooter className='justify-end gap-2'>
        {dirty && (
          <Button variant='ghost' size='sm' onClick={() => setText(saved)}>
            Discard
          </Button>
        )}
        <Button
          size='sm'
          disabled={!canSave}
          loading={pending}
          onClick={() =>
            result.spec && submit('update', { workflow: workflow.slug, spec: JSON.stringify(result.spec) })
          }
        >
          Save as draft
        </Button>
      </CardFooter>
    </>
  );
}

function DetailsDialog({
  workflow,
  open,
  onOpenChange,
}: {
  workflow: WorkflowDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  const { submit, pending } = useActionFetcher(() => onOpenChange(false));

  const canSave = name.trim().length > 0 && !pending;

  useEffect(() => {
    if (!open) return;
    setName(workflow.name);
    setDescription(workflow.description ?? '');
  }, [open, workflow]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Edit workflow</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          <Field>
            <FieldLabel htmlFor='workflow-name'>Name</FieldLabel>
            <Input
              id='workflow-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='workflow-description'>Description</FieldLabel>
            <Textarea
              id='workflow-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </Field>
          <Button
            className='w-full'
            disabled={!canSave}
            loading={pending}
            onClick={() =>
              submit('update', {
                workflow: workflow.slug,
                name: name.trim(),
                description: description.trim(),
              })
            }
          >
            Save changes
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkflowRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const { workflow, tab, runStatus, runs } = loaderData;
  const base = `/${params.slug}/workflows`;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const spec = workflow.spec;
  const versions = workflow.versions ?? [];
  const shown =
    versions.find((version) => version.id === workflow.current?.id) ??
    versions.find((version) => version.id === workflow.draft?.id) ??
    versions[0]!;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [openVersion, setOpenVersion] = useState<WorkflowVersion | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [filter, setFilter] = useState<RunFilter>(runStatus);
  const { submit, pending } = useActionFetcher((data) => {
    if (data.deleted) {
      toast.success('Workflow deleted');
      navigate(base);
    } else if (data.published) {
      toast.success(workflow.status === 'paused' ? 'Workflow resumed' : 'Workflow published');
    } else if (data.paused) {
      setPauseOpen(false);
      toast.success('Workflow paused');
    }
  });

  const publishLabel =
    workflow.draft !== null ? 'Publish draft' : workflow.status === 'paused' ? 'Resume' : 'Publish';
  const canPublish = workflow.status !== 'active' || workflow.draft !== null;
  const go = (patch: Record<string, string | null>) => {
    const search = new URLSearchParams();
    if (tab !== 'steps') search.set('tab', tab);
    if (runStatus !== 'all') search.set('status', runStatus);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    const query = search.toString();
    navigate(query ? `?${query}` : '.', { preventScrollReset: true, replace: true });
  };

  useEffect(() => setFilter(runStatus), [runStatus]);

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={base} />}
      >
        Workflows
      </Button>

      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <h1 className='flex items-center gap-2.5 text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            <Truncate>{workflow.name}</Truncate>
            <WorkflowStatusBadge status={workflow.status} />
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            {workflow.description ?? `Runs ${describeTrigger(spec)}.`}
          </p>
        </div>
        {canManage && (
          <div className='flex shrink-0 items-center gap-2'>
            {workflow.status === 'active' && (
              <Button variant='soft' disabled={pending} onClick={() => setPauseOpen(true)}>
                Pause
              </Button>
            )}
            <Button
              disabled={!canPublish || pending}
              onClick={() => submit('publish', { workflow: workflow.slug })}
            >
              {publishLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='soft'
                    size='icon'
                    icon='IconDotGrid1x3Horizontal'
                    aria-label='Workflow actions'
                  />
                }
              />
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => setDetailsOpen(true)}>Edit details</DropdownMenuItem>
                <DropdownMenuItem variant='destructive' onClick={() => setDeleteOpen(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <Card className='flex min-h-0 shrink flex-col'>
        <CardHeader divider className='py-3'>
          <CardTitle>{TABS.find((entry) => entry.value === tab)?.label}</CardTitle>
          <CardAction>
            <PillTabs
              items={[...TABS]}
              value={tab}
              itemClassName='h-6.5 px-2.5 text-xs'
              onValueChange={(value: Tab) => go({ tab: value === 'steps' ? null : value, status: null })}
            />
          </CardAction>
        </CardHeader>

        {tab === 'steps' && (
          <WorkflowFlow
            spec={shown.spec}
            counts={workflow.runs?.steps ?? {}}
            version={{
              number: shown.number,
              note: shown.publishedAt
                ? workflow.draft
                  ? `Published. Draft version ${workflow.draft.number} is not live yet.`
                  : 'Published'
                : 'Draft, not published yet',
            }}
          />
        )}

        {tab === 'code' && (
          <CodeTab key={workflow.draft?.id ?? workflow.current?.id ?? workflow.id} workflow={workflow} />
        )}

        {tab === 'versions' && (
          <ul className='flex min-h-0 flex-col divide-y divide-bg-3 overflow-y-auto'>
            {versions.map((version, index) => (
              <VersionRow
                key={version.id}
                version={version}
                previous={versions[index + 1] ?? null}
                workflow={workflow}
                onSelect={() => {
                  setOpenVersion(version);
                  setVersionOpen(true);
                }}
              />
            ))}
          </ul>
        )}

        {tab === 'runs' && runs && (
          <div className='flex min-h-0 flex-col overflow-y-auto'>
            <div className='px-4 py-2'>
              <PillTabs
                items={RUN_FILTERS}
                value={filter}
                itemClassName='h-6.5 px-2.5 text-xs'
                onValueChange={(value) => {
                  setFilter(value);
                  go({ status: value === 'all' ? null : value, cursor: null, trail: null });
                }}
              />
            </div>
            {runs.items.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconAgentsFilled'
                title={runStatus === 'all' ? 'No runs yet' : `No ${runStatus} runs`}
                description={
                  runStatus === 'all'
                    ? 'A run starts when a matching event arrives for a subscriber and appears here moments later.'
                    : 'No run of this workflow has that status.'
                }
              />
            ) : (
              <Table className='border-bg-3 border-t'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.items.map((run) => (
                    <RunRow key={run.id} run={run} slug={params.slug} />
                  ))}
                </TableBody>
                <TablePagination {...runs.pagination} />
              </Table>
            )}
          </div>
        )}
      </Card>

      <DetailsDialog workflow={workflow} open={detailsOpen} onOpenChange={setDetailsOpen} />

      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent showCloseButton className='sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              Version {openVersion?.number}
              {openVersion && workflow.current?.id === openVersion.id && (
                <WorkflowStatusBadge status='active' />
              )}
              {openVersion && !openVersion.publishedAt && <WorkflowStatusBadge status='draft' />}
            </DialogTitle>
          </DialogHeader>
          {openVersion && (
            <div className='flex max-h-[70vh] w-full min-h-0 flex-col overflow-hidden rounded-2xl ring-1 ring-bg-3'>
              <WorkflowFlow
                spec={openVersion.spec}
                version={{
                  number: openVersion.number,
                  note:
                    workflow.current?.id === openVersion.id
                      ? 'Published'
                      : openVersion.publishedAt
                        ? 'Published before, replaced since'
                        : 'Draft, not published yet',
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause “{workflow.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              No new runs start while it is paused.
              <span className='block'>Runs already going finish as planned.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => submit('pause', { workflow: workflow.slug })}
            >
              Pause workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{workflow.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Runs still going stop and no new ones start.
              <span className='block'>This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={() => submit('delete', { workflow: workflow.slug })}
            >
              Delete workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
