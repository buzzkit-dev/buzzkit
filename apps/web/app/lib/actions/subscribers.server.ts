import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  deleteSubscription,
  updateSubscriberPreferences,
  updateSubscription,
} from '@/app/lib/api.server';

export async function subscriberAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);
  const externalId = String(args.params.externalId);

  try {
    switch (intent) {
      case 'subscription-enabled': {
        await updateSubscription(ctx, token, slug, 'default', String(form.get('id')), {
          enabled: form.get('enabled') === 'true',
        });
        return { ok: true };
      }
      case 'subscription-remove': {
        await deleteSubscription(ctx, token, slug, 'default', String(form.get('id')));
        return { ok: true };
      }
      case 'preference': {
        await updateSubscriberPreferences(ctx, token, slug, 'default', externalId, {
          [String(form.get('topic'))]: { [String(form.get('channel'))]: form.get('optedIn') === 'true' },
        });
        return { ok: true };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}
