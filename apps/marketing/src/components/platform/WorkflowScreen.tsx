import { Button } from '@buzzkit/ui/components/button';
import { Card, CardAction, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { WorkflowStatusBadge } from '@buzzkit/web/components/badges/index';
import { WorkflowFlow } from '@buzzkit/web/components/workflows/flow';
import { trialNudge } from '../../lib/workflows';
import { ScreenHeader } from './Screen';

const TABS = [
  { value: 'steps', label: 'Steps' },
  { value: 'runs', label: 'Runs' },
  { value: 'code', label: 'Code' },
];

export function WorkflowScreen() {
  return (
    <>
      <ScreenHeader
        parent='Workflows'
        title={
          <>
            {trialNudge.name}
            <WorkflowStatusBadge status='active' />
          </>
        }
        description={trialNudge.description}
      >
        <Button variant='soft'>Pause</Button>
        <Button variant='soft' size='icon' icon='IconDotGrid1x3Horizontal' aria-label='Workflow actions' />
      </ScreenHeader>
      <Card className='flex flex-col'>
        <CardHeader divider className='py-3'>
          <CardTitle>Steps</CardTitle>
          <CardAction>
            <PillTabs items={TABS} value='steps' itemClassName='h-6.5 px-2.5 text-xs' />
          </CardAction>
        </CardHeader>
        <WorkflowFlow spec={trialNudge.spec} counts={trialNudge.counts} />
      </Card>
    </>
  );
}
