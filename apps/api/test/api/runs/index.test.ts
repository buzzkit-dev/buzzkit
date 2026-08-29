import { emptyRunCounts, encodeRunCursor, parseRunId, resolveRunCursor } from '@buzzkit/api/api/runs/index';
import { describe, expect, it } from 'vitest';

describe('parseRunId', () => {
  it('splits a run id into its tenant, workflow, subscriber and trigger sequence', () => {
    expect(parseRunId('12-wf_AbC9-340-7')).toEqual({
      tenantId: 12,
      workflowId: 'wf_AbC9',
      subscriberId: 340,
      sequence: 7,
    });
  });

  it('rejects anything else', () => {
    for (const id of ['', 'nope', '12-wf_AbC9-340', 'a-wf_x-1-1', '12-msg_x-1-1', '12-wf_x-1-1-1']) {
      expect(parseRunId(id)).toBeNull();
    }
  });
});

describe('run cursors', () => {
  it('round-trips the start time and the run id', () => {
    const cursor = encodeRunCursor({ started_at: '2026-08-29 10:00:00.123', run_id: '1-wf_a-2-3' });
    expect(cursor).toBe('2026-08-29T10:00:00.123Z_1-wf_a-2-3');
    expect(resolveRunCursor(cursor)).toEqual({ startedAt: '2026-08-29T10:00:00.123Z', id: '1-wf_a-2-3' });
    expect(resolveRunCursor(undefined)).toBeUndefined();
  });

  it('refuses a cursor without a valid time or run id', () => {
    expect(() => resolveRunCursor('garbage')).toThrow('Invalid cursor');
    expect(() => resolveRunCursor('2026-08-29T10:00:00.000Z_msg_1')).toThrow('Invalid cursor');
  });
});

describe('emptyRunCounts', () => {
  it('starts every status and step at zero', () => {
    expect(emptyRunCounts()).toEqual({ running: 0, sleeping: 0, waiting: 0, steps: {} });
  });
});
