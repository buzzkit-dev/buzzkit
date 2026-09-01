import {
  type Duration,
  describeDuration,
  durationMs,
  type EventMatcher,
  type WaitForStep,
} from '@buzzkit/schema/workflows';
import { MAX_SETTLE_ROUNDS } from '../constants';
import type { RunContext } from '../context';
import type { WaitPayload } from '../types';

type Settled = {
  at: string;
  matched: boolean;
  eventName: string | null;
  dataJson: string | null;
  endedBy?: string | null;
};

function waitedMatchers(waitFor: WaitForStep['waitFor']): EventMatcher[] {
  if (waitFor.events !== undefined) return waitFor.events;

  return [
    { event: waitFor.event as string, ...(waitFor.where !== undefined ? { where: waitFor.where } : {}) },
  ];
}

function endMatchers(waitFor: WaitForStep['waitFor']): EventMatcher[] {
  return waitFor.endOn ?? [];
}

function resetEventNames(waitFor: WaitForStep['waitFor']): string[] {
  return (waitFor.resetOn ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.event));
}

function describeWaited(matchers: EventMatcher[]): string {
  return matchers.map((matcher) => matcher.event).join(' or ');
}

function received(payload: WaitPayload | null, waited: string, endedBy: string | null): string {
  if (endedBy) return `Ended by ${endedBy}`;
  if (!payload) return `No ${waited} in time`;
  return `Received ${payload.name === 'assumed' ? waited : payload.name}`;
}

async function settle(
  context: RunContext,
  current: WaitForStep,
  first: WaitPayload | null,
  deadline: number
): Promise<WaitPayload | null | false> {
  const { name, waitFor } = current;
  const settleMs = durationMs(waitFor.settleFor as Duration);
  const resetOn = resetEventNames(waitFor);
  const waitedEvent = (waitFor.event ?? waitedMatchers(waitFor)[0]?.event) as string;
  let latest = first;
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round += 1) {
    const suffix = round === 0 ? '' : `:${round}`;
    if (!latest) {
      latest = (await context.do(`${name}:since${suffix}`, async () => {
        const actor = await context.actor();
        const anchor = await actor.quietAnchor(waitedEvent, resetOn);
        if (!anchor) return null;
        return { name: anchor.name, dataJson: anchor.dataJson, timestamp: anchor.timestamp, id: anchor.id };
      })) as WaitPayload | null;
    }
    if (!latest) {
      await context.do(`${name}:listen${suffix}`, async () => {
        const actor = await context.actor();
        await actor.registerWait(
          context.params.runId,
          name,
          waitedEvent,
          waitFor.where ?? null,
          new Date(deadline).toISOString()
        );
        return {};
      });
      const arrived = await context.listen(name, `${name}:event${suffix}`, deadline - context.now());
      if (!arrived) return null;
      latest = arrived;
      continue;
    }
    const since = Date.parse(latest.timestamp);
    const remaining = Math.min(since + settleMs - context.now(), deadline - context.now());
    if (remaining <= 0) {
      return deadline - context.now() <= 0 && since + settleMs > context.now() ? null : latest;
    }
    await context.do(`${name}:watch${suffix}`, async () => {
      const actor = await context.actor();
      const expiresAt = new Date(context.now() + remaining).toISOString();
      for (const event of resetOn) {
        await actor.registerWait(context.params.runId, name, event, null, expiresAt);
      }
      return {};
    });
    const reset = await context.listen(name, `${name}:settle${suffix}`, remaining);
    if (!reset) return deadline - context.now() <= 0 ? null : latest;
    latest = null;
  }

  return false;
}

export async function runWaitFor(context: RunContext, current: WaitForStep): Promise<void> {
  const { name, waitFor } = current;
  const matchers = waitedMatchers(waitFor);
  const enders = endMatchers(waitFor);
  const endNames = new Set(enders.map((matcher) => matcher.event));
  const waited = describeWaited(matchers);
  const deadline = await context.deadline(waitFor.timeout);
  const expiresAt = new Date(deadline).toISOString();
  const settling = waitFor.settleFor ? ` and ${describeDuration(waitFor.settleFor)} of quiet` : '';

  if (!context.live) {
    const assumed = context.assumption(name);
    const outcome = assumed?.matched
      ? {
          name: 'assumed',
          dataJson: JSON.stringify(assumed.data ?? {}),
          timestamp: new Date(context.now()).toISOString(),
          id: 'assumed',
        }
      : null;
    await context.report(name, 'waiting', `Waiting for ${waited}${settling}`, { until: expiresAt });
    await context.sleep(
      `${name}:assumed`,
      outcome ? (waitFor.settleFor ? durationMs(waitFor.settleFor as Duration) : 0) : deadline - context.now()
    );
    await context.report(name, 'completed', received(outcome, waited, null), { matched: outcome !== null });
    context.state.steps[name] = {
      at: new Date(context.now()).toISOString(),
      matched: outcome !== null,
      event: outcome ? (matchers[0]?.event ?? null) : null,
      data: outcome ? (JSON.parse(outcome.dataJson) as Record<string, unknown>) : null,
    };

    return;
  }

  await context.do(`${name}:register`, async () => {
    const actor = await context.actor();
    for (const matcher of [...matchers, ...enders]) {
      await actor.registerWait(context.params.runId, name, matcher.event, matcher.where ?? null, expiresAt);
    }
    await context.report(name, 'waiting', `Waiting for ${waited}${settling}`, {
      until: expiresAt,
      ...(enders.length > 0 ? { endOn: enders.map((matcher) => matcher.event) } : {}),
      ...(waitFor.settleFor ? { settleFor: waitFor.settleFor, resetOn: resetEventNames(waitFor) } : {}),
    });
    return {};
  });

  let outcome: WaitPayload | null;
  if (waitFor.settleFor) {
    const result = await settle(context, current, null, deadline);
    outcome = result === false ? null : result;
  } else {
    outcome = await context.listen(name, `${name}:wait`, deadline - context.now());
  }

  const endedBy = outcome !== null && endNames.has(outcome.name) ? outcome.name : null;
  const matched = outcome !== null && endedBy === null;

  const settled = (await context.do(`${name}:settle`, async (t) => {
    const actor = await context.actor();
    await actor.deregisterWait(context.params.runId, name);
    t?.set('wait.matched', matched);
    if (endedBy) t?.set('wait.ended_by', endedBy);
    await context.report(name, 'completed', received(outcome, waited, endedBy), {
      matched,
      ...(endedBy ? { endedBy } : {}),
    });

    return {
      at: new Date(context.now()).toISOString(),
      matched,
      eventName: matched && outcome ? outcome.name : null,
      dataJson: matched ? (outcome?.dataJson ?? null) : null,
      endedBy,
    };
  })) as Settled;

  context.state.steps[name] = {
    at: settled.at,
    matched: settled.matched,
    event: settled.eventName,
    data: settled.dataJson ? (JSON.parse(settled.dataJson) as Record<string, unknown>) : null,
    ...(settled.endedBy ? { endedBy: settled.endedBy } : {}),
  };
}
