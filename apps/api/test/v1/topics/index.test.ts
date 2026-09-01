import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function createTopic(headers: Record<string, string>, input: Partial<Record<string, unknown>> = {}) {
  return api<{ id: string; slug: string; channels: string[]; defaultOptedIn: boolean }>('/v1/topics', {
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

    const list = await api<{ items: Array<{ slug: string }> }>('/v1/topics', { headers: keyBearer });
    expect(list.body.data?.items?.some((topic) => topic.slug === slug)).toBe(true);

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

  it('renames slugs safely and validates input', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `gym-${uniq()}`;
    const taken = `taken-${uniq()}`;
    await createTopic(keyBearer, { slug });
    await createTopic(keyBearer, { slug: taken });

    const conflict = await api(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ slug: taken }),
    });
    expect(conflict.status).toBe(409);

    const empty = await api(`/v1/topics/${slug}`, { method: 'PATCH', headers: keyBearer, body: '{}' });
    expect(empty.status).toBe(200);

    const newSlug = `gym-renamed-${uniq()}`;
    const renamed = await api(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ slug: newSlug }),
    });
    expect(renamed.status).toBe(200);
    expect((await api(`/v1/topics/${slug}`, { headers: keyBearer })).status).toBe(404);
    expect((await api(`/v1/topics/${newSlug}`, { headers: keyBearer })).status).toBe(200);

    for (const body of [
      { slug: 'Bad Slug', name: 'x' },
      { slug: `ok-${uniq()}`, name: '' },
      { slug: `ok-${uniq()}`, name: 'x', channelDefaults: { fax: true } },
      { slug: `ok-${uniq()}`, name: 'x', channelDefaults: { push: 'yes' } },
      { slug: `ok-${uniq()}`, name: 'x', description: 'd'.repeat(501) },
    ]) {
      const { status } = await createTopic(keyBearer, body);
      expect(status, JSON.stringify(body)).toBe(400);
    }
  });

  it('deleting a topic removes it from every preference list and is audited', async () => {
    const { keyBearer, ownerBearer, workspace } = await setupWorkspace();
    const slug = `gone-${uniq()}`;
    await createTopic(keyBearer, { slug });
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: false } }),
    });

    await api(`/v1/topics/${slug}`, { method: 'DELETE', headers: keyBearer });

    const prefs = await api<{ items: Array<{ slug: string }> }>(`/v1/subscribers/${externalId}/preferences`, {
      headers: keyBearer,
    });
    expect(prefs.body.data?.items?.some((p) => p.slug === slug)).toBe(false);

    const events = await api<{ items: Array<{ event: string }> }>(`/v1/workspaces/${workspace.slug}/audit`, {
      headers: ownerBearer,
    });
    const names = events.body.data?.items.map((i) => i.event);
    for (const expected of ['topic.created', 'topic.deleted']) {
      expect(names, expected).toContain(expected);
    }
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
  slug: string;
  channels: Record<string, { optedIn: boolean; isDefault: boolean }>;
};

