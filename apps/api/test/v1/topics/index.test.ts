import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function createTopic(headers: Record<string, string>, input: Partial<Record<string, unknown>> = {}) {
  return api<{ id: string; slug: string; defaultOptedIn: boolean }>('/v1/topics', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug: `topic-${uniq()}`, name: 'Topic', ...input }),
  });
}

describe('/v1/topics', () => {
  it('creates, lists, updates, and deletes topics', async () => {
    const { keyBearer } = await setupWorkspace();

    const created = await createTopic(keyBearer, {
      slug: `gym-${uniq()}`,
      name: 'Gym reminders',
      description: 'Nudges to hit the gym',
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^tpc_/);
    expect(created.body.data?.defaultOptedIn).toBe(true);
    const slug = created.body.data?.slug;

    const list = await api<Array<{ slug: string }>>('/v1/topics', { headers: keyBearer });
    expect(list.body.data?.some((topic) => topic.slug === slug)).toBe(true);

    const patched = await api<{ name: string; defaultOptedIn: boolean }>(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Gym nudges', defaultOptedIn: false }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.name).toBe('Gym nudges');
    expect(patched.body.data?.defaultOptedIn).toBe(false);

    const deleted = await api(`/v1/topics/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/topics/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('rejects duplicate slugs within a tenant but allows them across tenants', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const slug = `dup-${uniq()}`;

    const first = await createTopic(keyBearer, { slug });
    expect(first.status).toBe(201);

    const duplicate = await createTopic(keyBearer, { slug });
    expect(duplicate.status).toBe(409);

    const otherTenant = await createTopic({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, { slug });
    expect(otherTenant.status).toBe(201);
  });
});

type PreferenceRow = {
  topic: string;
  channels: Record<string, { optedIn: boolean; isDefault: boolean }>;
};

async function getPrefs(headers: Record<string, string>, externalId: string) {
  const { body } = await api<PreferenceRow[]>(`/v1/subscribers/${externalId}/preferences`, { headers });
  return new Map(body.data?.map((p) => [p.topic, p]));
}

describe('preferences', () => {
  it('defaults come from the topic; explicit choices override and persist', async () => {
    const { keyBearer } = await setupWorkspace();
    const gym = `gym-${uniq()}`;
    const marketing = `marketing-${uniq()}`;
    await createTopic(keyBearer, { slug: gym, name: 'Gym reminders' });
    await createTopic(keyBearer, { slug: marketing, name: 'Marketing', defaultOptedIn: false });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const defaults = await getPrefs(keyBearer, externalId);
    expect(defaults.get(gym)?.channels.push).toMatchObject({ optedIn: true, isDefault: true });
    expect(defaults.get(gym)?.channels.email).toMatchObject({ optedIn: true, isDefault: true });
    expect(defaults.get(marketing)?.channels.push).toMatchObject({ optedIn: false, isDefault: true });

    const patched = await api<PreferenceRow[]>(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [gym]: false, [marketing]: true } }),
    });
    const patchedBy = new Map(patched.body.data?.map((p) => [p.topic, p]));
    expect(patchedBy.get(gym)?.channels.push).toMatchObject({ optedIn: false, isDefault: false });
    expect(patchedBy.get(gym)?.channels.email).toMatchObject({ optedIn: false, isDefault: false });
    expect(patchedBy.get(marketing)?.channels.push).toMatchObject({ optedIn: true, isDefault: false });

    await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [gym]: true } }),
    });
    const again = await getPrefs(keyBearer, externalId);
    expect(again.get(gym)?.channels.push.optedIn).toBe(true);
    expect(again.get(marketing)?.channels.push.optedIn).toBe(true);
  });

  it('supports per-channel choices — email off, push stays on', async () => {
    const { keyBearer } = await setupWorkspace();
    const running = `running-${uniq()}`;
    await createTopic(keyBearer, { slug: running, name: 'Running reminders' });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [running]: { email: false } } }),
    });

    const prefs = await getPrefs(keyBearer, externalId);
    expect(prefs.get(running)?.channels.email).toMatchObject({ optedIn: false, isDefault: false });
    expect(prefs.get(running)?.channels.push).toMatchObject({ optedIn: true, isDefault: true });
  });

  it('topics can default differently per channel', async () => {
    const { keyBearer } = await setupWorkspace();
    const digest = `digest-${uniq()}`;
    await createTopic(keyBearer, {
      slug: digest,
      name: 'Weekly digest',
      defaultOptedIn: true,
      channelDefaults: { push: false },
    });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const prefs = await getPrefs(keyBearer, externalId);
    expect(prefs.get(digest)?.channels.push).toMatchObject({ optedIn: false, isDefault: true });
    expect(prefs.get(digest)?.channels.email).toMatchObject({ optedIn: true, isDefault: true });
  });

  it('rejects unknown channels', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `t-${uniq()}`;
    await createTopic(keyBearer, { slug });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const { status } = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: { fax: true } } }),
    });
    expect(status).toBe(400);
  });

  it('rejects unknown topics and empty patches', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const unknown = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { 'no-such-topic': true } }),
    });
    expect(unknown.status).toBe(404);

    const empty = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: {} }),
    });
    expect(empty.status).toBe(400);
  });

  it('a topic from another tenant is invisible in preferences', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const foreignSlug = `foreign-${uniq()}`;
    await createTopic({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, { slug: foreignSlug });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const preferences = await api<Array<{ topic: string }>>(`/v1/subscribers/${externalId}/preferences`, {
      headers: keyBearer,
    });
    expect(preferences.body.data?.some((p) => p.topic === foreignSlug)).toBe(false);

    const patch = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [foreignSlug]: true } }),
    });
    expect(patch.status).toBe(404);
  });
});
