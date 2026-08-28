import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, type MessageInput, type RequestContext, sendMessage } from '@/app/lib/api.server';

function readMessage(form: FormData): { ok: true; input: MessageInput } | { ok: false; error: string } {
  const target = String(form.get('target') ?? 'subscriber');
  const channel = String(form.get('channel') ?? 'push');
  const to = String(form.get('to') ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const topic = String(form.get('topic') ?? '').trim();
  const segment = String(form.get('segment') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();

  if (channel !== 'push' && channel !== 'email') return { ok: false, error: 'Pick a channel.' };
  if (target === 'topic' && !topic) return { ok: false, error: 'Pick a topic.' };
  if (target === 'segment' && !segment) return { ok: false, error: 'Pick a segment.' };
  if (target === 'subscriber' && to.length === 0)
    return { ok: false, error: 'Enter at least one external id.' };
  if (!title && !body) return { ok: false, error: 'Give the message a title or a body.' };

  return {
    ok: true,
    input: {
      channel,
      ...(target === 'topic' ? { topic } : target === 'segment' ? { segment } : { to }),
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
    },
  };
}

export async function sendIntent(
  ctx: RequestContext,
  token: string,
  slug: string,
  tenant: string,
  form: FormData
) {
  const message = readMessage(form);
  if (!message.ok) return { error: message.error };
  try {
    const sent = await sendMessage(ctx, token, slug, tenant, message.input);
    return { ok: true, id: sent.id };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'not_found') return { error: 'Failed to send message', description: error.message };
      if (error.code === 'channel_not_offered')
        return { error: 'Failed to send message', description: 'This topic is not offered on that channel.' };
      if (error.code === 'channel_disabled')
        return { error: 'Failed to send message', description: 'That channel is disabled for this tenant.' };
      if (error.code === 'channel_unsupported')
        return {
          error: 'Failed to send message',
          description: 'Sending on that channel is not available yet.',
        };
      if (error.code === 'channel_not_connected')
        return { error: 'Failed to send message', description: 'Connect a provider for that channel first.' };
      return { error: 'Failed to send message', description: error.message };
    }
    throw error;
  }
}

export async function messagesAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  switch (intent) {
    case 'send':
      return sendIntent(ctx, token, slug, tenant, form);
    default:
      return { error: 'Unknown action.' };
  }
}
