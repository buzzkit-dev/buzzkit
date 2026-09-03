import { Button } from '@buzzkit/ui/components/button';
import { Card, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { ScrollFade } from '@buzzkit/ui/components/scroll-fade';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { Truncate } from '@buzzkit/ui/components/truncate';
import { useRef } from 'react';
import { Link } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { RunStatusBadge } from '@/app/components/badges';
import { DetailRow } from '@/app/components/detail/row';
import { BlockSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { describeRunEvent } from '@/app/components/workflows/describe';
import { type RunPath, WorkflowFlow } from '@/app/components/workflows/flow';
import { useLinkedScroll } from '@/app/hooks/use-linked-scroll';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
import { getRun, getWorkflow, type RunEvent } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Run · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  return {
    detail: (async () => {
      const run = await getRun(ctx, token, params.slug, tenant, params.runId);
      const workflow = await getWorkflow(ctx, token, params.slug, tenant, run.workflow).catch(() => null);
      const version = workflow?.versions?.find((entry) => entry.id === run.versionId) ?? null;
      const live = workflow?.current ?? null;
      return {
        run,
        workflow,
        spec: version?.spec ?? workflow?.spec ?? null,
        version:
          version === null
            ? null
            : {
                number: version.number,
                note: live && live.id !== version.id ? `Version ${live.number} is published now` : null,
              },
      };
    })(),
  };
}

function EventItem({ event, slug }: { event: RunEvent; slug: string }) {
  const { icon, label, detail } = describeRunEvent(event);
  const messageId = typeof event.data.messageId === 'string' ? event.data.messageId : null;
  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      <IconTile icon={icon} size='sm' />
      <div className='flex min-w-0 flex-1 flex-col items-start'>
        <Truncate className='max-w-full font-medium text-fg-4 text-sm'>{label}</Truncate>
        {(detail || messageId) && (
          <span className='flex max-w-full items-center gap-1.5 text-fg-2 text-xs'>
            {detail && <Truncate>{detail}</Truncate>}
            {messageId && (
              <Link
                to={`/${slug}/messages/${messageId}`}
                className='shrink-0 text-fg-3 underline-offset-2 hover:underline'
              >
                View message
              </Link>
            )}
          </span>
        )}
      </div>
      <div className='shrink-0 text-fg-2 text-xs'>
        <TimeAgo at={event.timestamp} />
      </div>
    </li>
  );
}

function RunContent({
  data,
  slug,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['detail']>;
  slug: string;
}) {
  const { run, workflow, spec, version } = data;
  const workflowBase = `/${slug}/workflows/${run.workflow}`;
  const steps = run.events.filter((event) => event.name === '$run.step' && event.step);
  const path: RunPath = {
    reached: new Set(
      steps
        .filter((event) => event.data.status === 'completed' || event.data.status === 'skipped')
        .map((event) => event.step as string)
    ),
    skipped: new Set(
      steps.filter((event) => event.data.status === 'skipped').map((event) => event.step as string)
    ),
    current: run.status === 'completed' ? null : run.step,
    taken: Object.fromEntries(
      steps
        .filter((event) => typeof event.data.taken === 'string')
        .map((event) => [event.step as string, event.data.taken as string])
    ),
    status: run.status,
  };
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  useLinkedScroll(mainRef, asideRef);

  return (
    <>
      <Button
        variant='ghost'
        size='sm'
        icon='IconChevronLeftMedium'
        className='-ml-2 w-fit shrink-0 text-fg-2 hover:text-fg-4'
        nativeButton={false}
        render={<Link to={`${workflowBase}?tab=runs`} />}
      >
        {workflow?.name ?? run.workflow}
      </Button>

      <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
        <ScrollFade targetRef={mainRef} />
        <div
          ref={mainRef}
          className='-m-1 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-1 [&>*]:shrink-0'
        >
          <Card className='flex max-h-[36rem] min-h-0 flex-col'>
            <CardHeader divider className='py-3'>
              <CardTitle>Flow</CardTitle>
            </CardHeader>
            {spec ? (
              <WorkflowFlow spec={spec} path={path} version={version ?? undefined} />
            ) : (
              <EmptyState
                size='sm'
                icon='IconAgentsFilled'
                title='Workflow gone'
                description='The workflow this run belongs to was deleted.'
              />
            )}
          </Card>

          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            {run.events.length === 0 ? (
              <EmptyState
                size='sm'
                icon='IconAgentsFilled'
                title='Nothing recorded yet'
                description='Every step of this run appears here as it happens.'
              />
            ) : (
              <ul className='flex flex-col divide-y divide-bg-3'>
                {run.events.map((event) => (
                  <EventItem key={event.id} event={event} slug={slug} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <ScrollFade targetRef={asideRef} />
        <div
          ref={asideRef}
          className='-m-1 flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto p-1 lg:w-[calc(22rem+0.5rem)] lg:shrink-0 [&>*]:shrink-0'
        >
          <Card>
            <CardHeader divider className='py-3'>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <dl className='flex flex-col'>
              <DetailRow label='Workflow'>
                <Link to={workflowBase} className='truncate underline-offset-2 hover:underline'>
                  {workflow?.name ?? run.workflow}
                </Link>
              </DetailRow>
              <DetailRow label='Subscriber' copy={run.externalId}>
                <Link
                  to={`/${slug}/subscribers/${encodeURIComponent(run.externalId)}`}
                  className='truncate underline-offset-2 hover:underline'
                >
                  {run.externalId}
                </Link>
              </DetailRow>
              <DetailRow label='Status'>
                <RunStatusBadge status={run.status} />
              </DetailRow>
              <DetailRow label='Version' copy={run.versionId}>
                <Truncate>{version === null ? run.versionId : `Version ${version.number}`}</Truncate>
              </DetailRow>
              <DetailRow label='Started'>
                <Time at={run.startedAt} />
              </DetailRow>
              <DetailRow label='Updated'>
                <Time at={run.updatedAt} />
              </DetailRow>
              <DetailRow label='Run id' copy={run.id}>
                <Truncate>{run.id}</Truncate>
              </DetailRow>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function RunSkeleton() {
  return (
    <>
      <Skeleton className='-ml-2 h-8 w-32 shrink-0 rounded-xl' />
      <div className='flex min-h-0 flex-1 flex-col gap-5 lg:flex-row'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-5'>
          <BlockSkeleton className='h-96 w-full rounded-2xl' />
          <BlockSkeleton className='h-64 w-full rounded-2xl' />
        </div>
        <div className='flex min-h-0 min-w-0 flex-col gap-5 lg:w-[calc(22rem+0.5rem)] lg:shrink-0'>
          <BlockSkeleton className='h-80 w-full rounded-2xl' />
        </div>
      </div>
    </>
  );
}

export default function RunRoute({ loaderData, params }: Route.ComponentProps) {
  const { detail } = loaderData;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Deferred resolve={detail}>
        {(data) => (data === undefined ? <RunSkeleton /> : <RunContent data={data} slug={params.slug} />)}
      </Deferred>
    </div>
  );
}
