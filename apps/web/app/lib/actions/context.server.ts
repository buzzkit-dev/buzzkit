import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { requireSession, resolveTenant } from '@/app/lib/session.server';

export async function beginAction({ request, context, params }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const form = await request.formData();
  const tenant = params.slug ? await resolveTenant(request, params.slug) : 'default';
  return { env, token, ctx: { request, env }, form, intent: String(form.get('intent') ?? ''), tenant };
}
