import type { IconName } from '@buzzkit/ui/components/icon';
import type { Expression } from 'buzzkit/expressions';
import { describeExpression } from '@/app/components/segments/describe';

type MessageTargets = { to?: string[]; topic?: string; segment?: string; where?: Expression };

export function describeTarget(targets: unknown): {
  icon: IconName;
  nudge: string;
  text: string;
  full: string;
} {
  const { to = [], topic, segment, where } = targets as MessageTargets;
  if (where) {
    return {
      icon: 'IconTargetFilled',
      nudge: 'mt-px',
      text: 'Inline conditions',
      full: describeExpression(where).join(' · '),
    };
  }
  if (segment) return { icon: 'IconTargetFilled', nudge: 'mt-px', text: segment, full: segment };
  if (topic) return { icon: 'IconTagFilled', nudge: 'mt-0.5', text: topic, full: topic };
  if (to.length === 1)
    return { icon: 'IconPeopleFilled', nudge: 'mt-px', text: to[0] ?? '', full: to[0] ?? '' };
  return { icon: 'IconTeamFilled', nudge: 'mt-px', text: `${to.length} subscribers`, full: to.join(', ') };
}
