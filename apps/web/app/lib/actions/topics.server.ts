import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, createTopic, deleteTopic, type TopicInput, updateTopic } from '@/app/lib/api.server';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readTopic(form: FormData): { ok: true; input: TopicInput } | { ok: false; error: string } {
  const slug = String(form.get('slug') ?? '')
    .trim()
    .toLowerCase();
  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  if (!name) return { ok: false, error: 'Give the topic a name.' };
  if (!slug || slug.length > 64 || !SLUG_PATTERN.test(slug)) {
    return { ok: false, error: 'Slugs are lowercase letters, numbers and single hyphens.' };
  }
  const channels = String(form.get('channels') ?? '')
    .split(',')
    .filter((channel): channel is 'push' | 'email' => channel === 'push' || channel === 'email');
  if (channels.length === 0) return { ok: false, error: 'Pick at least one channel.' };
  const channelDefaults: Record<string, boolean> = {};
  for (const channel of channels) {
    const choice = form.get(`channel:${channel}`);
    if (choice === 'in') channelDefaults[channel] = true;
    if (choice === 'out') channelDefaults[channel] = false;
  }
  return {
    ok: true,
    input: {
      slug,
      name,
      description: description || undefined,
      channels,
      defaultOptedIn: form.get('defaultOptedIn') === 'true',
      channelDefaults,
    },
  };
}

export async function topicsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'create': {
        const topic = readTopic(form);
        if (!topic.ok) return { error: topic.error };
        await createTopic(ctx, token, slug, 'default', topic.input);
        return { ok: true };
      }
      case 'update': {
        const topic = readTopic(form);
        if (!topic.ok) return { error: topic.error };
        await updateTopic(ctx, token, slug, 'default', String(form.get('topic')), topic.input);
        return { ok: true };
      }
      case 'delete': {
        await deleteTopic(ctx, token, slug, 'default', String(form.get('topic')));
        return { ok: true };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'conflict') return { error: 'A topic with that slug already exists.' };
      if (error.code === 'channel_not_connected')
        return { error: 'Connect a provider for that channel first.' };
      return { error: error.message };
    }
    throw error;
  }
}
