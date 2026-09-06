import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Expression } from '../expressions/index';
import type { Deleted } from './common';
import { listPage } from './list';
import type { SubscriberListItem } from './subscribers';

export type SegmentVersion = {
  id: string;
  number: number;
  expression: Expression;
  createdAt: string;
};

export type Segment = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: SegmentVersion | null;
  createdAt: string;
  updatedAt: string;
};

export type SegmentPreview = {
  count: number;
  sample: SubscriberListItem[];
};

export type CreateSegmentParams = {
  slug: string;
  name: string;
  description?: string;
  expression: Expression;
};

export type UpdateSegmentParams = {
  name?: string;
  description?: string | null;
  expression?: Expression;
};

export function segmentsResource(transport: Transport) {
  return {
    list(): PagePromise<Segment> {
      return listPage(transport, '/v1/segments', {});
    },

    create(params: CreateSegmentParams): Promise<Segment> {
      return transport.request({ method: 'POST', path: '/v1/segments', body: params });
    },

    preview(expression: Expression): Promise<SegmentPreview> {
      return transport.request({ method: 'POST', path: '/v1/segments/preview', body: { expression } });
    },

    retrieve(slug: string): Promise<Segment> {
      return transport.request({ method: 'GET', path: `/v1/segments/${encodeSegment(slug)}` });
    },

    update(slug: string, params: UpdateSegmentParams): Promise<Segment> {
      return transport.request({
        method: 'PATCH',
        path: `/v1/segments/${encodeSegment(slug)}`,
        body: params,
      });
    },

    remove(slug: string): Promise<Deleted<Segment>> {
      return transport.request({ method: 'DELETE', path: `/v1/segments/${encodeSegment(slug)}` });
    },

    members(slug: string, params: PageParams = {}): PagePromise<SubscriberListItem> {
      return listPage(transport, `/v1/segments/${encodeSegment(slug)}/members`, params);
    },
  };
}

export type SegmentsResource = ReturnType<typeof segmentsResource>;
