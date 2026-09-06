import { describe, expect, it } from 'vitest';
import { SOURCE_PROVIDERS, SOURCE_STATUSES } from '../../src/sources/index';
import {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  FETCH_ERROR_MODES,
  FETCH_METHODS,
  INTERRUPTION_LEVELS,
  SEND_CHANNELS,
  SEND_POLICY_MODES,
  SEND_PRIORITIES,
  SINCE_ANCHORS,
  STEP_KINDS,
  TEMPLATE_FILTERS,
  TRIGGER_SOURCES,
} from '../../src/workflows/index';

const WORKFLOW_VOCABULARIES = {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  FETCH_ERROR_MODES,
  FETCH_METHODS,
  INTERRUPTION_LEVELS,
  SEND_CHANNELS,
  SEND_POLICY_MODES,
  SEND_PRIORITIES,
  SINCE_ANCHORS,
  STEP_KINDS,
  TEMPLATE_FILTERS,
  TRIGGER_SOURCES,
};

describe('the workflow grammar', () => {
  it('publishes every vocabulary as a non-empty list of unique lowercase names', () => {
    for (const [name, values] of Object.entries(WORKFLOW_VOCABULARIES)) {
      expect(values.length, name).toBeGreaterThan(0);
      expect(new Set(values).size, name).toBe(values.length);
      for (const value of values) expect(typeof value, `${name}.${String(value)}`).toBe('string');
    }
  });

  it('keeps the step kinds the engine dispatches on', () => {
    for (const kind of ['send', 'wait', 'branch', 'fetch', 'set', 'exit']) {
      expect(STEP_KINDS, kind).toContain(kind);
    }
  });

  it('keeps the trigger sources the API accepts', () => {
    expect([...TRIGGER_SOURCES].sort()).toEqual(
      ['android', 'ios', 'server', 'system', 'web', 'webhook'].sort()
    );
  });
});

describe('the source grammar', () => {
  it('publishes the presets and statuses', () => {
    expect([...SOURCE_PROVIDERS].sort()).toEqual(['custom', 'revenuecat', 'stripe', 'superwall']);
    expect([...SOURCE_STATUSES].sort()).toEqual(['active', 'paused', 'unverified']);
  });
});
