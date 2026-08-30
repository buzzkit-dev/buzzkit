import { MAX_SOURCE_NAME, SOURCE_PROVIDERS, type SourceProvider } from '@buzzkit/schema/sources';
import { type ActionFunctionArgs, redirect } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  createSource,
  deleteSource,
  previewSource,
  type SourcePatch,
  updateSource,
} from '@/app/lib/api.server';

function isProvider(value: string): value is SourceProvider {
  return (SOURCE_PROVIDERS as readonly string[]).includes(value);
}

function parseMapping(raw: FormDataEntryValue | null): { ok: true; mapping?: unknown } | { ok: false } {
  if (raw === null) return { ok: true };
  try {
    return { ok: true, mapping: JSON.parse(String(raw)) };
  } catch {
    return { ok: false };
  }
}

export async function sourcesAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'create': {
        const name = String(form.get('name') ?? '').trim();
        const provider = String(form.get('provider') ?? '').trim();
        const secret = String(form.get('secret') ?? '');
        if (!name) return { error: 'Give the source a name.' };
        if (name.length > MAX_SOURCE_NAME)
          return { error: `Keep the name under ${MAX_SOURCE_NAME} characters.` };
        if (!isProvider(provider)) return { error: 'Pick a provider.' };
        const created = await createSource(ctx, token, slug, tenant, {
          name,
          provider,
          ...(secret ? { secret } : {}),
        });
        return { ok: true, id: created.id, url: created.url };
      }
      case 'update': {
        const id = String(form.get('id') ?? '');
        const patch: SourcePatch = {};
        const name = form.get('name');
        if (name !== null) {
          const trimmed = String(name).trim();
          if (!trimmed) return { error: 'Give the source a name.' };
          patch.name = trimmed;
        }
        const secret = form.get('secret');
        if (secret !== null && String(secret)) patch.secret = String(secret);
        const mapping = parseMapping(form.get('mapping'));
        if (!mapping.ok) return { error: 'The mapping is not valid JSON.' };
        if (mapping.mapping !== undefined) patch.mapping = mapping.mapping;
        const provider = form.get('provider');
        if (provider !== null) patch.provider = String(provider);
        const verification = parseMapping(form.get('verification'));
        if (!verification.ok) return { error: 'The verification is not valid JSON.' };
        if (verification.mapping !== undefined) patch.verification = verification.mapping;
        await updateSource(ctx, token, slug, tenant, id, patch);
        return { ok: true, saved: Object.keys(patch) };
      }
      case 'pause':
      case 'resume': {
        await updateSource(ctx, token, slug, tenant, String(form.get('id') ?? ''), {
          status: intent === 'pause' ? 'paused' : 'active',
        });
        return { ok: true, status: intent === 'pause' ? 'paused' : 'active' };
      }
      case 'preview': {
        const id = String(form.get('id') ?? '');
        const key = String(form.get('key') ?? '');
        let payload: unknown;
        try {
          payload = JSON.parse(String(form.get('payload') ?? ''));
        } catch {
          return { ok: true, key, preview: null };
        }
        const mapping = parseMapping(form.get('mapping'));
        const preview = await previewSource(ctx, token, slug, tenant, id, {
          payload,
          ...(mapping.ok && mapping.mapping !== undefined ? { mapping: mapping.mapping } : {}),
        });
        return { ok: true, key, preview };
      }
      case 'delete': {
        await deleteSource(ctx, token, slug, tenant, String(form.get('id') ?? ''));
        return redirect(`/${slug}/sources`);
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
      return 'Failed to create source';
    case 'update':
      return 'Failed to save changes';
    case 'pause':
      return 'Failed to pause source';
    case 'resume':
      return 'Failed to resume source';
    case 'delete':
      return 'Failed to delete source';
    default:
      return 'Failed to update source';
  }
}
