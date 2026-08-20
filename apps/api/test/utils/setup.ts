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

/** A user with a workspace and a full-access workspace API key. */
export async function setupWorkspace() {
  const owner = await signUpUser('Owner');
  const workspace = await createWorkspace(owner.token);
  const key = await createKey(owner.token, workspace.slug);

  return { owner, workspace, key, keyBearer: { Authorization: `Bearer ${key.secret}` } };
}
