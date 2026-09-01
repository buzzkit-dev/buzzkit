import { describeFailure } from '@buzzkit/api/engine/errors';
import { describe, expect, it } from 'vitest';

describe('describeFailure', () => {
  it('uses the message of an Error and stringifies everything else', () => {
    expect(describeFailure(new Error('boom'))).toBe('boom');
    expect(describeFailure('plain')).toBe('plain');
    expect(describeFailure(42)).toBe('42');
  });
});
