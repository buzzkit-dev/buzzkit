import type { tables } from '@buzzkit/database';

export type Tenant = typeof tables.tenant.$inferSelect;

export type QuietHours = { from: string; to: string; timezone: string };

export type SendPolicy = { quietHours: QuietHours | null; dailyCap: number | null };

export type TenantSettings = {
  identity: { requireVerification: boolean };
  channels: Record<'push' | 'email', { enabled: boolean }>;
  sendPolicy: SendPolicy;
};

export type SendPolicyPatch = {
  quietHours?: { from: string; to: string; timezone?: string } | null;
  dailyCap?: number | null;
};

export type TenantSettingsPatch = {
  identity?: { requireVerification?: boolean };
  channels?: Partial<Record<'push' | 'email', { enabled?: boolean }>>;
  sendPolicy?: SendPolicyPatch;
};
