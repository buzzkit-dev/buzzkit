import { encodeId } from '@buzzkit/api/libs/sqids';
import type { Expression } from 'buzzkit/expressions';
import type { Segment, SegmentVersion } from './types';

export function serializeSegment(segment: Segment, version: SegmentVersion | null) {
  return {
    id: encodeId('segment', segment.id),
    slug: segment.slug,
    name: segment.name,
    description: segment.description,
    version: version
      ? {
          id: encodeId('segmentVersion', version.id),
          number: version.version,
          expression: version.expression as Expression,
          createdAt: version.createdAt,
        }
      : null,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}
