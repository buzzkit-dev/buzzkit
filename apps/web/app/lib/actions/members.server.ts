import type { ActionFunctionArgs } from 'react-router';
import { beginAction } from '@/app/lib/actions/context.server';
import {
  ApiError,
  createInvite,
  removeMember,
  resendInvite,
  revokeInvite,
  updateMemberRole,
} from '@/app/lib/api.server';

const ROLES = ['member', 'admin', 'owner'] as const;
const INVITE_ROLES = ['member', 'admin'] as const;

export async function membersAction(args: ActionFunctionArgs) {
  const { token, ctx, form, intent } = await beginAction(args);
  const slug = String(args.params.slug);
  const id = String(form.get('id') ?? '');

  try {
    switch (intent) {
      case 'role': {
        const role = ROLES.find((entry) => entry === form.get('role'));
        if (!id || !role) return { error: 'Pick a role.' };
        await updateMemberRole(ctx, token, slug, id, role);
        return { ok: true };
      }
      case 'remove': {
        if (!id) return { error: 'Pick a member.' };
        await removeMember(ctx, token, slug, id);
        return { ok: true };
      }
      case 'invite': {
        const email = String(form.get('email') ?? '')
          .trim()
          .toLowerCase();
        const role = INVITE_ROLES.find((entry) => entry === form.get('role')) ?? 'member';
        if (!email.includes('@')) return { error: 'Enter an email address.' };
        const invite = await createInvite(ctx, token, slug, { email, role });
        return { ok: true, email: invite.email, token: invite.token, emailSent: invite.emailSent };
      }
      case 'resend': {
        if (!id) return { error: 'Pick an invite.' };
        const invite = await resendInvite(ctx, token, slug, id);
        return { ok: true, email: invite.email, token: invite.token, emailSent: invite.emailSent };
      }
      case 'revoke': {
        if (!id) return { error: 'Pick an invite.' };
        await revokeInvite(ctx, token, slug, id);
        return { ok: true };
      }
      default:
        return { error: 'Unknown action.' };
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === 'conflict') return { error: 'They already have access or a pending invite.' };
    if (error.code === 'forbidden') return { error: 'Only an owner can change who owns the workspace.' };
    return { error: error.message };
  }
}
