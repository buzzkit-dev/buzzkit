import type { PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Deleted } from './common';
import { listPage } from './list';

export type Secret = {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function secretsResource(transport: Transport) {
  return {
    list(): PagePromise<Secret> {
      return listPage(transport, '/v1/secrets', {});
    },

    retrieve(name: string): Promise<Secret> {
      return transport.request({ method: 'GET', path: `/v1/secrets/${encodeSegment(name)}` });
    },

    upsert(name: string, value: string): Promise<Secret> {
      return transport.request({
        method: 'PUT',
        path: `/v1/secrets/${encodeSegment(name)}`,
        body: { value },
      });
    },

    remove(name: string): Promise<Deleted<Secret>> {
      return transport.request({ method: 'DELETE', path: `/v1/secrets/${encodeSegment(name)}` });
    },
  };
}

export type SecretsResource = ReturnType<typeof secretsResource>;
