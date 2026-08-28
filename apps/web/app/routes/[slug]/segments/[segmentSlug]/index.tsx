import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { SegmentEditor } from '@/app/components/segments/editor';
import { segmentsAction } from '@/app/lib/actions/segments.server';
import { getSegment, listEventNames, listTopics, previewSegment } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.segment.name} · BuzzKit` : 'Segment · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const segment = await getSegment(ctx, token, params.slug, tenant, params.segmentSlug);
  const [preview, names, topics] = await Promise.all([
    segment.version ? previewSegment(ctx, token, params.slug, tenant, segment.version.expression) : null,
    listEventNames(ctx, token, params.slug, tenant),
    listTopics(ctx, token, params.slug, tenant, { limit: 100 }),
  ]);
  return { segment, preview, eventNames: names.map((entry) => entry.name), topics: topics.items };
}

export const action = segmentsAction;

export default function SegmentRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace, connected } = useOutletContext<WorkspaceOutletContext>();
  const { segment, preview, eventNames, topics } = loaderData;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <SegmentEditor
      key={`${segment.slug}:${segment.version?.id ?? ''}:${segment.updatedAt}`}
      segment={segment}
      preview={preview}
      eventNames={eventNames}
      topics={topics}
      channels={connected}
      workspaceSlug={params.slug}
      canManage={canManage}
    />
  );
}
