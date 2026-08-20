import { BadRequestError, ConflictError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Workspace = typeof tables.workspace.$inferSelect;

export const SlugSchema = t.String({
  minLength: 3,
  maxLength: 48,
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  description: 'Lowercase letters, numbers and single hyphens',
});

export const WorkspaceNameSchema = t.String({ minLength: 1, maxLength: 100 });

export async function assertSlugAvailable(db: Db, slug: string): Promise<void> {
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestError('This slug is reserved');
  }

  const [existing] = await trace(
    'workspaces.getBySlug',
    async () =>
      await db
        .select({ id: tables.workspace.id })
        .from(tables.workspace)
        .where(and(eq(tables.workspace.slug, slug), isNull(tables.workspace.deletedAt)))
  );

  if (existing) {
    throw new ConflictError('A workspace with this slug already exists');
  }
}

export async function createWorkspace(
  db: Db,
  input: { name: string; slug: string; avatarUrl?: string },
  ownerUserId: string
): Promise<Workspace> {
  return await trace('workspaces.create', async () =>
    db.transaction(async (tx) => {
      const [workspace] = await tx.insert(tables.workspace).values(input).returning();

      await tx.insert(tables.workspaceMember).values({
        workspaceId: workspace!.id,
        userId: ownerUserId,
        role: 'owner',
      });

      await tx.insert(tables.tenant).values({
        workspaceId: workspace!.id,
        name: 'Default',
        slug: 'default',
        isDefault: true,
      });

      return workspace!;
    })
  );
}

export async function listWorkspacesForUser(db: Db, userId: string) {
  const rows = await trace(
    'workspaces.listForUser',
    async () =>
      await db
        .select({
          workspace: tables.workspace,
          role: tables.workspaceMember.role,
        })
        .from(tables.workspaceMember)
        .innerJoin(
          tables.workspace,
          and(eq(tables.workspace.id, tables.workspaceMember.workspaceId), isNull(tables.workspace.deletedAt))
        )
        .where(and(eq(tables.workspaceMember.userId, userId), isNull(tables.workspaceMember.deletedAt)))
        .orderBy(desc(tables.workspace.createdAt))
  );

  return rows.map(({ workspace, role }) => ({ ...workspace, role }));
}

export async function updateWorkspace(
  db: Db,
  workspaceId: number,
  patch: { name?: string; slug?: string; avatarUrl?: string | null }
): Promise<Workspace> {
  const [updated] = await trace(
    'workspaces.update',
    async () =>
      await db.update(tables.workspace).set(patch).where(eq(tables.workspace.id, workspaceId)).returning()
  );

  return updated!;
}

export async function softDeleteWorkspace(db: Db, workspaceId: number): Promise<Workspace> {
  return await trace('workspaces.softDelete', async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.workspace)
        .set({ deletedAt: new Date() })
        .where(eq(tables.workspace.id, workspaceId))
        .returning();

      await tx
        .update(tables.apiKey)
        .set({ revokedAt: new Date() })
        .where(and(eq(tables.apiKey.workspaceId, workspaceId), isNull(tables.apiKey.revokedAt)));

      return deleted!;
    })
  );
}
