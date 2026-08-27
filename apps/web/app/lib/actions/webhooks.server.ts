import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  createWebhook,
  deleteWebhook,
  replayWebhookDelivery,
  rotateWebhookSecret,
  updateWebhook,
} from '@/app/lib/api.server';

export async function webhooksAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'create': {
        const url = String(form.get('url') ?? '').trim();
        const description = String(form.get('description') ?? '').trim();
        const tenant = String(form.get('tenant') ?? '').trim();
        if (!url) return { error: 'Enter the endpoint URL.' };
        let events: string[] = [];
        try {
          events = JSON.parse(String(form.get('events') ?? '[]'));
        } catch {
          events = [];
        }
        const created = await createWebhook(ctx, token, slug, {
          url,
          ...(description ? { description } : {}),
          events,
          ...(tenant ? { tenant } : {}),
        });
        return { ok: true, id: created.id, secret: created.secret };
      }
      case 'enable':
      case 'disable': {
        await updateWebhook(ctx, token, slug, String(form.get('id')), { enabled: intent === 'enable' });
        return { ok: true };
      }
      case 'update': {
        const url = String(form.get('url') ?? '').trim();
        const description = String(form.get('description') ?? '').trim();
        let events: string[] = [];
        try {
          events = JSON.parse(String(form.get('events') ?? '[]'));
        } catch {
          events = [];
        }
        if (!url) return { error: 'Enter the endpoint URL.' };
        const tenant = form.get('tenant');
        await updateWebhook(ctx, token, slug, String(form.get('id')), {
          url,
          description: description || null,
          events,
          ...(tenant === null ? {} : { tenant: String(tenant).trim() || null }),
        });
        return { ok: true };
      }
      case 'rotate': {
        const rotated = await rotateWebhookSecret(ctx, token, slug, String(form.get('id')));
        return { ok: true, secret: rotated.secret };
      }
      case 'delete': {
        await deleteWebhook(ctx, token, slug, String(form.get('id')));
        return { ok: true, deleted: true };
      }
      case 'replay': {
        await replayWebhookDelivery(ctx, token, slug, String(form.get('id')), String(form.get('deliveryId')));
        return { ok: true };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: describeFailure(intent), description: error.message };
    throw error;
  }
}

function describeFailure(intent: string): string {
  switch (intent) {
    case 'create':
      return 'Endpoint not created';
    case 'update':
      return 'Changes not saved';
    case 'rotate':
      return 'Secret not rotated';
    case 'delete':
      return 'Endpoint not deleted';
    case 'replay':
      return 'Replay not possible';
    default:
      return 'Endpoint not updated';
  }
}
