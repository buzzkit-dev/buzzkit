import { and, drizzle, eq, postgres, tables } from '@buzzkit/database';

export { and, desc, eq, sql, tables } from '@buzzkit/database';

const client = postgres('postgresql://postgres:postgres@localhost:5460/buzzkit', {
  max: 2,
  idle_timeout: 1,
  fetch_types: false,
});

export const db = drizzle(client);

export async function tenantIdFor(workspaceSlug: string, tenantSlug = 'default'): Promise<number> {
  const [row] = await db
    .select({ id: tables.tenant.id })
    .from(tables.tenant)
    .innerJoin(tables.workspace, eq(tables.workspace.id, tables.tenant.workspaceId))
    .where(and(eq(tables.workspace.slug, workspaceSlug), eq(tables.tenant.slug, tenantSlug)));
  if (!row) throw new Error(`tenant ${workspaceSlug}/${tenantSlug} not found`);
  return row.id;
}

export async function tenantIdBySlug(tenantSlug: string): Promise<number> {
  const [row] = await db
    .select({ id: tables.tenant.id })
    .from(tables.tenant)
    .where(eq(tables.tenant.slug, tenantSlug))
    .orderBy(tables.tenant.id)
    .limit(1);
  if (!row) throw new Error(`tenant ${tenantSlug} not found`);
  return row.id;
}

/**
 * Connects a channel without talking to a provider: writes a credential row
 * whose secret is never decrypted in tests. An `invalid` row still counts as
 * connected but deliveries skip it, so they settle at once as `no_credential`,
 * which is what fan-out tests need. Real push goes through the APNs upload.
 */
export async function connectChannel(
  tenantId: number,
  channel: 'email' | 'push',
  status: 'active' | 'invalid' = 'active'
) {
  const [row] = await db
    .insert(tables.credential)
    .values({
      tenantId,
      channel,
      provider: channel === 'email' ? 'resend' : 'apns',
      environment: 'production',
      secretCiphertext: 'test',
      secretIv: 'test',
      dekCiphertext: 'test',
      dekIv: 'test',
      details: {},
      status,
      validatedAt: status === 'active' ? new Date() : null,
      lastError: status === 'invalid' ? 'Test credential, never sends' : null,
      keyVersion: 1,
    })
    .returning({ id: tables.credential.id });
  return row!;
}

export async function disconnectChannel(tenantId: number, channel: 'email' | 'push') {
  await db
    .update(tables.credential)
    .set({ deletedAt: new Date() })
    .where(and(eq(tables.credential.tenantId, tenantId), eq(tables.credential.channel, channel)));
}
