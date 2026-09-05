import { type ImportRow, MAX_IMPORT_ROWS } from '@buzzkit/schema/imports';
import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  deleteSubscription,
  importSubscribers,
  updateSubscriberPreferences,
  updateSubscription,
} from '@/app/lib/api.server';

function parseRows(raw: FormDataEntryValue | null): ImportRow[] | null {
  try {
    const rows = JSON.parse(String(raw ?? '')) as unknown;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_IMPORT_ROWS) return null;
    return rows as ImportRow[];
  } catch {
    return null;
  }
}

export async function subscribersAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'import': {
        const rows = parseRows(form.get('rows'));
        if (!rows) return { error: 'Nothing to import.' };
        const target = String(form.get('tenant') ?? '').trim() || tenant;
        const outcome = await importSubscribers(ctx, token, slug, target, { rows });
        return { ok: true, counts: outcome.counts, failures: outcome.failures };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError)
      return { error: 'Failed to import subscribers', description: error.message };
    throw error;
  }
}

export async function subscriberAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);
  const externalId = String(args.params.externalId);

  try {
    switch (intent) {
      case 'subscription-enabled': {
        await updateSubscription(ctx, token, slug, tenant, String(form.get('id')), {
          enabled: form.get('enabled') === 'true',
        });
        return { ok: true };
      }
      case 'subscription-remove': {
        await deleteSubscription(ctx, token, slug, tenant, String(form.get('id')));
        return { ok: true };
      }
      case 'preference': {
        await updateSubscriberPreferences(ctx, token, slug, tenant, externalId, {
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
