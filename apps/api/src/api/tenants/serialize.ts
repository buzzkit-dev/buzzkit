import { resolveTenantSettings } from './settings';
import type { Tenant } from './types';

export function serializeTenant(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isDefault: tenant.isDefault,
    metadata: tenant.metadata,
    settings: resolveTenantSettings(tenant.settings),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export function serializeIdentitySecret(tenant: Tenant) {
  return { id: tenant.id, identitySecret: tenant.identitySecret, updatedAt: tenant.updatedAt };
}
