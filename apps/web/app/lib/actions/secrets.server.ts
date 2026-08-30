import { SECRET_NAME_PATTERN } from '@buzzkit/schema/workflows';
import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, deleteSecret, putSecret } from '@/app/lib/api.server';

export async function secretsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'secret-set': {
        const name = String(form.get('name') ?? '').trim();
        const value = String(form.get('value') ?? '');
        if (!SECRET_NAME_PATTERN.test(name)) {
          return {
            error: 'Name the secret with a lowercase letter followed by letters, digits and underscores.',
          };
        }
        if (!value) return { error: 'Give the secret a value.' };
        const saved = await putSecret(ctx, token, slug, tenant, name, value);
        return { ok: true, name: saved.name, version: saved.version };
      }
      case 'secret-remove': {
        const name = String(form.get('name') ?? '').trim();
        if (!name) return { error: 'Pick a secret.' };
        await deleteSecret(ctx, token, slug, tenant, name);
        return { ok: true, removed: name };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Failed to save secret', description: error.message };
    throw error;
  }
}
