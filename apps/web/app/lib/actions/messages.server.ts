import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  cancelMessage,
  type MessageInput,
  type RequestContext,
  sendMessage,
} from '@/app/lib/api.server';

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
  const when = String(form.get('when') ?? 'now');
  const at = String(form.get('at') ?? '').trim();
  const timezone = String(form.get('timezone') ?? '').trim();

  if (channel !== 'push' && channel !== 'email') return { ok: false, error: 'Pick a channel.' };
  if (target === 'topic' && !topic) return { ok: false, error: 'Pick a topic.' };
  if (target === 'segment' && !segment) return { ok: false, error: 'Pick a segment.' };
  if (target === 'subscriber' && to.length === 0)
    return { ok: false, error: 'Enter at least one external id.' };
  if (!title && !body) return { ok: false, error: 'Give the message a title or a body.' };
  if (when === 'later' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at))
    return { ok: false, error: 'Pick a time to send at.' };

  return {
    ok: true,
    input: {
      channel,
      ...(target === 'topic' ? { topic } : target === 'segment' ? { segment } : { to }),
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(when === 'later' ? { schedule: { at, ...(timezone ? { timezone } : {}) } } : {}),
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
      if (error.code === 'schedule_in_past')
        return { error: 'Failed to schedule message', description: 'That time has already passed.' };
      if (error.code === 'invalid_schedule')
        return { error: 'Failed to schedule message', description: error.message };
      return { error: 'Failed to send message', description: error.message };
    }
    throw error;
  }
}

export async function cancelIntent(
  ctx: RequestContext,
  token: string,
  slug: string,
  tenant: string,
  id: string
) {
  try {
    await cancelMessage(ctx, token, slug, tenant, id);
    return { ok: true, message: 'Message canceled' };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'message_not_cancelable')
        return { error: 'Unable to cancel message', description: 'It has already been sent.' };
      return { error: 'Unable to cancel message', description: error.message };
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

export async function messageAction(args: ActionFunctionArgs) {
  const { token, ctx, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);
  const id = String(args.params.id);

  switch (intent) {
    case 'cancel':
      return cancelIntent(ctx, token, slug, tenant, id);
    default:
      return { error: 'Unknown action.' };
  }
}
