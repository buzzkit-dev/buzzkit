import {
  ACTIVITY_SCHEMA_VERSION,
  DISPLAYED_SESSIONS,
  deriveActivity,
} from '@buzzkit/ping/api/sessions/index';
import { describe, expect, it } from 'vitest';
import { NOW, session } from '../../utils/session';

describe('deriveActivity', () => {
  it('shows the single session in full when only one is live', () => {
    const state = deriveActivity([session({ title: 'Running migrations', body: '3 of 7' })], NOW);

    expect(state.headline).toBe('Running migrations');
    expect(state.detail).toBe('3 of 7');
    expect(state.live).toBe(1);
  });

  it('collapses several working sessions into a count', () => {
    const state = deriveActivity([session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })], NOW);

    expect(state.headline).toBe('3 agents working');
    expect(state.live).toBe(3);
  });

  it('floats a waiting session above working ones', () => {
    const state = deriveActivity(
      [
        session({ id: 'a', status: 'working', updatedAt: NOW }),
        session({ id: 'b', status: 'waiting', updatedAt: NOW - 10_000 }),
      ],
      NOW
    );

    expect(state.sessions[0].id).toBe('b');
    expect(state.headline).toBe('Waiting on you');
    expect(state.waiting).toBe(1);
  });

  it('counts multiple waiting sessions in the headline', () => {
    const state = deriveActivity(
      [
        session({ id: 'a', status: 'waiting' }),
        session({ id: 'b', status: 'waiting' }),
        session({ id: 'c', status: 'working' }),
      ],
      NOW
    );

    expect(state.headline).toBe('2 waiting on you');
  });

  it('leads with failures while other agents keep working', () => {
    const state = deriveActivity(
      [session({ id: 'a', status: 'working' }), session({ id: 'b', status: 'failed' })],
      NOW
    );

    expect(state.headline).toBe('1 failed');
    expect(state.sessions[0].id).toBe('b');
  });

  it('reads done once every session has finished', () => {
    const state = deriveActivity(
      [session({ id: 'a', status: 'done' }), session({ id: 'b', status: 'done' })],
      NOW
    );

    expect(state.headline).toBe('Done');
  });

  it('orders waiting, then failed, then done, then working', () => {
    const state = deriveActivity(
      [
        session({ id: 'working', status: 'working' }),
        session({ id: 'failed', status: 'failed' }),
        session({ id: 'waiting', status: 'waiting' }),
        session({ id: 'done', status: 'done' }),
      ],
      NOW
    );

    expect(state.sessions.map((entry) => entry.id)).toEqual(['waiting', 'failed', 'done', 'working']);
  });

  it('averages progress across working sessions only', () => {
    const state = deriveActivity(
      [
        session({ id: 'a', progress: 0.2 }),
        session({ id: 'b', progress: 0.8 }),
        session({ id: 'c', status: 'done', progress: 1 }),
      ],
      NOW
    );

    expect(state.progress).toBe(0.5);
  });

  it('derives progress from steps when no fraction is given', () => {
    const state = deriveActivity([session({ stepCurrent: 3, stepTotal: 4 })], NOW);

    expect(state.progress).toBe(0.75);
  });

  it('reports no progress when nothing measurable is running', () => {
    const state = deriveActivity([session({ status: 'waiting' })], NOW);

    expect(state.progress).toBeNull();
  });

  it('caps the displayed list and reports the overflow', () => {
    const many = Array.from({ length: DISPLAYED_SESSIONS + 3 }, (_, index) =>
      session({ id: `session-${index}` })
    );
    const state = deriveActivity(many, NOW);

    expect(state.sessions).toHaveLength(DISPLAYED_SESSIONS);
    expect(state.overflow).toBe(3);
  });

  it('stamps the schema version on every state', () => {
    expect(deriveActivity([], NOW).version).toBe(ACTIVITY_SCHEMA_VERSION);
    expect(deriveActivity([session()], NOW).version).toBe(ACTIVITY_SCHEMA_VERSION);
  });

  it('is all clear with no sessions', () => {
    const state = deriveActivity([], NOW);

    expect(state.headline).toBe('All clear');
    expect(state.detail).toBeNull();
    expect(state.live).toBe(0);
  });

  it('floats a waiting session to the top and headlines it', () => {
    const state = deriveActivity(
      [
        session({ id: 'a', status: 'working' }),
        session({ id: 'b', status: 'waiting', title: 'Approve the migration?' }),
      ],
      NOW
    );

    expect(state.sessions[0].id).toBe('b');
    expect(state.headline).toBe('Waiting on you');
  });
});
