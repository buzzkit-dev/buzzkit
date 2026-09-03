import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Input } from '@buzzkit/ui/components/input';
import { Table, TableBody, TablePagination } from '@buzzkit/ui/components/table';
import { useEffect, useState } from 'react';
import { useNavigate, useNavigation, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { Deferred } from '@/app/components/loading/deferred';
import { TableSkeleton } from '@/app/components/loading/table';
import { SUBSCRIBER_COLUMNS, SubscriberColumns, SubscriberRow } from '@/app/components/subscribers/table';
import {
  ApiError,
  getSubscriber,
  getTenant,
  listKeys,
  listSubscribers,
  type Subscriber,
} from '@/app/lib/api.server';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { type Pagination, paginate, readPage } from '@/app/lib/utils/pagination';
import { requestUrl } from '@/app/lib/utils/request';
import type { WorkspaceOutletContext } from '@/app/routes/[slug]/layout';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Subscribers · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const query = requestUrl(request).searchParams.get('q')?.trim() ?? '';

  return {
    query,
    results: (async () => {
      if (query) {
        try {
          const subscriber = await getSubscriber(ctx, token, params.slug, tenant, query);
          const item: Subscriber = {
            ...subscriber,
            lastSeenAt:
              subscriber.subscriptions
                .map((subscription) => subscription.lastSeenAt)
                .sort()
                .at(-1) ?? null,
            channels: [...new Set(subscriber.subscriptions.map((subscription) => subscription.channel))],
            platforms: [
              ...new Set(
                subscriber.subscriptions.flatMap((subscription) =>
                  subscription.platform ? [subscription.platform] : []
                )
              ),
            ],
          };
          return { items: [item], pagination: null, missing: false, clientKey: null };
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            return { items: [], pagination: null, missing: true, clientKey: null };
          }
          throw error;
        }
      }

      const page = await listSubscribers(ctx, token, params.slug, tenant, readPage(request));
      let clientKey: string | null = null;
      if (page.items.length === 0) {
        const [keys, current] = await Promise.all([
          listKeys(ctx, token, params.slug, { kind: 'client' }),
          getTenant(ctx, token, params.slug, tenant),
        ]);
        clientKey = keys.items.find((key) => !key.revokedAt && key.tenantId === current.id)?.token ?? null;
      }

      return { ...paginate(request, page), missing: false, clientKey };
    })(),
  };
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

function LookupField({ query, base, cold }: { query: string; base: string; cold: boolean }) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [value, setValue] = useState(query);
  const trimmed = value.trim();
  const settled = trimmed === query;

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => {
      void navigate(trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, settled, base, navigate]);

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder='Look up by external id'
      aria-label='Look up by external id'
      autoComplete='off'
      spellCheck={false}
      loading={!settled || navigation.state === 'loading' || cold}
      className='w-64'
    />
  );
}

export default function SubscribersRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { query, results } = loaderData;
  const base = `/${params.slug}/subscribers`;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <Deferred resolve={results}>
        {(data) => {
          const cold = data === undefined;
          const items = data?.items ?? [];
          const pagination = data?.pagination ?? null;
          const clientKey = data?.clientKey ?? null;
          return (
            <>
              <header className='flex shrink-0 items-center justify-between gap-4'>
                <div className='flex flex-col gap-0.5'>
                  <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
                    Subscribers
                  </h1>
                  <p className='text-pretty text-base text-fg-2 leading-tighter'>
                    Manage the subscribers of this workspace.
                  </p>
                </div>
                {(data === undefined || query || items.length > 0) && (
                  <LookupField query={query} base={base} cold={cold} />
                )}
              </header>

              {data === undefined ? (
                <TableSkeleton columns={SUBSCRIBER_COLUMNS} rows={8} fixed={false} />
              ) : !query && items.length === 0 ? (
                <Card className='min-h-0 shrink'>
                  <EmptyState
                    icon='IconTeamFilled'
                    title='No subscribers yet'
                    description='Identify a user and they appear here with their devices and preferences.'
                    className='py-10'
                  >
                    <CodeBlock
                      className='w-full max-w-xl text-left'
                      code={identifySnippet(apiUrl, clientKey)}
                    />
                  </EmptyState>
                </Card>
              ) : data.missing ? (
                <Card>
                  <EmptyState
                    icon='IconTeamFilled'
                    title='No subscriber found'
                    description={`No subscriber on this tenant is identified as “${query}”. Check the id your app sends when it identifies the user.`}
                    className='py-10'
                  />
                </Card>
              ) : (
                <Card className='min-h-0 shrink'>
                  <Table>
                    <SubscriberColumns />
                    <TableBody>
                      {items.map((subscriber) => (
                        <SubscriberRow key={subscriber.id} subscriber={subscriber} base={base} />
                      ))}
                    </TableBody>
                    {pagination && <TablePagination {...(pagination as Pagination)} />}
                  </Table>
                </Card>
              )}
            </>
          );
        }}
      </Deferred>
    </div>
  );
}
