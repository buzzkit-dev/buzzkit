import { Avatar, AvatarFallback } from '@buzzkit/ui/components/avatar';
import { Badge } from '@buzzkit/ui/components/badge';
import { Button } from '@buzzkit/ui/components/button';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Input } from '@buzzkit/ui/components/input';
import { cn } from '@buzzkit/ui/lib/utils';
import { Form, Link, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { TimeAgo } from '@/app/hooks/use-time-ago';
import { ApiError, getSubscriber, listKeys, listSubscribers, type Subscriber } from '@/app/lib/api.server';
import { requireSession } from '@/app/lib/session.server';
import { initials } from '@/app/lib/utils/format';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

const PAGE_SIZE = 50;

export function meta() {
  return [{ title: 'Subscribers · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const ctx = { request, env };
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';

  if (query) {
    try {
      const subscriber = await getSubscriber(ctx, token, params.slug, 'default', query);
      return {
        query,
        items: [subscriber],
        nextCursor: null,
        hasMore: false,
        missing: false,
        clientKey: null,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { query, items: [], nextCursor: null, hasMore: false, missing: true, clientKey: null };
      }
      throw error;
    }
  }

  const page = await listSubscribers(ctx, token, params.slug, 'default', {
    limit: PAGE_SIZE,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  let clientKey: string | null = null;
  if (page.items.length === 0) {
    const keys = await listKeys(ctx, token, params.slug);
    clientKey = keys.find((key) => key.kind === 'client' && !key.revokedAt)?.token ?? null;
  }

  return {
    query,
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    missing: false,
    clientKey,
  };
}

function displayName(subscriber: Subscriber): string | null {
  const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
  const candidate = attributes.name ?? attributes.email;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

function identifySnippet(apiUrl: string, clientKey: string | null) {
  if (clientKey) {
    return [
      `curl -X POST ${apiUrl}/v1/client/identify \\`,
      `  -H 'Authorization: Bearer ${clientKey}' \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{ "externalId": "user_42" }'`,
    ].join('\n');
  }
  return [
    `curl -X PUT ${apiUrl}/v1/subscribers/user_42 \\`,
    "  -H 'Authorization: Bearer bk_ws_your_workspace_key' \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{ "email": "jane@acme.com", "attributes": { "plan": "pro" } }'`,
  ].join('\n');
}

export default function SubscribersRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { query, items, nextCursor, hasMore, missing, clientKey } = loaderData;
  const base = `/${params.slug}/subscribers`;
  const fresh = !query && items.length === 0;

  return (
    <div className='flex w-full flex-col gap-5 pb-8'>
      <header className='flex items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Subscribers
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage the subscribers of this workspace.
          </p>
        </div>
      </header>

      {fresh ? (
        <EmptyState
          icon='IconTeamFilled'
          title='No subscribers yet'
          description='Identify a user and they appear here with their devices and preferences.'
        >
          <CodeBlock className='w-full max-w-xl text-left' code={identifySnippet(apiUrl, clientKey)} />
        </EmptyState>
      ) : (
        <>
          <Form method='get' className='flex gap-2'>
            <Input
              name='q'
              defaultValue={query}
              placeholder='Look up by external id'
              autoComplete='off'
              spellCheck={false}
              className='max-w-sm'
            />
            <Button type='submit' variant='elevated'>
              Look up
            </Button>
            {query && (
              <Button variant='ghost' nativeButton={false} render={<Link to={base} />}>
                Clear
              </Button>
            )}
          </Form>

          {missing ? (
            <p className='text-pretty text-fg-2 text-sm'>
              No subscriber with the id <span className='text-fg-4'>{query}</span> on this tenant.
            </p>
          ) : (
            <Card>
              <ul className='flex flex-col gap-1 px-2.5 py-3'>
                {items.map((subscriber) => {
                  const name = displayName(subscriber);
                  return (
                    <li key={subscriber.id}>
                      <Link
                        to={`${base}/${encodeURIComponent(subscriber.externalId)}`}
                        className={cn(
                          'corner-superellipse/1.125 relative isolate flex items-center gap-3 rounded-2xl px-3.5 py-2.5 outline-none',
                          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
                          'before:transition-[background-color,inset] before:duration-150 before:ease-out active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y)',
                          'hover:before:bg-bg-a2/70 active:before:bg-bg-a2/70 focus-visible:before:bg-bg-a2/70'
                        )}
                      >
                        <Avatar className='size-8'>
                          <AvatarFallback>{initials(name ?? subscriber.externalId)}</AvatarFallback>
                        </Avatar>
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <span className='flex min-w-0 items-center gap-1.5'>
                            <span className='truncate font-medium text-fg-4 text-sm'>
                              {subscriber.externalId}
                            </span>
                            {subscriber.verified && (
                              <Badge variant='green' size='sm'>
                                Verified
                              </Badge>
                            )}
                          </span>
                          {name && <span className='truncate text-fg-2 text-xs'>{name}</span>}
                        </span>
                        <span className='shrink-0 text-fg-2 text-xs tabular-nums'>
                          <TimeAgo at={subscriber.createdAt} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {hasMore && nextCursor && (
            <div className='flex justify-center'>
              <Button
                variant='elevated'
                nativeButton={false}
                render={<Link to={`${base}?cursor=${nextCursor}`} />}
              >
                Older subscribers
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
