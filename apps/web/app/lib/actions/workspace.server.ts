import { type ActionFunctionArgs, data, redirect } from 'react-router';
import type { FormErrors } from '@/app/hooks/use-focus-first-error';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  createWorkspace,
  type RequestContext,
  updateProfile,
  updateWorkspace,
} from '@/app/lib/api.server';
import { lastWorkspaceCookie, signOut } from '@/app/lib/session.server';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type WorkspaceFormResult =
  | { ok: true; workspace: Awaited<ReturnType<typeof createWorkspace>> }
  | { ok: false; errors: FormErrors; status: number };

export async function createWorkspaceFromForm(
  ctx: RequestContext,
  token: string,
  form: FormData
): Promise<WorkspaceFormResult> {
  const name = String(form.get('name') ?? '').trim();
  const slug = String(form.get('slug') ?? '').trim();

  const fields: Record<string, string> = {};
  if (!name) fields.name = 'Enter a workspace name.';
  else if (name.length > 100) fields.name = 'Use at most 100 characters.';
  if (!slug) fields.slug = 'Enter a slug.';
  else if (slug.length < 3 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    fields.slug = 'Use 3 to 48 lowercase letters, numbers and single hyphens.';
  }
  if (Object.keys(fields).length > 0) return { ok: false, errors: { fields }, status: 400 };

  try {
    return { ok: true, workspace: await createWorkspace(ctx, token, { name, slug }) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const errors: FormErrors =
      error.code === 'bad_request'
        ? { fields: { slug: 'This slug is reserved. Pick another.' } }
        : error.code === 'conflict'
          ? { fields: { slug: 'This slug is already taken. Try another.' } }
          : { form: error.message };
    return { ok: false, errors, status: error.status || 400 };
  }
}

export async function workspaceAction(args: ActionFunctionArgs) {
  const { env, token, ctx, form, intent } = await beginAction(args);

  switch (intent) {
    case 'sign-out':
      return signOut(args.request, env);
    case 'profile': {
      const name = String(form.get('name') ?? '').trim();
      if (!name) return { error: 'Enter your name.' };
      try {
        await updateProfile(ctx, token, { name });
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) return { error: error.message };
        throw error;
      }
    }
    case 'create-workspace': {
      const result = await createWorkspaceFromForm(ctx, token, form);
      if (!result.ok) return data({ errors: result.errors }, { status: result.status });
      return redirect(`/${result.workspace.slug}/onboarding`, {
        headers: { 'Set-Cookie': await lastWorkspaceCookie(env, result.workspace.slug) },
      });
    }
    default:
      return { error: 'Unknown action.' };
  }
}

export async function workspaceSettingsAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);

  try {
    switch (intent) {
      case 'update': {
        const name = String(form.get('name') ?? '').trim();
        if (!name) return { error: 'Give the workspace a name.' };
        await updateWorkspace(ctx, token, slug, { name });
        return { ok: true };
      }
      case 'set-slug': {
        const next = String(form.get('slug') ?? '')
          .trim()
          .toLowerCase();
        if (next === slug) return { ok: true };
        if (next.length < 3 || next.length > 48 || !SLUG_PATTERN.test(next)) {
          return { error: 'Use 3 to 48 lowercase letters, numbers and single hyphens.' };
        }
        try {
          await updateWorkspace(ctx, token, slug, { slug: next });
        } catch (error) {
          if (error instanceof ApiError && error.code === 'bad_request') {
            return { error: 'This slug is reserved. Pick another.' };
          }
          if (error instanceof ApiError && error.code === 'conflict') {
            return { error: 'This slug is already taken. Try another.' };
          }
          throw error;
        }
        return redirect(`/${next}/settings`);
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}
