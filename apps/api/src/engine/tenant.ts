import type { Tenant } from '@buzzkit/api/api/tenants/index';
import { type Db, eq, tables } from '@buzzkit/database';

export async function loadTenant(db: Db, tenantId: number): Promise<Tenant> {
  const [tenant] = await db.select().from(tables.tenant).where(eq(tables.tenant.id, tenantId));
  if (!tenant) throw new Error('Tenant is gone');
  return tenant;
}
