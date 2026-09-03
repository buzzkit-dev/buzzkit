import { Badge } from '@buzzkit/ui/components/badge';
import { Card } from '@buzzkit/ui/components/card';
import { LivePing } from '@buzzkit/ui/components/live-ping';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { WorkflowFlow } from '@buzzkit/web/components/workflows/flow';
import { useState } from 'react';
import { type SampleWorkflow, sampleWorkflows, trialNudge } from '../../../lib/workflows';

const WORKFLOW_TABS = sampleWorkflows.map((workflow) => ({ value: workflow.slug, label: workflow.name }));

function WorkflowHeader({ workflow }: { workflow: SampleWorkflow }) {
  return (
    <div className='flex items-center gap-2 border-bg-3 border-b px-4 py-3'>
      <span className='font-medium text-fg-4 text-sm'>{workflow.slug}</span>
      <Badge size='sm'>v{workflow.version}</Badge>
      <Badge size='sm' variant='green'>
        Active
      </Badge>
      <span className='ml-auto flex items-center gap-1.5 text-fg-2 text-xs tabular-nums'>
        <LivePing />
        {workflow.live} live runs
      </span>
    </div>
  );
}

export function WorkflowVignette() {
  return (
    <Card>
      <WorkflowHeader workflow={trialNudge} />
      <div inert aria-hidden='true' className='select-none'>
        <WorkflowFlow spec={trialNudge.spec} counts={trialNudge.counts} still />
      </div>
    </Card>
  );
}

export function WorkflowShowcase() {
  const [slug, setSlug] = useState(sampleWorkflows[0]!.slug);
  const workflow = sampleWorkflows.find((entry) => entry.slug === slug) ?? sampleWorkflows[0]!;

  return (
    <div className='flex w-full flex-col items-center gap-4'>
      <PillTabs items={WORKFLOW_TABS} value={slug} itemClassName='h-7 px-3 text-sm' onValueChange={setSlug} />
      <Card className='flex h-[560px] w-full flex-col'>
        <WorkflowHeader workflow={workflow} />
        <WorkflowFlow key={workflow.slug} spec={workflow.spec} counts={workflow.counts} />
      </Card>
    </div>
  );
}
