import type { Transport } from '../core/transport';
import type { Attributes, Channel, Environment, Platform } from './common';

export type ImportRow = {
  externalId: string;
  channel?: Channel;
  platform?: Platform;
  environment?: Environment;
  token?: string;
  address?: string;
  attributes?: Attributes;
  timezone?: string;
  language?: string;
  country?: string;
  device?: { appVersion?: string; osVersion?: string; model?: string };
  lastSeenAt?: string;
  enabled?: boolean;
  subscribe?: { email?: boolean };
};

export type ImportFailure = {
  index: number;
  code: string;
  message: string;
  param: string | null;
};

export type ImportResult = {
  counts: {
    rows: number;
    subscribersCreated: number;
    subscriptionsCreated: number;
    subscriptionsUpdated: number;
    unchanged: number;
    failed: number;
  };
  failures: ImportFailure[];
};

export function importsResource(transport: Transport) {
  return {
    create(rows: ImportRow[]): Promise<ImportResult> {
      return transport.request({ method: 'POST', path: '/v1/imports', body: { rows } });
    },
  };
}

export type ImportsResource = ReturnType<typeof importsResource>;
