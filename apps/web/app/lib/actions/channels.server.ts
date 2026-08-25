import type { ActionFunctionArgs } from 'react-router';
import { CHANNELS, type ProviderId } from '@/app/components/onboarding/catalog';
import { connectProvider } from '@/app/lib/actions/connect.server';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, deleteCredential } from '@/app/lib/api.server';

const PROVIDERS = CHANNELS.flatMap((channel) =>
  channel.providers.filter((provider) => provider.available).map((provider) => provider.id as ProviderId)
);

export async function channelsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  if (intent === 'connect' || intent === 'validate') {
    const provider = PROVIDERS.find((entry) => entry === form.get('provider'));
    if (!provider) return { ok: false, error: 'Pick a provider.' };
    return connectProvider(ctx, token, slug, tenant, provider, form, intent);
  }

  if (intent === 'remove') {
    const ids = String(form.get('ids') ?? '')
      .split(',')
      .filter(Boolean);
    if (ids.length === 0) return { error: 'Pick a provider.' };
    try {
      for (const id of ids) await deleteCredential(ctx, token, slug, tenant, id);
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }
  }

  return { error: 'Unknown action.' };
}
