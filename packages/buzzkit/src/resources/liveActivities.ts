import type { Transport } from '../core/transport';
import type { LIVE_ACTIVITY_EVENTS } from './common';

export type LiveActivityEvent = (typeof LIVE_ACTIVITY_EVENTS)[number];

export type LiveActivityAlert = {
  title?: string;
  body?: string;
  sound?: string;
};

export type SendLiveActivityParams = {
  to: string;
  event: LiveActivityEvent;
  activityId?: string;
  attributesType?: string;
  contentState: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  alert?: LiveActivityAlert;
  staleDate?: string;
  dismissalDate?: string;
  priority?: 'high' | 'normal';
  timestamp?: number;
};

export type LiveActivityResult = {
  id: string;
  ok: boolean;
  code?: string;
  reason?: string;
};

export function liveActivitiesResource(transport: Transport) {
  return {
    send(params: SendLiveActivityParams): Promise<{ results: LiveActivityResult[] }> {
      return transport.request({ method: 'POST', path: '/v1/live-activities/send', body: params });
    },
  };
}

export type LiveActivitiesResource = ReturnType<typeof liveActivitiesResource>;
