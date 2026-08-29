import { type Anchor, durationSeconds, type WaitForStep } from 'buzzkit/workflows';
import { MIN_WAIT_FOR_MS } from '../constants';
import type { RunContext } from '../context';
import type { WaitPayload } from '../types';

type Settled = { at: string; matched: boolean; eventName: string | null; dataJson: string | null };

export async function runWaitFor(context: RunContext, current: WaitForStep): Promise<void> {
  const { name, waitFor } = current;
  const timeoutMs =
    typeof waitFor.until === 'string'
      ? durationSeconds(waitFor.until) * 1000
      : (await context.do(`${name}:resolve`, async () => context.anchor(waitFor.until as Anchor))) -
        Date.now();
  const expiresAt = new Date(Date.now() + Math.max(0, timeoutMs)).toISOString();

  await context.do(`${name}:register`, async () => {
    const actor = await context.actor();
    await actor.registerWait(context.params.runId, name, waitFor.event, waitFor.where ?? null, expiresAt);
    await context.report(name, 'waiting', `Waiting for ${waitFor.event}`, { until: expiresAt });
    return {};
  });

  const received = await listen(context, name, timeoutMs);

  const settled = (await context.do(`${name}:settle`, async () => {
    const actor = await context.actor();
    await actor.deregisterWait(context.params.runId, name);
    await context.report(
      name,
      'completed',
      received ? `Received ${received.name}` : `No ${waitFor.event} in time`,
      { matched: received !== null }
    );
    return {
      at: new Date().toISOString(),
      matched: received !== null,
      eventName: received?.name ?? null,
      dataJson: received?.dataJson ?? null,
    };
  })) as Settled;

  context.state.steps[name] = {
    at: settled.at,
    matched: settled.matched,
    event: settled.eventName,
    data: settled.dataJson ? (JSON.parse(settled.dataJson) as Record<string, unknown>) : null,
  };
}

async function listen(context: RunContext, name: string, timeoutMs: number): Promise<WaitPayload | null> {
  try {
    const result = await context.step.waitForEvent<WaitPayload>(`${name}:wait`, {
      type: `evt:${name}`,
      timeout: context.scaled(Math.max(MIN_WAIT_FOR_MS, timeoutMs)),
    });
    return result.payload;
  } catch {
    return null;
  }
}
