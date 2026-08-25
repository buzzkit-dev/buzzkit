import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, createTenant, deleteTenant, updateTenant } from '@/app/lib/api.server';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readFields(form: FormData): { name: string; slug: string } | { error: string } {
  const name = String(form.get('name') ?? '').trim();
  const slug = String(form.get('slug') ?? '')
    .trim()
    .toLowerCase();
  if (!name) return { error: 'Give the tenant a name.' };
  if (name.length > 100) return { error: 'Use at most 100 characters for the name.' };
  if (slug.length < 1 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    return { error: 'Use lowercase letters, numbers and single hyphens for the slug.' };
  }
  return { name, slug };
}

export async function tenantsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const workspaceSlug = String(args.params.slug);
  const tenantSlug = String(form.get('tenant') ?? '');

  try {
    switch (intent) {
      case 'create': {
        const fields = readFields(form);
        if ('error' in fields) return fields;
        await createTenant(ctx, token, workspaceSlug, fields);
        return { ok: true };
      }
      case 'update': {
        if (!tenantSlug) return { error: 'Pick a tenant.' };
        const fields = readFields(form);
        if ('error' in fields) return fields;
        await updateTenant(ctx, token, workspaceSlug, tenantSlug, {
          name: fields.name,
          ...(fields.slug !== tenantSlug ? { slug: fields.slug } : {}),
        });
        return { ok: true };
      }
      case 'delete': {
        if (!tenantSlug) return { error: 'Pick a tenant.' };
        await deleteTenant(ctx, token, workspaceSlug, tenantSlug);
        return { ok: true };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === 'conflict') return { error: 'This slug is already taken. Try another.' };
    if (error.code === 'bad_request' && intent === 'delete')
      return { error: 'The default tenant cannot be deleted.' };
    return { error: error.message };
  }
}
