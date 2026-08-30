import {
  type Duration,
  describeDuration,
  durationSeconds,
  type WaitForStep,
} from '@buzzkit/schema/workflows';
import { MAX_SETTLE_ROUNDS } from '../constants';
import type { RunContext } from '../context';
import type { WaitPayload } from '../types';

type Settled = { at: string; matched: boolean; eventName: string | null; dataJson: string | null };

function received(payload: WaitPayload | null, event: string): string {
  if (!payload) return `No ${event} in time`;
  return `Received ${payload.name === 'assumed' ? event : payload.name}`;
}

async function settle(
  context: RunContext,
  current: WaitForStep,
  first: WaitPayload | null,
  deadline: number
): Promise<WaitPayload | null | false> {
  const { name, waitFor } = current;
  const settleMs = durationSeconds(waitFor.settleFor as Duration) * 1000;
  const resetOn = waitFor.resetOn ?? [];
  let latest = first;
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round += 1) {
    const suffix = round === 0 ? '' : `:${round}`;
    const since = latest
      ? latest.timestamp
      : await context.do(`${name}:since${suffix}`, async () => {
          const actor = await context.actor();
          return await actor.quietSince(waitFor.event, resetOn);
        });
    if (since === null) {
      await context.do(`${name}:listen${suffix}`, async () => {
        const actor = await context.actor();
        await actor.registerWait(
          context.params.runId,
          name,
          waitFor.event,
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
    const remaining = Math.min(Date.parse(since) + settleMs - context.now(), deadline - context.now());
    if (remaining <= 0)
      return deadline - context.now() <= 0 && Date.parse(since) + settleMs > context.now() ? null : latest;
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
    await context.report(name, 'waiting', `Waiting for ${waitFor.event}${settling}`, { until: expiresAt });
    await context.sleep(
      `${name}:assumed`,
      outcome
        ? waitFor.settleFor
          ? durationSeconds(waitFor.settleFor as Duration) * 1000
          : 0
        : deadline - context.now()
    );
    await context.report(name, 'completed', received(outcome, waitFor.event), { matched: outcome !== null });
    context.state.steps[name] = {
      at: new Date(context.now()).toISOString(),
      matched: outcome !== null,
      event: outcome ? waitFor.event : null,
      data: outcome ? (JSON.parse(outcome.dataJson) as Record<string, unknown>) : null,
    };
    return;
  }

  await context.do(`${name}:register`, async () => {
    const actor = await context.actor();
    await actor.registerWait(context.params.runId, name, waitFor.event, waitFor.where ?? null, expiresAt);
    await context.report(name, 'waiting', `Waiting for ${waitFor.event}${settling}`, {
      until: expiresAt,
      ...(waitFor.settleFor ? { settleFor: waitFor.settleFor, resetOn: waitFor.resetOn } : {}),
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

  const settled = (await context.do(`${name}:settle`, async () => {
    const actor = await context.actor();
    await actor.deregisterWait(context.params.runId, name);
    await context.report(name, 'completed', received(outcome, waitFor.event), { matched: outcome !== null });
    return {
      at: new Date(context.now()).toISOString(),
      matched: outcome !== null,
      eventName: outcome ? waitFor.event : null,
      dataJson: outcome?.dataJson ?? null,
    };
  })) as Settled;

  context.state.steps[name] = {
    at: settled.at,
    matched: settled.matched,
    event: settled.eventName,
    data: settled.dataJson ? (JSON.parse(settled.dataJson) as Record<string, unknown>) : null,
  };
}
