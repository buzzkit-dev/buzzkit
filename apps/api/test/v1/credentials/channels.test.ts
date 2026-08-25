import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { connectChannel, disconnectChannel } from '../../utils/db';
import { fakeToken, uploadSandboxApns } from '../../utils/fixtures';
import { createClientKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Failure = { status: number; body: { error?: { code: string; param?: string | null } } };

function expectNotConnected(response: Failure, param: string) {
  expect(response.status).toBe(400);
  expect(response.body.error?.code).toBe('channel_not_connected');
  expect(response.body.error?.param).toBe(param);
}

async function registerPush(headers: Record<string, string>, externalId: string) {
  return api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
  });
}

describe('channels must be connected before anything uses them', () => {
  it('a tenant with no credentials cannot create topics, register subscriptions or send', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;

    expectNotConnected(
      await api('/v1/topics', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ slug: `deals-${uniq()}`, name: 'Deals' }),
      }),
      'channels'
    );
    expectNotConnected(
      await api('/v1/topics', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ slug: `deals-${uniq()}`, name: 'Deals', channels: ['push'] }),
      }),
      'channels'
    );
    expectNotConnected(await registerPush(keyBearer, externalId), 'channel');
    expectNotConnected(
      await api(`/v1/subscribers/${externalId}`, {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ email: `${externalId}@acme.com` }),
      }),
      'email'
    );
    expectNotConnected(
      await api('/v1/messages', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ to: externalId, title: 'Hello' }),
      }),
      'channel'
    );

    const plain = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: '{}',
    });
    expect(plain.status).toBe(201);
  });

  it('a new topic defaults to the connected channels only', async () => {
    const { keyBearer, tenantId } = await setupWorkspace({ bare: true });
    await connectChannel(tenantId, 'email');

    const slug = `digest-${uniq()}`;
    const created = await api<{ channels: string[] }>('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Digest' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.channels).toEqual(['email']);

    expectNotConnected(
      await api('/v1/topics', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ slug: `both-${uniq()}`, name: 'Both', channels: ['email', 'push'] }),
      }),
      'channels'
    );
    expectNotConnected(
      await api(`/v1/topics/${slug}`, {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ channels: ['push'] }),
      }),
      'channels'
    );
    const widened = await api<{ channels: string[] }>(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ channels: ['email'], description: 'Weekly' }),
    });
    expect(widened.status).toBe(200);
  });

  it('the client routes enforce it for the app too', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
    const externalId = `user_${uniq()}`;

    const identified = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    expect(identified.status).toBe(201);

    expectNotConnected(
      await api('/v1/client/subscriptions', {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
      }),
      'channel'
    );
    expectNotConnected(
      await api('/v1/client/identify', {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({ externalId, email: `${externalId}@acme.com` }),
      }),
      'email'
    );

    await uploadSandboxApns(keyBearer);
    const registered = await api('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  });

  it('removing a credential keeps topics and subscriptions but stops sends until it is back', async () => {
    const { keyBearer, tenantId } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const slug = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Deals', channels: ['push'] }),
    });
    const registered = await registerPush(keyBearer, externalId);
    expect(registered.status).toBe(201);

    await disconnectChannel(tenantId, 'push');

    const topic = await api<{ channels: string[] }>(`/v1/topics/${slug}`, { headers: keyBearer });
    expect(topic.status).toBe(200);
    expect(topic.body.data?.channels).toEqual(['push']);
    const subscriber = await api<{ subscriptions: Array<{ channel: string }> }>(
      `/v1/subscribers/${externalId}`,
      {
        headers: keyBearer,
      }
    );
    expect(subscriber.body.data?.subscriptions.map((entry) => entry.channel)).toEqual(['push']);

    expectNotConnected(
      await api('/v1/messages', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ topic: slug, title: 'Hello' }),
      }),
      'channel'
    );
    expectNotConnected(await registerPush(keyBearer, `other_${uniq()}`), 'channel');
    const rename = await api(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Deals and offers' }),
    });
    expect(rename.status).toBe(200);

    await uploadSandboxApns(keyBearer);
    const sent = await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ topic: slug, title: 'Hello' }),
    });
    expect(sent.status).toBe(202);
  });

  it('a credential in one tenant does not unlock another', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer, 'Customer', { bare: true });
    const externalId = `user_${uniq()}`;

    expectNotConnected(
      await registerPush({ ...keyBearer, 'buzzkit-tenant': other.slug }, externalId),
      'channel'
    );
    expect((await registerPush(keyBearer, externalId)).status).toBe(201);
  });
});
