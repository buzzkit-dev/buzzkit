import { randomString } from '@buzzkit/api/api/keys/index';
import { ConflictError, GoneError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import { INVITE_TTL_MS } from './constants';
import type { WorkspaceInvite, WorkspaceMemberRow } from './types';

export * from './constants';
export * from './email';
export * from './serialize';
export type * from './types';

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_MS);
}

export function isInviteExpired(invite: WorkspaceInvite): boolean {
  return invite.expiresAt.getTime() < Date.now();
}

export async function findInviteWorkspace(db: Db, invite: WorkspaceInvite) {
  const [workspace] = await trace('invites.workspace', async () => {
    return await db
      .select({ name: tables.workspace.name, slug: tables.workspace.slug })
      .from(tables.workspace)
      .where(eq(tables.workspace.id, invite.workspaceId));
  });
  return workspace ?? null;
}

export async function listPendingInvites(db: Db, workspaceId: number): Promise<WorkspaceInvite[]> {
  return await trace('invites.list', async () => {
    return await db
      .select()
      .from(tables.workspaceInvite)
      .where(
        and(
          eq(tables.workspaceInvite.workspaceId, workspaceId),
          isNull(tables.workspaceInvite.deletedAt),
          isNull(tables.workspaceInvite.acceptedAt)
        )
      )
      .orderBy(desc(tables.workspaceInvite.createdAt));
  });
}

export async function findInvite(db: Db, workspaceId: number, inviteSqid: string): Promise<WorkspaceInvite> {
  const inviteId = decodeEntityId('invite', inviteSqid);
  if (!inviteId) {
    throw new NotFoundError('Invite not found');
  }

  const [invite] = await trace('invites.find', async () => {
    return await db
      .select()
      .from(tables.workspaceInvite)
      .where(
        and(
          eq(tables.workspaceInvite.id, inviteId),
          eq(tables.workspaceInvite.workspaceId, workspaceId),
          isNull(tables.workspaceInvite.deletedAt)
        )
      );
  });

  if (!invite) {
    throw new NotFoundError('Invite not found');
  }
  return invite;
}

export async function findInviteByToken(db: Db, token: string): Promise<WorkspaceInvite> {
  const [invite] = await trace('invites.findByToken', async () => {
    return await db
      .select()
      .from(tables.workspaceInvite)
      .where(and(eq(tables.workspaceInvite.token, token), isNull(tables.workspaceInvite.deletedAt)));
  });

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

  const [existingInvite] = await trace('invites.findPendingByEmail', async () => {
    return await db
      .select({ id: tables.workspaceInvite.id })
      .from(tables.workspaceInvite)
      .where(
        and(
          eq(tables.workspaceInvite.workspaceId, workspaceId),
          eq(tables.workspaceInvite.email, email),
          isNull(tables.workspaceInvite.deletedAt),
          isNull(tables.workspaceInvite.acceptedAt)
        )
      );
  });
  if (existingInvite) {
    throw new ConflictError('This email already has a pending invite. Resend it instead.');
  }

  const [existingMember] = await trace('invites.findMemberByEmail', async () => {
    return await db
      .select({ id: tables.workspaceMember.id })
      .from(tables.workspaceMember)
      .innerJoin(tables.auth.user, eq(tables.auth.user.id, tables.workspaceMember.userId))
      .where(
        and(
          eq(tables.workspaceMember.workspaceId, workspaceId),
          eq(tables.auth.user.email, email),
          isNull(tables.workspaceMember.deletedAt)
        )
      );
  });
  if (existingMember) {
    throw new ConflictError('This email already belongs to a member of the workspace');
  }

  const [invite] = await trace('invites.create', async () => {
    return await db
      .insert(tables.workspaceInvite)
      .values({
        workspaceId,
        email,
        role: input.role,
        token: randomString(32),
        invitedByMemberId: input.invitedByMemberId,
        expiresAt: inviteExpiry(),
      })
      .returning();
  });

  return invite!;
}

export async function resendInvite(db: Db, invite: WorkspaceInvite): Promise<WorkspaceInvite> {
  if (invite.acceptedAt) {
    throw new ConflictError('This invite was already accepted');
  }

  const [updated] = await trace('invites.resend', async () => {
    return await db
      .update(tables.workspaceInvite)
      .set({ expiresAt: inviteExpiry() })
      .where(eq(tables.workspaceInvite.id, invite.id))
      .returning();
  });
  return updated!;
}

export async function revokeInvite(db: Db, inviteId: number): Promise<WorkspaceInvite> {
  const [revoked] = await trace('invites.revoke', async () => {
    return await db
      .update(tables.workspaceInvite)
      .set({ deletedAt: new Date() })
      .where(eq(tables.workspaceInvite.id, inviteId))
      .returning();
  });
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

  const [existing] = await trace('invites.findExistingMembership', async () => {
    return await db
      .select({ id: tables.workspaceMember.id })
      .from(tables.workspaceMember)
      .where(
        and(
          eq(tables.workspaceMember.workspaceId, invite.workspaceId),
          eq(tables.workspaceMember.userId, user.id),
          isNull(tables.workspaceMember.deletedAt)
        )
      );
  });
  if (existing) {
    throw new ConflictError('You are already a member of this workspace');
  }

  return await trace('invites.accept', async () => {
    return await db.transaction(async (tx) => {
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
    });
  });
}
