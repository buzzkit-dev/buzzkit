import { recordSystemEvents, subscriberAttributes } from '@buzzkit/api/api/events/index';
import { findSubscriberByExternalId, upsertSubscriber } from '@buzzkit/api/api/subscribers/index';
import { stepDb } from '@buzzkit/api/libs/database';
import type { SetStep } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';
import { describeValue, renderTemplateValue } from '../template';

type SetResult = { at: string; valueJson: string };

function customAttributes(attributes: unknown): Record<string, unknown> {
  if (attributes === null || typeof attributes !== 'object') return {};
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !key.startsWith('$')));
}

async function write(context: RunContext, current: SetStep): Promise<SetResult> {
  const { name, set } = current;
  const value =
    typeof set.value === 'string'
      ? renderTemplateValue(set.value, context.scope(), context.rendering())
      : set.value;
  const valueJson = JSON.stringify(value ?? null);
  if ('var' in set) {
    await context.report(name, 'completed', `Set ${set.var} to ${describeValue(value)}`, {
      var: set.var,
      value,
    });
    return { at: new Date(context.now()).toISOString(), valueJson };
  }

  if (!context.live) {
    await context.report(name, 'completed', `Would set ${set.attribute} to ${describeValue(value)}`, {
      attribute: set.attribute,
      value,
    });
    return { at: new Date(context.now()).toISOString(), valueJson };
  }

  const db = stepDb();
  const { tenantId, externalId } = context.params;
  const existing = await findSubscriberByExternalId(db, tenantId, externalId);
  const attributes = customAttributes(existing.attributes);
  if (value === null || value === undefined) delete attributes[set.attribute];
  else attributes[set.attribute] = value;
  const { subscriber, changed } = await upsertSubscriber(db, tenantId, externalId, { attributes });
  if (changed) {
    await recordSystemEvents(tenantId, subscriber, [
      { name: 'subscriber.updated', data: { externalId, attributes: subscriberAttributes(subscriber) } },
    ]);
  }
  await context.report(name, 'completed', `Set ${set.attribute} to ${describeValue(value)}`, {
    attribute: set.attribute,
    value,
  });

  return { at: new Date(context.now()).toISOString(), valueJson };
}

export async function runSet(context: RunContext, current: SetStep): Promise<void> {
  const { name, set } = current;
  const result = await context.do(`${name}:set`, () => write(context, current));
  const value = JSON.parse(result.valueJson) as unknown;
  context.state.steps[name] = { at: result.at, value };
  if ('var' in set) context.state.vars[set.var] = value;
  else if (value === null) delete context.params.attributes[set.attribute];
  else context.params.attributes[set.attribute] = value;
}
