import type { CancelRule, WorkflowSpec } from '@buzzkit/schema/workflows';
import type { Expression } from 'buzzkit/expressions';
import { ConditionChips } from '@/app/components/conditions/chips';
import {
  type ConditionKind,
  type ConditionTree,
  conditionPart,
  negate,
  refPart,
} from '@/app/components/conditions/describe';
import { describeSchedule } from '@/app/components/workflows/describe';

const REF_NAMESPACES: Array<{ prefix: string; kind: ConditionKind }> = [
  { prefix: 'trigger.data.', kind: 'event' },
  { prefix: 'event.data.', kind: 'event' },
  { prefix: 'subscriber.attributes.', kind: 'attribute' },
  { prefix: 'steps.', kind: 'step' },
  { prefix: 'vars.', kind: 'step' },
];

export function whereTree(node: unknown): ConditionTree | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.all)) return { kind: 'group', match: 'all', children: children(record.all) };
  if (Array.isArray(record.any)) return { kind: 'group', match: 'any', children: children(record.any) };
  if (record.not) {
    const inner = whereTree(record.not);
    return inner?.kind === 'leaf' ? { kind: 'leaf', part: negate(inner.part) } : inner;
  }
  const ref = record.ref;
  if (typeof ref !== 'string') return { kind: 'leaf', part: conditionPart(node as Expression) };
  const namespace = REF_NAMESPACES.find((entry) => ref.startsWith(entry.prefix));
  const subject = namespace && namespace.prefix !== 'vars.' ? ref.slice(namespace.prefix.length) : ref;
  return { kind: 'leaf', part: refPart(namespace?.kind ?? 'attribute', subject, record) };
}

function children(nodes: unknown[]): ConditionTree[] {
  return nodes.map(whereTree).filter((tree): tree is ConditionTree => tree !== null);
}

export function triggerTree(spec: WorkflowSpec): ConditionTree {
  const { trigger } = spec;
  const where = whereTree(trigger.where);
  if ('schedule' in trigger) {
    return {
      kind: 'group',
      match: 'all',
      children: [
        {
          kind: 'leaf',
          part: { kind: 'trigger', subject: '', operator: 'runs', value: describeSchedule(trigger.schedule) },
        },
        ...(trigger.segment
          ? [
              {
                kind: 'leaf' as const,
                part: { kind: 'source' as const, subject: '', operator: 'in', value: trigger.segment },
              },
            ]
          : []),
        ...(where ? [where] : []),
      ],
    };
  }
  return {
    kind: 'group',
    match: 'all',
    children: [
      { kind: 'leaf', part: { kind: 'trigger', subject: '', operator: 'on', value: trigger.event } },
      ...(trigger.sources?.length
        ? [
            {
              kind: 'leaf' as const,
              part: {
                kind: 'source' as const,
                subject: '',
                operator: 'from',
                value: trigger.sources.join(', '),
              },
            },
          ]
        : []),
      ...(where ? [where] : []),
    ],
  };
}

export function TriggerConditions({
  spec,
  limit,
  wrap,
}: {
  spec: WorkflowSpec;
  limit?: number;
  wrap?: boolean;
}) {
  return <ConditionChips tree={triggerTree(spec)} limit={limit} wrap={wrap} />;
}

export function CancelConditions({ rule, wrap }: { rule: CancelRule; wrap?: boolean }) {
  const where = whereTree(rule.where);
  return (
    <ConditionChips
      tree={{
        kind: 'group',
        match: 'all',
        children: [
          { kind: 'leaf', part: { kind: 'trigger', subject: '', operator: 'on', value: rule.event } },
          ...(where ? [where] : []),
        ],
      }}
      limit={8}
      wrap={wrap}
    />
  );
}