async function getPrefs(headers: Record<string, string>, externalId: string) {
  const { body } = await api<PageData<PreferenceRow>>(`/v1/subscribers/${externalId}/preferences`, {
    headers,
  });
  return new Map((body.data?.items ?? []).map((row) => [row.slug, row]));
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

    const patched = await api<PageData<PreferenceRow>>(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [gym]: false, [marketing]: true } }),
    });
    const patchedBy = new Map((patched.body.data?.items ?? []).map((row) => [row.slug, row]));
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

  it('undecided subscribers follow topic default changes; decided ones keep their choice', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `shift-${uniq()}`;
    await createTopic(keyBearer, { slug, defaultOptedIn: true });

    const undecided = `user_${uniq()}`;
    const decided = `user_${uniq()}`;
    await api(`/v1/subscribers/${undecided}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    await api(`/v1/subscribers/${decided}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    await api(`/v1/subscribers/${decided}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: true } }),
    });

    await api(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ defaultOptedIn: false }),
    });

    const undecidedPrefs = await getPrefs(keyBearer, undecided);
    expect(undecidedPrefs.get(slug)?.channels.push).toMatchObject({ optedIn: false, isDefault: true });

    const decidedPrefs = await getPrefs(keyBearer, decided);
    expect(decidedPrefs.get(slug)?.channels.push).toMatchObject({ optedIn: true, isDefault: false });
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

  it('topics can be limited to some channels, and defaults must stay within them', async () => {
    const { keyBearer } = await setupWorkspace();
    const everything = await createTopic(keyBearer, { slug: `all-${uniq()}` });
    expect(everything.body.data?.channels).toEqual(['push', 'email']);

    const slug = `digest-${uniq()}`;
    const emailOnly = await createTopic(keyBearer, { slug, name: 'Weekly digest', channels: ['email'] });
    expect(emailOnly.status).toBe(201);
    expect(emailOnly.body.data?.channels).toEqual(['email']);

    expect((await createTopic(keyBearer, { channels: [] })).status).toBe(400);
    expect((await createTopic(keyBearer, { channels: ['fax'] })).status).toBe(400);
    const outside = await createTopic(keyBearer, { channels: ['email'], channelDefaults: { push: false } });
    expect(outside.status).toBe(400);
    expect(outside.body.error?.code).toBe('channel_not_offered');

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    const prefs = await getPrefs(keyBearer, externalId);
    expect(Object.keys(prefs.get(slug)?.channels ?? {})).toEqual(['email']);

    const rejected = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: { push: false } } }),
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error?.code).toBe('channel_not_offered');

    const shorthand = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: false } }),
    });
    expect(shorthand.status).toBe(200);
    const after = await getPrefs(keyBearer, externalId);
    expect(after.get(slug)?.channels.email).toMatchObject({ optedIn: false, isDefault: false });
    expect(after.get(slug)?.channels.push).toBeUndefined();

    const widened = await api<{ channels: string[]; channelDefaults: Record<string, boolean> }>(
      `/v1/topics/${slug}`,
      {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ channels: ['push', 'email'], channelDefaults: { push: false } }),
      }
    );
    expect(widened.status).toBe(200);
    expect(widened.body.data?.channels).toEqual(['push', 'email']);
    const narrowed = await api<{ channels: string[]; channelDefaults: Record<string, boolean> }>(
      `/v1/topics/${slug}`,
      { method: 'PATCH', headers: keyBearer, body: JSON.stringify({ channels: ['email'] }) }
    );
    expect(narrowed.body.data?.channels).toEqual(['email']);
    expect(narrowed.body.data?.channelDefaults).toEqual({});
  });

  it('lists newest first with cursors and a total', async () => {
    const { keyBearer } = await setupWorkspace();
    const slugs = ['first', 'second', 'third'].map((name) => `${name}-${uniq()}`);
    for (const slug of slugs) await createTopic(keyBearer, { slug });

    type Page = {
      items: Array<{ id: string; slug: string }>;
      hasMore: boolean;
      nextCursor: string | null;
      total: number;
    };
    const page1 = await api<Page>('/v1/topics?limit=2', { headers: keyBearer });
    expect(page1.status).toBe(200);
    expect(page1.body.data?.items.map((topic) => topic.slug)).toEqual([slugs[2], slugs[1]]);
    expect(page1.body.data?.items.every((topic) => /^tpc_/.test(topic.id))).toBe(true);
    expect(page1.body.data?.hasMore).toBe(true);
    expect(page1.body.data?.total).toBe(3);

    const page2 = await api<Page>(`/v1/topics?limit=2&cursor=${page1.body.data?.nextCursor}`, {
      headers: keyBearer,
    });
    expect(page2.body.data?.items.map((topic) => topic.slug)).toEqual([slugs[0]]);
    expect(page2.body.data?.hasMore).toBe(false);
    expect(page2.body.data?.total).toBe(3);

    await api(`/v1/topics/${slugs[2]}`, { method: 'DELETE', headers: keyBearer });
    const after = await api<Page>('/v1/topics', { headers: keyBearer });
    expect(after.body.data?.total).toBe(2);
    expect(after.body.data?.items.some((topic) => topic.slug === slugs[2])).toBe(false);
  });

  it('a topic from another tenant is invisible in preferences', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const foreignSlug = `foreign-${uniq()}`;
    await createTopic({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, { slug: foreignSlug });

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const preferences = await api<{ items: Array<{ slug: string }> }>(
      `/v1/subscribers/${externalId}/preferences`,
      {
        headers: keyBearer,
      }
    );
    expect(preferences.body.data?.items?.some((p) => p.slug === foreignSlug)).toBe(false);

    const patch = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [foreignSlug]: true } }),
    });
    expect(patch.status).toBe(404);
  });
});

describe('cross-tenant isolation', () => {
  it('topic reads, updates, and deletes across tenants are 404 and leave the topic intact', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const slug = `iso-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Iso' }),
    });
    const foreign = { ...keyBearer, 'buzzkit-tenant': other.slug };

    expect((await api(`/v1/topics/${slug}`, { headers: foreign })).status).toBe(404);
    expect(
      (
        await api(`/v1/topics/${slug}`, {
          method: 'PATCH',
          headers: foreign,
          body: JSON.stringify({ name: 'X' }),
        })
      ).status
    ).toBe(404);
    expect((await api(`/v1/topics/${slug}`, { method: 'DELETE', headers: foreign })).status).toBe(404);

    const still = await api<{ name: string }>(`/v1/topics/${slug}`, { headers: keyBearer });
    expect(still.status).toBe(200);
    expect(still.body.data?.name).toBe('Iso');
  });

  it('rejects unknown channel defaults and empty channel maps, accepts a null description', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `val-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Val' }),
    });

    const badChannel = await api(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ channelDefaults: { fax: true } }),
    });
    expect(badChannel.status).toBe(400);

    const nulled = await api<{ description: string | null }>(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ description: null }),
    });
    expect(nulled.status).toBe(200);
    expect(nulled.body.data?.description).toBeNull();

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    const emptyMap = await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [slug]: {} } }),
    });
    expect(emptyMap.status).toBe(400);
  });
});
