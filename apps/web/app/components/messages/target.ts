import type { IconName } from '@buzzkit/ui/components/icon';
import type { Expression } from 'buzzkit/expressions';
import { describeExpression } from '@/app/components/conditions/describe';

type MessageTargets = {
  to?: string[];
  topic?: string;
  segment?: string;
  where?: Expression;
};

export function describeTarget(targets: unknown): {
  icon: IconName;
  nudge: string;
  text: string;
  full: string;
  list: string[] | null;
} {
  const { to = [], topic, segment, where } = targets as MessageTargets;
  if (where) {
    return {
      icon: 'IconTargetFilled',
      nudge: 'mt-px',
      text: 'Inline conditions',
      full: describeExpression(where).join(' · '),
      list: null,
    };
  }
  if (segment) return { icon: 'IconTargetFilled', nudge: 'mt-px', text: segment, full: segment, list: null };
  if (topic) return { icon: 'IconTagFilled', nudge: 'mt-0.5', text: topic, full: topic, list: null };
  if (to.length === 1)
    return { icon: 'IconPeopleFilled', nudge: 'mt-px', text: to[0] ?? '', full: to[0] ?? '', list: null };
  return {
    icon: 'IconTeamFilled',
    nudge: 'mt-px',
    text: `${to.length} subscribers`,
    full: to.join('\n'),
    list: to,
  };
}
