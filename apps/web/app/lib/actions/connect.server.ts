import { type ActionFunctionArgs, data } from 'react-router';
import { resolveOnboardingPath } from '@/app/components/onboarding/catalog';
import { buildCredentialUpload } from '@/app/components/onboarding/guides/upload';
import type { ConnectActionData } from '@/app/components/onboarding/provider-guide';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, createCredential, validateCredential } from '@/app/lib/api.server';

export async function connectProviderAction(args: ActionFunctionArgs): Promise<ConnectActionData> {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);
  const { provider } = resolveOnboardingPath(args.params['*']);
  if (!provider) throw data(null, { status: 404 });

  try {
    if (intent === 'validate') {
      const ids = String(form.get('ids') ?? '')
        .split(',')
        .filter(Boolean);
      const credentials = await Promise.all(
        ids.map((id) => validateCredential(ctx, token, slug, 'default', id))
      );
      return { ok: true, credentials };
    }

    const built = buildCredentialUpload(provider.id, form);
    if (!built.ok) return built;

    const credentials = await createCredential(ctx, token, slug, 'default', built.upload);
    return { ok: true, credentials };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message, param: error.param };
    throw error;
  }
}
