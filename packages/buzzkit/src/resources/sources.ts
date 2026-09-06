import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type {
  SourceMapping as GrammarSourceMapping,
  SourceProvider as GrammarSourceProvider,
  SourceStatus as GrammarSourceStatus,
  Verification as GrammarVerification,
} from '../sources/index';
import type { Deleted, SOURCE_DELIVERY_OUTCOMES } from './common';
import { listPage } from './list';

export type SourcePreset = GrammarSourceProvider;

export type SourceProvider = SourcePreset | (string & {});

export type SourceStatus = GrammarSourceStatus;

export type SourceMapping = GrammarSourceMapping;

export type SourceVerification = GrammarVerification;

export type Source = {
  id: string;
  name: string;
  provider: SourceProvider;
  status: SourceStatus;
  url: string;
  mapping: SourceMapping;
  verification: SourceVerification;
  hasSecret: boolean;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceDeliveryOutcome = (typeof SOURCE_DELIVERY_OUTCOMES)[number];

export type SourceDelivery = {
  id: string;
  sourceId: string;
  providerEventId: string | null;
  providerType: string | null;
  outcome: SourceDeliveryOutcome;
  reason: string | null;
  detail: string | null;
  subscriberId: string | null;
  event: string | null;
  eventId: string | null;
  payload: unknown;
  receivedAt: string;
};

export type CreateSourceParams = {
  name: string;
  provider: SourceProvider;
  verification?: SourceVerification;
  mapping?: SourceMapping;
  secret?: string;
};

export type UpdateSourceParams = Partial<CreateSourceParams> & {
  status?: 'active' | 'paused';
};

export type SourcePreviewParams = {
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  mapping?: SourceMapping;
};

export type SourcePreview =
  | {
      outcome: 'dropped';
      reason: string;
      detail: string;
      suggestions: unknown;
    }
  | {
      outcome: 'event';
      event: Record<string, unknown> & { externalId: string };
      suggestions: unknown;
    };

export type ListSourceDeliveriesParams = PageParams & {
  outcome?: SourceDeliveryOutcome;
};

export function sourcesResource(transport: Transport) {
  const base = (id: string) => `/v1/sources/${encodeSegment(id)}`;

  return {
    list(): PagePromise<Source> {
      return listPage(transport, '/v1/sources', {});
    },

    create(params: CreateSourceParams): Promise<Source> {
      return transport.request({ method: 'POST', path: '/v1/sources', body: params });
    },

    retrieve(id: string): Promise<Source> {
      return transport.request({ method: 'GET', path: base(id) });
    },

    update(id: string, params: UpdateSourceParams): Promise<Source> {
      return transport.request({ method: 'PATCH', path: base(id), body: params });
    },

    remove(id: string): Promise<Deleted<Source>> {
      return transport.request({ method: 'DELETE', path: base(id) });
    },

    preview(id: string, params: SourcePreviewParams): Promise<SourcePreview> {
      return transport.request({ method: 'POST', path: `${base(id)}/preview`, body: params });
    },

    deliveries(id: string, params: ListSourceDeliveriesParams = {}): PagePromise<SourceDelivery> {
      return listPage(transport, `${base(id)}/deliveries`, params);
    },
  };
}

export type SourcesResource = ReturnType<typeof sourcesResource>;
