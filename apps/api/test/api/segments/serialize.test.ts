import {
  CreateSegmentSchema,
  PreviewSegmentSchema,
  type Segment,
  type SegmentVersion,
  serializeSegment,
  UpdateSegmentSchema,
} from '@buzzkit/api/api/segments/index';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { TypeCompiler } from 'elysia/type-system';
import { describe, expect, it } from 'vitest';

const at = new Date('2026-08-20T10:00:00.000Z');
const later = new Date('2026-08-21T10:00:00.000Z');

const segment: Segment = {
  id: 12,
  tenantId: 3,
  slug: 'active-pro',
  name: 'Active pro users',
  description: 'Pro plan, opened the app this month',
  currentVersionId: 34,
  createdAt: at,
  updatedAt: later,
  deletedAt: null,
};

const version: SegmentVersion = {
  id: 34,
  segmentId: 12,
  version: 2,
  expression: { all: [{ ref: 'attributes.plan', eq: 'pro' }, { lastSeen: { within: '30d' } }] },
  createdAt: later,
};

describe('serializeSegment', () => {
  it('exposes the public shape with prefixed ids and the current version', () => {
    expect(serializeSegment(segment, version)).toEqual({
      id: encodeId('segment', 12),
      slug: 'active-pro',
      name: 'Active pro users',
      description: 'Pro plan, opened the app this month',
      version: {
        id: encodeId('segmentVersion', 34),
        number: 2,
        expression: version.expression,
        createdAt: later,
      },
      createdAt: at,
      updatedAt: later,
    });
    expect(serializeSegment(segment, version).id).toMatch(/^seg_/);
    expect(serializeSegment(segment, version).version?.id).toMatch(/^sgv_/);
  });

  it('never leaks internal columns', () => {
    const serialized = serializeSegment(segment, null);
    expect(serialized.version).toBeNull();
    for (const key of ['tenantId', 'currentVersionId', 'deletedAt']) {
      expect(serialized, key).not.toHaveProperty(key);
    }
  });
});

describe('segment schemas', () => {
  const create = TypeCompiler.Compile(CreateSegmentSchema);
  const update = TypeCompiler.Compile(UpdateSegmentSchema);
  const preview = TypeCompiler.Compile(PreviewSegmentSchema);
  const expression = { all: [{ channel: 'push' }, { count: 'workout.completed', gte: 1 }] };

  it('requires slug, name and an expression to create', () => {
    expect(create.Check({ slug: 'active', name: 'Active', expression })).toBe(true);
    expect(create.Check({ slug: 'active', name: 'Active', description: 'x', expression })).toBe(true);
    expect(create.Check({ slug: 'Active', name: 'Active', expression })).toBe(false);
    expect(create.Check({ slug: 'active', name: '', expression })).toBe(false);
    expect(create.Check({ slug: 'active', name: 'Active' })).toBe(false);
    expect(create.Check({ slug: 'active', name: 'Active', expression: { channel: 'fax' } })).toBe(false);
    expect(create.Check({ slug: 'active', name: 'Active', description: 'x'.repeat(501), expression })).toBe(
      false
    );
  });

  it('lets updates change any subset, clearing the description with null', () => {
    expect(update.Check({})).toBe(true);
    expect(update.Check({ name: 'Renamed' })).toBe(true);
    expect(update.Check({ description: null })).toBe(true);
    expect(update.Check({ expression })).toBe(true);
    expect(update.Check({ expression: {} })).toBe(false);
  });

  it('previews an expression only', () => {
    expect(preview.Check({ expression })).toBe(true);
    expect(preview.Check({})).toBe(false);
  });
});
