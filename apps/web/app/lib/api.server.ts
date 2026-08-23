import { createVersionedClient, type VersionedApiClient } from '@buzzkit/eden';
import { signedOutRedirect } from '@/app/lib/session.server';

export type RequestContext = { request: Request; env: Env };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, param?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.param = param;
    this.details = details;
  }
}

const UNREACHABLE = 'Unable to reach the API. Check your connection and try again.';

type ApiV1 = VersionedApiClient<'v1'>;

type Scope = { workspace?: string; tenant?: string };

function client(env: Env, token: string, scope: Scope = {}): ApiV1 {
  return createVersionedClient({
    version: 'v1',
    baseUrl: env.API_URL,
    getAuthHeader: () => ({
      authorization: `Bearer ${token}`,
      ...(scope.workspace ? { 'buzzkit-workspace': scope.workspace } : {}),
      ...(scope.tenant ? { 'buzzkit-tenant': scope.tenant } : {}),
    }),
  });
}

type NormalizedError = {
  status: unknown;
  value: { code: string; message: string; param?: string; details?: unknown };
};
type SuccessData<R> = R extends { error: null; data: infer D } ? D : never;

type Clean<T> = T extends { toISOString: unknown }
  ? string
  : T extends Array<infer U>
    ? Clean<U>[]
    : T extends object
      ? { [K in keyof T & string]: Clean<T[K]> }
      : T;

async function unwrap<R extends { data: unknown; error: unknown }>(
  ctx: RequestContext,
  promise: Promise<R>
): Promise<Clean<SuccessData<R>>> {
  let result: R;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, 'unreachable', UNREACHABLE);
  }

  const error = result.error as NormalizedError | null;
  if (error) {
    const status = Number(error.status);
    if (status === 401) {
      throw signedOutRedirect(ctx.request, ctx.env);
    }
    throw new ApiError(status, error.value.code, error.value.message, error.value.param, error.value.details);
  }

  return JSON.parse(JSON.stringify(result.data)) as Clean<SuccessData<R>>;
}

export function listWorkspaces(ctx: RequestContext, token: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces.get()).then((page) => page.items);
}

export function getWorkspace(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).get());
}

export function createWorkspace(ctx: RequestContext, token: string, input: { name: string; slug: string }) {
  return unwrap(ctx, client(ctx.env, token).workspaces.post(input));
}

export function updateWorkspace(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  patch: { name?: string; slug?: string; avatarUrl?: string | null }
) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).patch(patch));
}

export function deleteWorkspace(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).delete());
}

export function getProfile(ctx: RequestContext, token: string) {
  return unwrap(ctx, client(ctx.env, token).profile.get());
}

export function updateProfile(ctx: RequestContext, token: string, patch: { name: string }) {
  return unwrap(ctx, client(ctx.env, token).profile.patch(patch));
}

export function listMembers(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).members.get()).then(
    (page) => page.items
  );
}

export function updateMemberRole(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  id: string,
  role: 'member' | 'admin' | 'owner'
) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).members({ id }).patch({ role }));
}

export function removeMember(ctx: RequestContext, token: string, workspaceSlug: string, id: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).members({ id }).delete());
}

export function listInvites(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).invites.get()).then(
    (page) => page.items
  );
}

export function createInvite(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  body: { email: string; role?: 'member' | 'admin' }
) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).invites.post(body));
}

export function revokeInvite(ctx: RequestContext, token: string, workspaceSlug: string, id: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).invites({ id }).delete());
}

export function resendInvite(ctx: RequestContext, token: string, workspaceSlug: string, id: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).invites({ id }).resend.post());
}

export function getInvitePreview(ctx: RequestContext, inviteToken: string) {
  return unwrap(ctx, client(ctx.env, '').invites({ token: inviteToken }).get());
}

export function acceptInvite(ctx: RequestContext, token: string, inviteToken: string) {
  return unwrap(ctx, client(ctx.env, token).invites({ token: inviteToken }).accept.post());
}

export function listTenants(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token, { workspace: workspaceSlug }).tenants.get({ query: {} })).then(
    (page) => page.items
  );
}

export function getTenant(ctx: RequestContext, token: string, workspaceSlug: string, tenantSlug: string) {
  return unwrap(ctx, client(ctx.env, token, { workspace: workspaceSlug }).tenants({ tenantSlug }).get());
}

export function createTenant(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  body: { name: string; slug: string; metadata?: Record<string, unknown> }
) {
  return unwrap(ctx, client(ctx.env, token, { workspace: workspaceSlug }).tenants.post(body));
}

export type CredentialUpload =
  | {
      provider: 'apns';
      p8: string;
      teamId: string;
      keyId: string;
      bundleId: string;
      environment?: 'production' | 'sandbox';
    }
  | { provider: 'fcm'; serviceAccount: string }
  | { provider: 'resend'; apiKey: string };

export function listCredentials(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug }).credentials.get()
  ).then((page) => page.items);
}

export function createCredential(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string,
  body: CredentialUpload
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug }).credentials.post(body)
  ).then((page) => page.items);
}

export function validateCredential(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string,
  id: string
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug })
      .credentials({ id })
      .validate.post()
  );
}

export function deleteCredential(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string,
  id: string
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug }).credentials({ id }).delete()
  );
}

export function listKeys(ctx: RequestContext, token: string, workspaceSlug: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).keys.get()).then(
    (page) => page.items
  );
}

export function createKey(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  body: {
    name: string;
    kind?: 'workspace' | 'tenant' | 'client';
    tenant?: string;
    scopes?: string[];
    expiresAt?: string;
  }
) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).keys.post(body));
}

export function revokeKey(ctx: RequestContext, token: string, workspaceSlug: string, id: string) {
  return unwrap(ctx, client(ctx.env, token).workspaces({ workspaceSlug }).keys({ id }).delete());
}

export function listSubscribers(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string,
  query: { limit?: number; cursor?: string } = {}
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug }).subscribers.get({ query })
  );
}

export function listMessages(
  ctx: RequestContext,
  token: string,
  workspaceSlug: string,
  tenantSlug: string,
  query: { limit?: number; cursor?: string } = {}
) {
  return unwrap(
    ctx,
    client(ctx.env, token, { workspace: workspaceSlug, tenant: tenantSlug }).messages.get({ query })
  );
}

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type Profile = Awaited<ReturnType<typeof getProfile>>;
export type Member = Awaited<ReturnType<typeof listMembers>>[number];
export type Invite = Awaited<ReturnType<typeof listInvites>>[number];
export type InvitePreview = Awaited<ReturnType<typeof getInvitePreview>>;
export type Tenant = Awaited<ReturnType<typeof listTenants>>[number];
export type Credential = Awaited<ReturnType<typeof listCredentials>>[number];
export type ApiKey = Awaited<ReturnType<typeof listKeys>>[number];
export type CreatedKey = Awaited<ReturnType<typeof createKey>>;
export type Subscriber = Awaited<ReturnType<typeof listSubscribers>>['items'][number];
export type Message = Awaited<ReturnType<typeof listMessages>>['items'][number];
