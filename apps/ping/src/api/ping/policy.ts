import type { SessionStatus } from '@buzzkit/ping/api/sessions/index';

export type InterruptionLevel = 'passive' | 'active';

export type DeliveryPolicy = {
  notify: boolean;
  interruptionLevel: InterruptionLevel;
  collapseId: string | null;
  threadId: string | null;
};

export type DeliveryConditions = {
  kind: 'notification' | 'session';
  session: string | null;
  status: SessionStatus | null;
  statusChanged: boolean;
  silent: boolean;
  present: boolean;
  hasActivity: boolean;
};

export function resolveDeliveryPolicy(conditions: DeliveryConditions): DeliveryPolicy {
  const { kind, session, status, statusChanged, silent, present, hasActivity } = conditions;
  const grouping = {
    collapseId: session,
    threadId: session,
  };

  if (kind === 'notification') {
    return {
      notify: !present,
      interruptionLevel: silent ? 'passive' : 'active',
      collapseId: null,
      threadId: null,
    };
  }

  if (hasActivity) {
    return { notify: false, interruptionLevel: 'passive', ...grouping };
  }

  const terminal = status === 'done' || status === 'failed';
  const level = terminal || statusChanged ? 'active' : 'passive';

  return { notify: !present, interruptionLevel: silent ? 'passive' : level, ...grouping };
}
