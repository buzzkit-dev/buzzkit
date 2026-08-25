import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, type MessageInput, sendMessage } from '@/app/lib/api.server';

function readMessage(form: FormData): { ok: true; input: MessageInput } | { ok: false; error: string } {
  const target = String(form.get('target') ?? 'subscriber');
  const channel = String(form.get('channel') ?? 'push');
  const to = String(form.get('to') ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const topic = String(form.get('topic') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();

  if (channel !== 'push' && channel !== 'email') return { ok: false, error: 'Pick a channel.' };
  if (target === 'topic' && !topic) return { ok: false, error: 'Pick a topic.' };
  if (target === 'subscriber' && to.length === 0)
    return { ok: false, error: 'Enter at least one external id.' };
  if (!title && !body) return { ok: false, error: 'Give the message a title or a body.' };

  return {
    ok: true,
    input: {
      channel,
      ...(target === 'topic' ? { topic } : { to }),
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
    },
  };
}

export async function messagesAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'send': {
        const message = readMessage(form);
        if (!message.ok) return { error: message.error };
        const sent = await sendMessage(ctx, token, slug, tenant, message.input);
        return { ok: true, id: sent.id };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'not_found') return { error: 'No topic with that slug exists.' };
      if (error.code === 'channel_not_offered')
        return { error: 'This topic is not offered on that channel.' };
      if (error.code === 'channel_disabled') return { error: 'That channel is disabled for this tenant.' };
      if (error.code === 'channel_unsupported')
        return { error: 'Sending on that channel is not available yet.' };
      if (error.code === 'channel_not_connected')
        return { error: 'Connect a provider for that channel first.' };
      return { error: error.message };
    }
    throw error;
  }
}
