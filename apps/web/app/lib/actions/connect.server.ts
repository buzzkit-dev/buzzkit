import { type ActionFunctionArgs, data } from 'react-router';
import { type ProviderId, resolveOnboardingPath } from '@/app/components/onboarding/catalog';
import { buildCredentialUpload } from '@/app/components/onboarding/guides/upload';
import type { ConnectActionData } from '@/app/components/onboarding/provider-guide';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, createCredential, type RequestContext, validateCredential } from '@/app/lib/api.server';

export async function connectProvider(
  ctx: RequestContext,
  token: string,
  slug: string,
  tenant: string,
  provider: ProviderId,
  form: FormData,
  intent: string
): Promise<ConnectActionData> {
  try {
    if (intent === 'validate') {
      const ids = String(form.get('ids') ?? '')
        .split(',')
        .filter(Boolean);
      const credentials = await Promise.all(
        ids.map((id) => validateCredential(ctx, token, slug, tenant, id))
      );
      return { ok: true, credentials };
    }

    const built = buildCredentialUpload(provider, form);
    if (!built.ok) return built;

    const credentials = await createCredential(ctx, token, slug, tenant, built.upload);
    return { ok: true, credentials };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message, param: error.param };
    throw error;
  }
}

export async function connectProviderAction(args: ActionFunctionArgs): Promise<ConnectActionData> {
  const { token, ctx, form, intent } = await beginAction(args);
  const { provider } = resolveOnboardingPath(args.params['*']);
  if (!provider) throw data(null, { status: 404 });
  return connectProvider(ctx, token, String(args.params.slug), 'default', provider.id, form, intent);
}
