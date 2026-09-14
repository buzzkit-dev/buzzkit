import { serializeWorkspace } from '@buzzkit/api/api/workspaces/index';
import { MissingPermissionError } from '@buzzkit/api/libs/error';
import { decodeSqid, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, ilike, isNull, lt, or, sql, tables } from '@buzzkit/database';
import type { MEMBER_ROLES } from 'buzzkit';
import { t } from 'elysia';

type MemberRole = (typeof MEMBER_ROLES)[number];

export const AdminWorkspaceQuerySchema = t.Object({
  ...PaginationQuerySchema.properties,
  q: t.Optional(t.String({ maxLength: 200 })),
});

export function markWorkspaceAccess<T extends object>(
  payload: T,
  user: { admin: boolean } | null,
  membership: { role: MemberRole } | null
): T & { role: MemberRole | null } {
  if (user?.admin) return { ...payload, role: 'owner' };
  return { ...payload, role: membership?.role ?? null };
}

export async function assertAdmin(db: Db, userId: string): Promise<void> {
  if (await selectAdmin(db, userId)) return;
  throw new MissingPermissionError('This action requires admin access', { code: 'admin_required' });
}

export function requireAdmin(context: { db: Db; user: { id: string } }): Promise<void> {
  return assertAdmin(context.db, context.user.id);
}

export async function selectAdmin(db: Db, userId: string): Promise<boolean> {
  const [row] = await trace('admin.select', async () => {
    return await db
      .select({ admin: tables.auth.user.admin })
      .from(tables.auth.user)
      .where(and(eq(tables.auth.user.id, userId), isNull(tables.auth.user.deletedAt)));
  });
  return row?.admin === true;
}

function resolveWorkspaceSearch(q: string | undefined) {
  const needle = q?.trim();
  if (!needle) return undefined;

  return or(
    ilike(tables.workspace.slug, `%${needle}%`),
    ilike(tables.workspace.name, `%${needle}%`),
    sql`exists (
      select 1 from ${tables.workspaceMember}
      join ${tables.auth.user} on ${tables.auth.user.id} = ${tables.workspaceMember.userId}
      where ${tables.workspaceMember.workspaceId} = ${tables.workspace.id}
        and ${tables.workspaceMember.deletedAt} is null
        and ${tables.auth.user.email} ilike ${`%${needle}%`}
    )`
  );
}

export async function listEveryWorkspace(
  db: Db,
  userId: string,
  options: { q?: string; cursor?: string; limit?: number } = {}
) {
  const limit = clampLimit(options.limit);
  const cursorId = resolveCursor(options.cursor, decodeSqid);

  const rows = await trace('admin.listWorkspaces', async () => {
    return await db
      .select({ workspace: tables.workspace, role: tables.workspaceMember.role })
      .from(tables.workspace)
      .leftJoin(
        tables.workspaceMember,
        and(
          eq(tables.workspaceMember.workspaceId, tables.workspace.id),
          eq(tables.workspaceMember.userId, userId),
          isNull(tables.workspaceMember.deletedAt)
        )
      )
      .where(
        and(
          isNull(tables.workspace.deletedAt),
          resolveWorkspaceSearch(options.q),
          cursorId !== undefined ? lt(tables.workspace.id, cursorId) : undefined
        )
      )
      .orderBy(desc(tables.workspace.id))
      .limit(limit + 1);
  });

  return toPage(
    rows.map((row) => ({ ...serializeWorkspace(row.workspace), role: row.role })),
    limit,
    (id) => encodeId('workspace', id)
  );
}
