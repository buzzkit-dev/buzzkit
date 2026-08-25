import { Avatar } from '@buzzkit/ui/components/avatar';
import { Card } from '@buzzkit/ui/components/card';
import { CodeBlock } from '@buzzkit/ui/components/code-block';
import { EmptyState } from '@buzzkit/ui/components/empty-state';
import { Flag } from '@buzzkit/ui/components/flag';
import { Input } from '@buzzkit/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@buzzkit/ui/components/table';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useNavigation, useOutletContext } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { ChannelBadge, PlatformBadge, VerifiedBadge } from '@/app/components/badges';
import { Time, TimeAgo } from '@/app/hooks/use-time-ago';
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

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function meta() {
  return [{ title: 'Subscribers · BuzzKit' }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const ctx = { request, env };
  const query = requestUrl(request).searchParams.get('q')?.trim() ?? '';

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
      return { query, items: [item], pagination: null, missing: false, clientKey: null };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { query, items: [], pagination: null, missing: true, clientKey: null };
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

  return { query, ...paginate(request, page), missing: false, clientKey };
}

function attribute(subscriber: Subscriber, key: string): string | null {
  const value = (subscriber.attributes as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
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

function SubscriberRow({ subscriber, base }: { subscriber: Subscriber; base: string }) {
  const name = attribute(subscriber, 'name');
  const email = attribute(subscriber, 'email');
  const country = attribute(subscriber, '$country');
  const secondary = name && email ? email : (email ?? name);

  return (
    <TableRow>
      <TableCell className='py-2'>
        <Link
          to={`${base}/${encodeURIComponent(subscriber.externalId)}`}
          className='flex items-center gap-2.5 outline-none focus-visible:underline'
        >
          <Avatar name={subscriber.externalId} label={name ?? subscriber.externalId} />
          <span className='flex min-w-0 flex-col'>
            <span className='flex items-center gap-1.5 font-medium text-fg-4'>
              {name ?? subscriber.externalId}
              <VerifiedBadge verified={subscriber.verified} />
            </span>
            <span className='text-fg-2 text-xs'>{name ? subscriber.externalId : secondary}</span>
          </span>
        </Link>
      </TableCell>
      <TableCell>
        {country ? (
          <span className='flex items-center gap-1.5'>
            <Flag code={country} />
            {countryName(country)}
          </span>
        ) : (
          <span className='text-fg-2'>Unknown</span>
        )}
      </TableCell>
      <TableCell>
        {subscriber.channels.length > 0 ? (
          <span className='flex items-center gap-1'>
            {subscriber.platforms.includes('ios') && <PlatformBadge platform='ios' />}
            {subscriber.platforms.includes('android') && <PlatformBadge platform='android' />}
            {subscriber.channels.includes('email') && <ChannelBadge channel='email' />}
          </span>
        ) : (
          <span className='text-fg-2'>None</span>
        )}
      </TableCell>
      <TableCell>
        <Time at={subscriber.createdAt} />
      </TableCell>
      <TableCell>
        {subscriber.lastSeenAt ? (
          <TimeAgo at={subscriber.lastSeenAt} />
        ) : (
          <span className='text-fg-2'>Never</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function LookupField({ query, base }: { query: string; base: string }) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [value, setValue] = useState(query);
  const trimmed = value.trim();
  const settled = trimmed === query;

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => {
      navigate(trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base, { replace: true });
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
      loading={!settled || navigation.state === 'loading'}
      className='w-64'
    />
  );
}

export default function SubscribersRoute({ loaderData, params }: Route.ComponentProps) {
  const { apiUrl } = useOutletContext<WorkspaceOutletContext>();
  const { query, items, pagination, missing, clientKey } = loaderData;
  const base = `/${params.slug}/subscribers`;
  const fresh = !query && items.length === 0;

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-5'>
      <header className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex flex-col gap-0.5'>
          <h1 className='text-balance font-medium text-2xl text-fg-4 leading-tighter tracking-tight'>
            Subscribers
          </h1>
          <p className='text-pretty text-base text-fg-2 leading-tighter'>
            Manage the subscribers of this workspace.
          </p>
        </div>
        {!fresh && <LookupField query={query} base={base} />}
      </header>

      {fresh ? (
        <Card className='min-h-0 shrink'>
          <EmptyState
            icon='IconTeamFilled'
            title='No subscribers yet'
            description='Identify a user and they appear here with their devices and preferences.'
            className='py-10'
          >
            <CodeBlock className='w-full max-w-xl text-left' code={identifySnippet(apiUrl, clientKey)} />
          </EmptyState>
        </Card>
      ) : missing ? (
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
            <TableHeader>
              <TableRow>
                <TableHead>Subscriber</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((subscriber) => (
                <SubscriberRow key={subscriber.id} subscriber={subscriber} base={base} />
              ))}
            </TableBody>
            {pagination && <TablePagination {...(pagination as Pagination)} />}
          </Table>
        </Card>
      )}
    </div>
  );
}
