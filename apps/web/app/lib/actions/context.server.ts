import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { requireSession, resolveTenant } from '@/app/lib/session.server';

export async function beginAction({ request, context, params }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const form = await request.formData();

  let tenant = 'default';
  if (params.slug) tenant = await resolveTenant(request, params.slug);

  return { env, token, ctx: { request, env }, form, intent: String(form.get('intent') ?? ''), tenant };
}
