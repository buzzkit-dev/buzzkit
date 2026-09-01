import type { WorkspaceInvite } from './types';

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export function serializeInvite(invite: WorkspaceInvite) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedByMemberId: invite.invitedByMemberId,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}
