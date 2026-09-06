import type { PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Channel, CREDENTIAL_STATUSES, Deleted, Environment, Provider } from './common';
import { listPage } from './list';

export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export type Credential = {
  id: string;
  channel: Channel;
  provider: Provider;
  environment: Environment;
  details: Record<string, string>;
  status: CredentialStatus;
  validatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApnsCredentialParams = {
  provider: 'apns';
  p8: string;
  teamId: string;
  keyId: string;
  bundleId: string;
  environment?: Environment;
};

export type FcmCredentialParams = {
  provider: 'fcm';
  serviceAccount: string | Record<string, unknown>;
};

export type ResendCredentialParams = {
  provider: 'resend';
  apiKey: string;
};

export type CreateCredentialParams = ApnsCredentialParams | FcmCredentialParams | ResendCredentialParams;

export function credentialsResource(transport: Transport) {
  return {
    list(): PagePromise<Credential> {
      return listPage(transport, '/v1/credentials', {});
    },

    async create(params: CreateCredentialParams): Promise<Credential[]> {
      const page = await transport.request<{ items: Credential[] }>({
        method: 'POST',
        path: '/v1/credentials',
        body: params,
      });
      return page.items;
    },

    retrieve(id: string): Promise<Credential> {
      return transport.request({ method: 'GET', path: `/v1/credentials/${encodeSegment(id)}` });
    },

    remove(id: string): Promise<Deleted<Credential>> {
      return transport.request({ method: 'DELETE', path: `/v1/credentials/${encodeSegment(id)}` });
    },

    validate(id: string): Promise<Credential> {
      return transport.request({ method: 'POST', path: `/v1/credentials/${encodeSegment(id)}/validate` });
    },
  };
}

export type CredentialsResource = ReturnType<typeof credentialsResource>;
