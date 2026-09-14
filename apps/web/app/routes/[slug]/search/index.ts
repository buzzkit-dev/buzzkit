import { cloudflareContext } from '@/app/cloudflare';
import {
  ApiError,
  getMessage,
  getRun,
  getSource,
  getWebhook,
  listEventNames,
  listEveryWorkspace,
  listMessages,
  listSegments,
  listSources,
  listSubscribers,
  listWebhooks,
  listWorkflows,
  type RequestContext,
} from '@/app/lib/api.server';
import { parseJump, SEARCH_MIN_LENGTH, type SearchResult } from '@/app/lib/command';
import { requireSession, resolveTenant } from '@/app/lib/session.server';
import { requestUrl } from '@/app/lib/utils/request';
import type { Route } from './+types/index';

const PER_KIND = 5;

type Scope = { ctx: RequestContext; token: string; slug: string; tenant: string; all: boolean };

async function tolerate<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ApiError) return fallback;
    throw error;
  }
}

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

async function verifyJump(scope: Scope, query: string): Promise<SearchResult[]> {
  const jump = parseJump(query);
  if (!jump) return [];
  const { ctx, token, slug, tenant } = scope;
  const lookups: Record<string, () => Promise<unknown>> = {
    Message: () => getMessage(ctx, token, slug, tenant, jump.label),
    Run: () => getRun(ctx, token, slug, tenant, jump.label),
    Webhook: () => getWebhook(ctx, token, slug, jump.label),
    Source: () => getSource(ctx, token, slug, tenant, jump.label),
  };
  const lookup = lookups[jump.hint];
  if (!lookup) return [];
  const found = await tolerate(
    lookup().then(() => true),
    false
  );
  if (!found) return [];
  const kind = jump.hint.toLowerCase() as SearchResult['kind'];
  return [{ kind, path: jump.path, label: jump.label, hint: jump.hint, icon: jump.icon }];
}

async function searchWorkspaces(scope: Scope, query: string): Promise<SearchResult[]> {
  const { ctx, token, slug } = scope;
  if (!scope.all) return [];
  const page = await tolerate(listEveryWorkspace(ctx, token, { q: query, limit: PER_KIND + 1 }), null);
  return (page?.items ?? [])
    .filter((workspace) => workspace.slug !== slug)
    .slice(0, PER_KIND)
    .map((workspace) => ({
      kind: 'workspace' as const,
      path: `/${workspace.slug}`,
      label: workspace.name,
      hint: workspace.role ? workspace.slug : `${workspace.slug} · support`,
      icon: 'IconHomeRoundDoorFilled' as const,
    }));
}

async function searchEverything(scope: Scope, query: string): Promise<SearchResult[]> {
  const { ctx, token, slug, tenant } = scope;
  const [workspaces, subscribers, eventNames, workflows, segments, messages, webhooks, sources] =
    await Promise.all([
      searchWorkspaces(scope, query),
      tolerate(
        listSubscribers(ctx, token, slug, tenant, { search: query, limit: PER_KIND }).then(
          (page) => page.items
        ),
        []
      ),
      tolerate(listEventNames(ctx, token, slug, tenant), []),
      tolerate(listWorkflows(ctx, token, slug, tenant), []),
      tolerate(listSegments(ctx, token, slug, tenant), []),
      tolerate(
        listMessages(ctx, token, slug, tenant, { q: query, limit: PER_KIND }).then((page) => page.items),
        []
      ),
      tolerate(listWebhooks(ctx, token, slug), []),
      tolerate(listSources(ctx, token, slug, tenant), []),
    ]);

  const results: SearchResult[] = [...workspaces];
  for (const subscriber of subscribers.slice(0, PER_KIND)) {
    const attributes = (subscriber.attributes ?? {}) as Record<string, unknown>;
    const name = typeof attributes.name === 'string' ? attributes.name : null;
    const email = typeof attributes.email === 'string' ? attributes.email : null;
    results.push({
      kind: 'subscriber',
      path: `/subscribers/${encodeURIComponent(subscriber.externalId)}`,
      label: subscriber.externalId,
      hint: name ?? email ?? 'Subscriber',
      icon: 'IconTeamFilled',
    });
  }
  for (const event of eventNames.filter((entry) => matches(query, entry.name)).slice(0, PER_KIND)) {
    results.push({
      kind: 'event',
      path: `/events/${encodeURIComponent(event.name)}`,
      label: event.name,
      hint: 'Event',
      icon: 'IconZapFilled',
    });
  }
  for (const workflow of workflows
    .filter((entry) => matches(query, entry.name, entry.slug, entry.description))
    .slice(0, PER_KIND)) {
    results.push({
      kind: 'workflow',
      path: `/workflows/${workflow.slug}`,
      label: workflow.name,
      hint: workflow.slug,
      icon: 'IconAgentsFilled',
    });
  }
  for (const segment of segments
    .filter((entry) => matches(query, entry.name, entry.slug, entry.description))
    .slice(0, PER_KIND)) {
    results.push({
      kind: 'segment',
      path: `/segments/${segment.slug}`,
      label: segment.name,
      hint: segment.slug,
      icon: 'IconTargetFilled',
    });
  }
  for (const message of messages.slice(0, PER_KIND)) {
    const payload = (message.payload ?? {}) as { title?: string; body?: string };
    results.push({
      kind: 'message',
      path: `/messages/${message.id}`,
      label: payload.title ?? 'Untitled',
      hint: message.id,
      icon: 'IconPaperPlaneTopRightFilled',
    });
  }
  for (const webhook of webhooks
    .filter((entry) => matches(query, entry.url, entry.description, entry.id))
    .slice(0, PER_KIND)) {
    results.push({
      kind: 'webhook',
      path: `/webhooks/${webhook.id}`,
      label: webhook.url,
      hint: webhook.description ?? webhook.id,
      icon: 'IconWebhooksFilled',
    });
  }
  for (const source of sources.filter((entry) => matches(query, entry.name, entry.id)).slice(0, PER_KIND)) {
    results.push({
      kind: 'source',
      path: `/sources/${source.id}`,
      label: source.name,
      hint: source.id,
      icon: 'IconMailboxFilled',
    });
  }
  return results;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const tenant = await resolveTenant(request, params.slug);
  const search = requestUrl(request).searchParams;
  const q = search.get('q')?.trim() ?? '';
  if (q.length < SEARCH_MIN_LENGTH) return { q, results: [] as SearchResult[] };

  const scope: Scope = {
    ctx: { request, env },
    token,
    slug: params.slug,
    tenant,
    all: search.get('all') === 'true',
  };
  const jumped = await verifyJump(scope, q);
  if (jumped.length > 0) return { q, results: jumped };

  return { q, results: await searchEverything(scope, q.toLowerCase()) };
}
