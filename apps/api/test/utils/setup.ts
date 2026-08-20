import { api, BASE_URL } from './api';

let counter = 0;

/** Unique-enough suffix for emails/slugs so test runs never collide. */
export function uniq(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

export async function signUpUser(name = 'Test User') {
  const email = `test-${uniq()}@buzzkit.dev`;
  const response = await fetch(`${BASE_URL}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'password1234' }),
  });

  const token = response.headers.get('set-auth-token');
  if (!response.ok || !token) {
    throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
  }

  return { email, token, bearer: { Authorization: `Bearer ${token}` } };
}

export async function createWorkspace(token: string, name = 'Test Workspace') {
  const slug = `ws-${uniq()}`;
  const { status, body } = await api<{ id: string; slug: string }>('/v1/workspaces', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, slug }),
  });

  if (status !== 201 || !body.data) {
    throw new Error(`workspace create failed: ${status} ${JSON.stringify(body)}`);
  }

  return body.data;
}

export async function createKey(
  token: string,
  slug: string,
  input: { name?: string; kind?: 'workspace' | 'tenant'; tenant?: string; scopes?: string[] } = {}
) {
  const { status, body } = await api<{ id: string; secret: string; kind: string }>(
    `/v1/workspaces/${slug}/keys`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: input.name ?? 'Test key',
        kind: input.kind,
        tenant: input.tenant,
        scopes: input.scopes ?? ['*'],
      }),
    }
  );

  if (status !== 201 || !body.data) {
    throw new Error(`key create failed: ${status} ${JSON.stringify(body)}`);
  }

  return body.data;
}

export async function createTenant(headers: Record<string, string>, name = 'Customer') {
  const slug = `cust-${uniq()}`;
  const { status, body } = await api<{ id: string; slug: string }>('/v1/tenants', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, slug }),
  });

  if (status !== 201 || !body.data) {
    throw new Error(`tenant create failed: ${status} ${JSON.stringify(body)}`);
  }

  return body.data;
}

/** Signs up a fresh user and joins them to the workspace via the invite flow. */
export async function addMember(
  ownerToken: string,
  workspaceSlug: string,
  role: 'member' | 'admin' | 'owner' = 'member'
) {
  const user = await signUpUser(role);
  const inviteRole = role === 'owner' ? 'admin' : role;

  const invite = await api<{ token: string }>(`/v1/workspaces/${workspaceSlug}/invites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ email: user.email, role: inviteRole }),
  });

  const accepted = await api<{ id: string }>(`/v1/invites/${invite.body.data?.token}/accept`, {
    method: 'POST',
    headers: user.bearer,
  });
  if (accepted.status !== 201 || !accepted.body.data) {
    throw new Error(`invite accept failed: ${accepted.status}`);
  }

  // Owners can't be invited directly — promote after joining
  if (role === 'owner') {
    const promote = await api(`/v1/workspaces/${workspaceSlug}/members/${accepted.body.data.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ role: 'owner' }),
    });
    if (promote.status !== 200) throw new Error(`owner promotion failed: ${promote.status}`);
  }

  return { ...user, memberId: accepted.body.data.id };
}

export async function createClientKey(token: string, slug: string, tenantSlug: string) {
  const { status, body } = await api<{ id: string; secret: string; token: string }>(
    `/v1/workspaces/${slug}/keys`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'App key', kind: 'client', tenant: tenantSlug }),
    }
  );

  if (status !== 201 || !body.data) {
    throw new Error(`client key create failed: ${status} ${JSON.stringify(body)}`);
  }

  return body.data;
}

/** A user with a workspace and a full-access workspace API key. */
export async function setupWorkspace() {
  const owner = await signUpUser('Owner');
  const workspace = await createWorkspace(owner.token);
  const key = await createKey(owner.token, workspace.slug);

  return {
    owner,
    workspace,
    key,
    keyBearer: { Authorization: `Bearer ${key.secret}` },
    ownerBearer: { Authorization: `Bearer ${owner.token}` },
  };
}
