import { randomString } from '@buzzkit/api/api/keys/index';
import { ConflictError, GoneError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';

export type WorkspaceInvite = typeof tables.workspaceInvite.$inferSelect;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_MS);
}

export async function findInviteWorkspace(db: Db, invite: WorkspaceInvite) {
  const [workspace] = await trace(
    'invites.workspace',
    async () =>
      await db
        .select({ name: tables.workspace.name, slug: tables.workspace.slug })
        .from(tables.workspace)
        .where(eq(tables.workspace.id, invite.workspaceId))
  );
  return workspace ?? null;
}

export function isInviteExpired(invite: WorkspaceInvite): boolean {
  return invite.expiresAt.getTime() < Date.now();
}

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

export async function listPendingInvites(db: Db, workspaceId: number): Promise<WorkspaceInvite[]> {
  return await trace(
    'invites.list',
    async () =>
      await db
        .select()
        .from(tables.workspaceInvite)
        .where(
          and(
            eq(tables.workspaceInvite.workspaceId, workspaceId),
            isNull(tables.workspaceInvite.deletedAt),
            isNull(tables.workspaceInvite.acceptedAt)
          )
        )
        .orderBy(desc(tables.workspaceInvite.createdAt))
  );
}

export async function findInvite(db: Db, workspaceId: number, inviteSqid: string): Promise<WorkspaceInvite> {
  const inviteId = decodeEntityId('invite', inviteSqid);

  if (!inviteId) {
    throw new NotFoundError('Invite not found');
  }

  const [invite] = await trace(
    'invites.find',
    async () =>
      await db
        .select()
        .from(tables.workspaceInvite)
        .where(
          and(
            eq(tables.workspaceInvite.id, inviteId),
            eq(tables.workspaceInvite.workspaceId, workspaceId),
            isNull(tables.workspaceInvite.deletedAt)
          )
        )
  );

  if (!invite) {
    throw new NotFoundError('Invite not found');
  }

  return invite;
}

export async function findInviteByToken(db: Db, token: string): Promise<WorkspaceInvite> {
  const [invite] = await trace(
    'invites.findByToken',
    async () =>
      await db
        .select()
        .from(tables.workspaceInvite)
        .where(and(eq(tables.workspaceInvite.token, token), isNull(tables.workspaceInvite.deletedAt)))
  );

  if (!invite) {
    throw new NotFoundError('Invite not found');
  }

  return invite;
}

export async function createInvite(
  db: Db,
  workspaceId: number,
  input: { email: string; role: 'member' | 'admin'; invitedByMemberId: number | null }
): Promise<WorkspaceInvite> {
  const email = input.email.trim().toLowerCase();

  const [existingInvite] = await trace(
    'invites.findPendingByEmail',
    async () =>
      await db
        .select({ id: tables.workspaceInvite.id })
        .from(tables.workspaceInvite)
        .where(
          and(
            eq(tables.workspaceInvite.workspaceId, workspaceId),
            eq(tables.workspaceInvite.email, email),
            isNull(tables.workspaceInvite.deletedAt),
            isNull(tables.workspaceInvite.acceptedAt)
          )
        )
  );

  if (existingInvite) {
    throw new ConflictError('This email already has a pending invite. Resend it instead.');
  }

  const [existingMember] = await trace(
    'invites.findMemberByEmail',
    async () =>
      await db
        .select({ id: tables.workspaceMember.id })
        .from(tables.workspaceMember)
        .innerJoin(tables.auth.user, eq(tables.auth.user.id, tables.workspaceMember.userId))
        .where(
          and(
            eq(tables.workspaceMember.workspaceId, workspaceId),
            eq(tables.auth.user.email, email),
            isNull(tables.workspaceMember.deletedAt)
          )
        )
  );

  if (existingMember) {
    throw new ConflictError('This email already belongs to a member of the workspace');
  }

  const [invite] = await trace(
    'invites.create',
    async () =>
      await db
        .insert(tables.workspaceInvite)
        .values({
          workspaceId,
          email,
          role: input.role,
          token: randomString(32),
          invitedByMemberId: input.invitedByMemberId,
          expiresAt: inviteExpiry(),
        })
        .returning()
  );

  return invite!;
}

export async function resendInvite(db: Db, invite: WorkspaceInvite): Promise<WorkspaceInvite> {
  if (invite.acceptedAt) {
    throw new ConflictError('This invite was already accepted');
  }

  const [updated] = await trace(
    'invites.resend',
    async () =>
      await db
        .update(tables.workspaceInvite)
        .set({ expiresAt: inviteExpiry() })
        .where(eq(tables.workspaceInvite.id, invite.id))
        .returning()
  );

  return updated!;
}

export async function revokeInvite(db: Db, inviteId: number): Promise<WorkspaceInvite> {
  const [revoked] = await trace(
    'invites.revoke',
    async () =>
      await db
        .update(tables.workspaceInvite)
        .set({ deletedAt: new Date() })
        .where(eq(tables.workspaceInvite.id, inviteId))
        .returning()
  );

  return revoked!;
}

export async function acceptInvite(
  db: Db,
  invite: WorkspaceInvite,
  user: { id: string; email: string }
): Promise<{ member: WorkspaceMemberRow; invite: WorkspaceInvite }> {
  if (invite.acceptedAt) {
    throw new ConflictError('This invite was already accepted');
  }
  if (isInviteExpired(invite)) {
    throw new GoneError('This invite expired. Ask for a new one.');
  }
  if (invite.email !== user.email.toLowerCase()) {
    throw new NotFoundError('Invite not found');
  }

  const [existing] = await trace(
    'invites.findExistingMembership',
    async () =>
      await db
        .select({ id: tables.workspaceMember.id })
        .from(tables.workspaceMember)
        .where(
          and(
            eq(tables.workspaceMember.workspaceId, invite.workspaceId),
            eq(tables.workspaceMember.userId, user.id),
            isNull(tables.workspaceMember.deletedAt)
          )
        )
  );

  if (existing) {
    throw new ConflictError('You are already a member of this workspace');
  }

  return await trace('invites.accept', async () =>
    db.transaction(async (tx) => {
      const [member] = await tx
        .insert(tables.workspaceMember)
        .values({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        })
        .returning();

      const [accepted] = await tx
        .update(tables.workspaceInvite)
        .set({ acceptedAt: new Date(), acceptedMemberId: member!.id })
        .where(eq(tables.workspaceInvite.id, invite.id))
        .returning();

      return { member: member!, invite: accepted! };
    })
  );
}

type WorkspaceMemberRow = typeof tables.workspaceMember.$inferSelect;
