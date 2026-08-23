import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, createKey, revokeKey } from '@/app/lib/api.server';

export async function keysAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'create': {
        const name = String(form.get('name') ?? '').trim();
        const kind = String(form.get('kind') ?? 'workspace') as 'workspace' | 'tenant' | 'client';
        const tenant = String(form.get('tenant') ?? '').trim();
        if (!name) return { error: 'Give the key a name.' };
        if (kind !== 'workspace' && !tenant) return { error: 'Pick a tenant.' };
        let scopes: string[] = [];
        if (kind !== 'client') {
          try {
            scopes = JSON.parse(String(form.get('scopes') ?? '[]'));
          } catch {
            scopes = [];
          }
          if (scopes.length === 0) return { error: 'Pick at least one permission.' };
        }
        const created = await createKey(ctx, token, slug, {
          name,
          kind,
          ...(kind !== 'workspace' ? { tenant } : {}),
          ...(kind !== 'client' ? { scopes } : {}),
        });
        return { ok: true, secret: created.secret, kind };
      }
      case 'revoke': {
        await revokeKey(ctx, token, slug, String(form.get('id')));
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
