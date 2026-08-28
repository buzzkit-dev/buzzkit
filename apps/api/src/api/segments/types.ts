import type { tables } from '@buzzkit/database';
import type { Expression } from 'buzzkit/expressions';

export type Segment = typeof tables.segment.$inferSelect;
export type SegmentVersion = typeof tables.segmentVersion.$inferSelect;

export type SegmentWithVersion = Segment & { version: SegmentVersion };

export type SegmentInput = {
  slug: string;
  name: string;
  description?: string | null;
  expression: Expression;
};

export type MemberRow = { subscriber_id: number; external_id: string };

export type MemberPage = {
  items: MemberRow[];
  hasMore: boolean;
  nextCursor: number | null;
};
