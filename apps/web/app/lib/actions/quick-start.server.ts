import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { createKeyIntent } from '@/app/lib/actions/keys.server';
import { sendIntent } from '@/app/lib/actions/messages.server';

export async function quickStartAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent, tenant } = await beginAction(args);
  const slug = String(args.params.slug);

  switch (intent) {
    case 'send':
      return sendIntent(ctx, token, slug, tenant, form);
    case 'create-key':
      return createKeyIntent(ctx, token, slug, form);
    default:
      return { error: 'Unknown action.' };
  }
}
