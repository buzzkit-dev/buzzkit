import { api } from './api';
import { fakeToken } from './fixtures';

type Headers = Record<string, string>;

export type TimelineItem = { name: string; data: Record<string, unknown> };

export async function subscribe(headers: Headers, externalId: string) {
  const { status, body } = await api('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalId,
      channel: 'push',
      platform: 'ios',
      environment: 'sandbox',
      token: fakeToken('w'),
    }),
  });
  if (status !== 201 && status !== 200)
    throw new Error(`subscribe failed: ${status} ${JSON.stringify(body)}`);
}

export async function track(
  headers: Headers,
  externalId: string,
  name: string,
  data: Record<string, unknown> = {},
  id?: string
) {
  const { status, body } = await api('/v1/events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ events: [{ externalId, name, data, ...(id ? { id } : {}) }] }),
  });
  if (status !== 202) throw new Error(`track failed: ${status} ${JSON.stringify(body)}`);
}

export async function timeline(headers: Headers, externalId: string) {
  const { body } = await api<{ items: TimelineItem[] }>(`/v1/subscribers/${externalId}/timeline?limit=100`, {
    headers,
  });
  return body.data?.items ?? [];
}

export async function runEvents(headers: Headers, externalId: string) {
  return (await timeline(headers, externalId)).filter((item) => item.name.startsWith('$run.')).reverse();
}

export async function publish(headers: Headers, slug: string, spec: Record<string, unknown>) {
  const created = await api<{ id: string }>('/v1/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: slug, spec }),
  });
  if (created.status !== 201)
    throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const published = await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers });
  if (published.status !== 200) throw new Error(`publish failed: ${published.status}`);
  return created.body.data!.id;
}
