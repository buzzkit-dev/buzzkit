import type { CancelRule, WorkflowSpec } from 'buzzkit/workflows';
import { ConditionChips } from '@/app/components/segments/conditions';
import { type ConditionKind, type ConditionTree, negate, refPart } from '@/app/components/segments/describe';

const REF_NAMESPACES: Array<{ prefix: string; kind: ConditionKind }> = [
  { prefix: 'trigger.data.', kind: 'event' },
  { prefix: 'event.data.', kind: 'event' },
  { prefix: 'subscriber.attributes.', kind: 'attribute' },
  { prefix: 'steps.', kind: 'step' },
];

function whereTree(node: unknown): ConditionTree | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.all)) return { kind: 'group', match: 'all', children: children(record.all) };
  if (Array.isArray(record.any)) return { kind: 'group', match: 'any', children: children(record.any) };
  if (record.not) {
    const inner = whereTree(record.not);
    return inner?.kind === 'leaf' ? { kind: 'leaf', part: negate(inner.part) } : inner;
  }
  const ref = record.ref;
  if (typeof ref !== 'string') return null;
  const namespace = REF_NAMESPACES.find((entry) => ref.startsWith(entry.prefix));
  const subject = namespace ? ref.slice(namespace.prefix.length) : ref;
  return { kind: 'leaf', part: refPart(namespace?.kind ?? 'attribute', subject, record) };
}

function children(nodes: unknown[]): ConditionTree[] {
  return nodes.map(whereTree).filter((tree): tree is ConditionTree => tree !== null);
}

export function triggerTree(spec: WorkflowSpec): ConditionTree {
  const { trigger } = spec;
  const where = whereTree(trigger.where);
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
