import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Deleted, Metadata } from './common';
import { listPage } from './list';

export type QuietHours = {
  from: string;
  to: string;
  timezone: string;
};

export type SendPolicy = {
  quietHours: QuietHours | null;
  dailyCap: number | null;
};

export type TenantSettings = {
  identity: { requireVerification: boolean };
  channels: Record<'push' | 'email', { enabled: boolean }>;
  sendPolicy: SendPolicy;
};

export type TenantSettingsPatch = {
  identity?: { requireVerification?: boolean };
  channels?: Partial<Record<'push' | 'email', { enabled?: boolean }>>;
  sendPolicy?: {
    quietHours?: { from: string; to: string; timezone?: string } | null;
    dailyCap?: number | null;
  };
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  metadata: Metadata;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
};

export type CreateTenantParams = {
  name: string;
  slug: string;
  metadata?: Metadata;
};

export type UpdateTenantParams = {
  name?: string;
  slug?: string;
  metadata?: Metadata;
  settings?: TenantSettingsPatch;
};

export function tenantsResource(transport: Transport) {
  return {
    list(params: PageParams = {}): PagePromise<Tenant> {
      return listPage(transport, '/v1/tenants', params);
    },

    create(params: CreateTenantParams): Promise<Tenant> {
      return transport.request({ method: 'POST', path: '/v1/tenants', body: params });
    },

    retrieve(slug: string): Promise<Tenant> {
      return transport.request({ method: 'GET', path: `/v1/tenants/${encodeSegment(slug)}` });
    },

    update(slug: string, params: UpdateTenantParams): Promise<Tenant> {
      return transport.request({ method: 'PATCH', path: `/v1/tenants/${encodeSegment(slug)}`, body: params });
    },

    remove(slug: string): Promise<Deleted<Tenant>> {
      return transport.request({ method: 'DELETE', path: `/v1/tenants/${encodeSegment(slug)}` });
    },
  };
}

export type TenantsResource = ReturnType<typeof tenantsResource>;
