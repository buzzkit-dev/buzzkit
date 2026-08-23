import { type ActionFunctionArgs, redirect } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { ApiError, acceptInvite } from '@/app/lib/api.server';
import { signOut } from '@/app/lib/session.server';

export async function inviteAction(args: ActionFunctionArgs) {
  const { env, token, ctx, intent } = await beginAction(args);
  if (intent === 'sign-out') return signOut(args.request, env);

  try {
    const result = await acceptInvite(ctx, token, String(args.params.token));
    return redirect(result.workspace?.slug ? `/${result.workspace.slug}` : '/');
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}
