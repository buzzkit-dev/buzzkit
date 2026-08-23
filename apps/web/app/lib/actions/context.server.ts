import type { ActionFunctionArgs } from 'react-router';
import { cloudflareContext } from '@/app/cloudflare';
import { requireSession } from '@/app/lib/session.server';

export async function beginAction({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const { token } = requireSession(request);
  const form = await request.formData();
  return { env, token, ctx: { request, env }, form, intent: String(form.get('intent') ?? '') };
}
