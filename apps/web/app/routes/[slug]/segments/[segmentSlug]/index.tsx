import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { BlockSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { SegmentEditor } from '@/app/components/segments/editor';
import { segmentsAction } from '@/app/lib/actions/segments.server';
import { getSegment, listEventNames, listTopics, previewSegment } from '@/app/lib/api.server';
import type { Channel } from '@/app/lib/channels';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Segment · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  return {
    detail: (async () => {
      const segment = await getSegment(ctx, token, params.slug, tenant, params.segmentSlug);
      const [preview, names, topics] = await Promise.all([
        segment.version ? previewSegment(ctx, token, params.slug, tenant, segment.version.expression) : null,
        listEventNames(ctx, token, params.slug, tenant),
        listTopics(ctx, token, params.slug, tenant, { limit: 100 }),
      ]);
      return { segment, preview, eventNames: names.map((entry) => entry.name), topics: topics.items };
    })(),
  };
}

export const action = segmentsAction;

function SegmentContent({
  data,
  slug,
  channels,
  canManage,
}: {
  data: Awaited<Route.ComponentProps['loaderData']['detail']>;
  slug: string;
  channels: Channel[];
  canManage: boolean;
}) {
  const { segment, preview, eventNames, topics } = data;

  return (
    <SegmentEditor
      key={`${segment.slug}:${segment.version?.id ?? ''}:${segment.updatedAt}`}
      segment={segment}
      preview={preview}
      eventNames={eventNames}
      topics={topics}
      channels={channels}
      workspaceSlug={slug}
      canManage={canManage}
    />
  );
}

function SegmentSkeleton() {
  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Skeleton className='-ml-2 h-8 w-28 shrink-0 rounded-xl' />
      <div className='flex shrink-0 flex-col gap-2'>
        <Skeleton className='h-7 w-56' />
        <Skeleton className='h-4 w-80' />
      </div>
      <BlockSkeleton className='h-56 w-full rounded-2xl' />
      <BlockSkeleton className='h-96 w-full rounded-2xl' />
    </div>
  );
}

export default function SegmentRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace, connected } = useOutletContext<WorkspaceOutletContext>();
  const { detail } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <Deferred resolve={detail}>
      {(data) =>
        data === undefined ? (
          <SegmentSkeleton />
        ) : (
          <SegmentContent data={data} slug={params.slug} channels={connected} canManage={canManage} />
        )
      }
    </Deferred>
  );
}
