import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, count, type Db, eq, isNull, ne, tables } from '@buzzkit/database';

export type WorkspaceMember = typeof tables.workspaceMember.$inferSelect;

export async function findMember(db: Db, workspaceId: number, memberSqid: string): Promise<WorkspaceMember> {
  const memberId = decodeEntityId('member', memberSqid);

  if (!memberId) {
    throw new BadRequestError('Invalid member identifier');
  }

  const [member] = await trace(
    'members.find',
    async () =>
      await db
        .select()
        .from(tables.workspaceMember)
        .where(
          and(
            eq(tables.workspaceMember.id, memberId),
            eq(tables.workspaceMember.workspaceId, workspaceId),
            isNull(tables.workspaceMember.deletedAt)
          )
        )
  );

  if (!member) {
    throw new NotFoundError('Member not found');
  }

  return member;
}

export async function assertNotLastOwner(db: Db, workspaceId: number, memberId: number): Promise<void> {
  const [owners] = await trace(
    'members.countOtherOwners',
    async () =>
      await db
        .select({ count: count() })
        .from(tables.workspaceMember)
        .where(
          and(
            eq(tables.workspaceMember.workspaceId, workspaceId),
            eq(tables.workspaceMember.role, 'owner'),
            ne(tables.workspaceMember.id, memberId),
            isNull(tables.workspaceMember.deletedAt)
          )
        )
  );

  if (!owners || owners.count === 0) {
    throw new BadRequestError('A workspace must have at least one owner');
  }
}

export async function listMembers(db: Db, workspaceId: number) {
  return await trace(
    'members.list',
    async () =>
      await db
        .select({
          id: tables.workspaceMember.id,
          role: tables.workspaceMember.role,
          createdAt: tables.workspaceMember.createdAt,
          user: {
            id: tables.auth.user.id,
            name: tables.auth.user.name,
            email: tables.auth.user.email,
            image: tables.auth.user.image,
          },
        })
        .from(tables.workspaceMember)
        .innerJoin(tables.auth.user, eq(tables.auth.user.id, tables.workspaceMember.userId))
        .where(
          and(eq(tables.workspaceMember.workspaceId, workspaceId), isNull(tables.workspaceMember.deletedAt))
        )
        .orderBy(tables.workspaceMember.createdAt)
  );
}

export async function updateMemberRole(
  db: Db,
  memberId: number,
  role: WorkspaceMember['role']
): Promise<WorkspaceMember> {
  const [updated] = await trace(
    'members.updateRole',
    async () =>
      await db
        .update(tables.workspaceMember)
        .set({ role })
        .where(eq(tables.workspaceMember.id, memberId))
        .returning()
  );

  return updated!;
}

export async function removeMember(db: Db, memberId: number): Promise<WorkspaceMember> {
  const [removed] = await trace(
    'members.remove',
    async () =>
      await db
        .update(tables.workspaceMember)
        .set({ deletedAt: new Date() })
        .where(eq(tables.workspaceMember.id, memberId))
        .returning()
  );

  return removed!;
}
