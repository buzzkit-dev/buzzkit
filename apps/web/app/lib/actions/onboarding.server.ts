import { type ActionFunctionArgs, data, redirect } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import { createWorkspaceFromForm } from '@/app/lib/actions/workspace.server';
import { listWorkspaces } from '@/app/lib/api.server';
import { lastWorkspaceCookie } from '@/app/lib/session.server';

export async function onboardingAction(args: ActionFunctionArgs) {
  const { env, token, ctx, form } = await beginAction(args);
  if ((await listWorkspaces(ctx, token)).length > 0) throw redirect('/');

  const result = await createWorkspaceFromForm(ctx, token, form);
  if (!result.ok) return data({ errors: result.errors }, { status: result.status });
  return redirect(`/${result.workspace.slug}/onboarding`, {
    headers: { 'Set-Cookie': await lastWorkspaceCookie(env, result.workspace.slug) },
  });
}
