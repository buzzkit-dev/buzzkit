import { useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { CardSkeleton } from '@/app/components/loading/card';
import { Deferred } from '@/app/components/loading/deferred';
import { SegmentEditor } from '@/app/components/segments/editor';
import { segmentsAction } from '@/app/lib/actions/segments.server';
import { listEventNames } from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'New segment · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  return {
    eventNames: listEventNames({ request, env }, token, params.slug, tenant).then((names) =>
      names.map((entry) => entry.name)
    ),
  };
}

export const action = segmentsAction;

export default function NewSegmentRoute({ loaderData, params }: Route.ComponentProps) {
  const { workspace, connected } = useOutletContext<WorkspaceOutletContext>();
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';

  return (
    <Deferred resolve={loaderData.eventNames}>
      {(eventNames) =>
        eventNames === undefined ? (
          <CardSkeleton title='New segment' lines={6} />
        ) : (
          <SegmentEditor
            segment={null}
            preview={null}
            eventNames={eventNames}
            topics={[]}
            channels={connected}
            workspaceSlug={params.slug}
            canManage={canManage}
          />
        )
      }
    </Deferred>
  );
}
