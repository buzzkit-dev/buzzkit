import { env } from 'cloudflare:workers';
import { sendTextEmail } from '@buzzkit/api/libs/email';
import type { WorkspaceInvite } from './types';

export function inviteEmailContent(input: {
  workspaceName: string;
  inviterName: string | null;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  dashboardUrl: string;
}): { subject: string; text: string } {
  const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').trim();
  const inviter = clean(input.inviterName ?? 'A teammate');
  const workspaceName = clean(input.workspaceName);
  const expires = input.expiresAt.toISOString().slice(0, 10);

  return {
    subject: `${inviter} invited you to ${workspaceName} on buzzkit`,
    text: [
      `${inviter} invited you to join the ${workspaceName} workspace on buzzkit as ${input.role}.`,
      '',
      'Accept the invite:',
      `${input.dashboardUrl}/invite/${input.token}`,
      '',
      `This invite was sent to ${input.email} and expires on ${expires}.`,
      'If you were not expecting it, you can ignore this email.',
    ].join('\n'),
  };
}

export async function sendInviteEmail(
  invite: WorkspaceInvite,
  workspace: { name: string },
  inviterName: string | null
): Promise<boolean> {
  return await sendTextEmail({
    to: invite.email,
    ...inviteEmailContent({
      workspaceName: workspace.name,
      inviterName,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      dashboardUrl: env.DASHBOARD_URL,
    }),
  });
}
