import { Badge } from '@buzzkit/ui/components/badge';
import type { IconName } from '@buzzkit/ui/components/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@buzzkit/ui/components/tooltip';
import { cn } from '@buzzkit/ui/lib/utils';
import type { Expression } from 'buzzkit/expressions';
import { type ConditionPart, type ConditionTree, conditionLeaves, conditionTree } from './describe';

const VISIBLE = 2;

const ROW_CHARACTERS = 66;

type Tone = 'row' | 'tooltip';

const TONES: Record<Tone, { badge: string; strong: string }> = {
  row: { badge: '', strong: 'text-fg-4' },
  tooltip: { badge: 'bg-background/15 text-background/60', strong: 'text-background' },
};

function iconFor(part: ConditionPart): IconName {
  switch (part.kind) {
    case 'attribute':
      return 'IconUserFilled';
    case 'event':
      return 'IconZapFilled';
    case 'activity':
      return 'IconClock';
    case 'channel':
      return part.value === 'email'
        ? 'IconEmail2Filled'
        : part.value === 'sms'
          ? 'IconBubbleTextFilled'
          : 'IconPhoneFilled';
  }
}

function Chip({ part, tone }: { part: ConditionPart; tone: Tone }) {
  const colors = TONES[tone];
  return (
    <Badge
      size='sm'
      icon={iconFor(part)}
      className={cn('min-w-0 max-w-full shrink gap-1 whitespace-nowrap', colors.badge)}
    >
      <span className={cn('truncate font-medium', colors.strong)}>{part.subject}</span>
      {part.operator && <span className='shrink-0'>{part.operator}</span>}
      <span className={cn('truncate font-medium', colors.strong)}>{part.value}</span>
    </Badge>
  );
}

function partText(part: ConditionPart): string {
  return `${part.subject} ${part.operator} ${part.value}`;
}

function treeText(tree: ConditionTree): string {
  return tree.kind === 'leaf'
    ? partText(tree.part)
    : `${tree.match}(${tree.children.map(treeText).join('|')})`;
}

function keyed<T>(items: T[], text: (item: T) => string): Array<{ item: T; key: string }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = text(item);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { item, key: occurrence === 1 ? base : `${base}#${occurrence}` };
  });
}

function Group({ tree, depth }: { tree: ConditionTree; depth: number }) {
  if (tree.kind === 'leaf') return <Chip part={tree.part} tone='tooltip' />;
  const word = tree.match === 'all' ? 'and' : 'or';
  return (
    <span className={cn('flex min-w-0 flex-col gap-1', depth > 0 && 'rounded-lg bg-background/10 p-1.5')}>
      {depth > 0 && (
        <span className='px-1 text-background/60 text-xs'>{tree.match === 'all' ? 'all of' : 'any of'}</span>
      )}
      {keyed(tree.children, treeText).map(({ item: child, key }, index) => (
        <span key={key} className='flex min-w-0 items-start gap-1.5'>
          <span className='w-6 shrink-0 pt-0.5 text-background/60 text-xs'>{index > 0 ? word : ''}</span>
          <Group tree={child} depth={depth + 1} />
        </span>
      ))}
    </span>
  );
}

export function Conditions({ expression, limit = VISIBLE }: { expression: Expression; limit?: number }) {
  const tree = conditionTree(expression);
  const leaves = conditionLeaves(tree);
  let characters = 0;
  const visible = leaves.filter((leaf, index) => {
    characters += partText(leaf.part).length;
    return index === 0 || (index < limit && characters <= ROW_CHARACTERS);
  });
  const hidden = leaves.length - visible.length;

  const row = (
    <span className='flex min-w-0 items-center gap-1.5'>
      {keyed(visible, (leaf) => partText(leaf.part)).map(({ item: leaf, key }) => (
        <span key={key} className='flex min-w-0 items-center gap-1.5'>
          {leaf.joiner && <span className='shrink-0 text-fg-2 text-xs'>{leaf.joiner}</span>}
          <Chip part={leaf.part} tone='row' />
        </span>
      ))}
      {hidden > 0 && (
        <Badge size='sm' className='shrink-0'>
          +{hidden}
        </Badge>
      )}
    </span>
  );

  if (leaves.length <= limit && tree.kind !== 'group') return row;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className='flex min-w-0 cursor-default'>{row}</span>} />
      <TooltipContent className='max-w-md p-2'>
        <Group tree={tree} depth={0} />
      </TooltipContent>
    </Tooltip>
  );
}
