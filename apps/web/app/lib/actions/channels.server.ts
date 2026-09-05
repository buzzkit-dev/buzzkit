import type { ActionFunctionArgs } from 'react-router';
import { CHANNELS, type ProviderId } from '@/app/components/onboarding/catalog';
import { connectProvider } from '@/app/lib/actions/connect.server';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, deleteCredential, rotateTenantIdentitySecret, updateTenant } from '@/app/lib/api.server';

const PROVIDERS = CHANNELS.flatMap((channel) =>
  channel.providers.filter((provider) => provider.available).map((provider) => provider.id as ProviderId)
);

export async function channelsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  if (intent === 'connect' || intent === 'validate') {
    const provider = PROVIDERS.find((entry) => entry === form.get('provider'));
    if (!provider) return { error: 'Pick a provider.' };
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

  if (intent === 'policy') {
    const quietEnabled = form.get('quietEnabled') === 'true';
    const from = String(form.get('from') ?? '').trim();
    const to = String(form.get('to') ?? '').trim();
    const timezone = String(form.get('timezone') ?? '').trim();
    const capEnabled = form.get('capEnabled') === 'true';
    const cap = Number(form.get('cap') ?? Number.NaN);
    if (quietEnabled && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(to))) {
      return { error: 'Give quiet hours a start and an end time.' };
    }
    if (quietEnabled && from === to) return { error: 'Quiet hours need two different times.' };
    if (capEnabled && (!Number.isInteger(cap) || cap < 1 || cap > 50)) {
      return { error: 'The daily cap is a whole number from 1 to 50.' };
    }
    try {
      await updateTenant(ctx, token, slug, tenant, {
        settings: {
          sendPolicy: {
            quietHours: quietEnabled ? { from, to, ...(timezone ? { timezone } : {}) } : null,
            dailyCap: capEnabled ? cap : null,
          },
        },
      });
      return { ok: 'Send policy saved' };
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }
  }

  if (intent === 'identity') {
    try {
      await updateTenant(ctx, token, slug, tenant, {
        settings: { identity: { requireVerification: form.get('require') === 'true' } },
      });
      return { ok: 'Identity verification saved' };
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }
  }

  if (intent === 'rotate-identity-secret') {
    try {
      await rotateTenantIdentitySecret(ctx, token, slug, tenant);
      return { ok: 'Identity secret rotated' };
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }
  }

  return { error: 'Unknown action.' };
}
