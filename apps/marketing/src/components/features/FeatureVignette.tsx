import type { VignetteKind } from '../../lib/features';
import { DeliveryLedger } from './DeliveryLedger';
import { ActivityVignette } from './vignettes/Activity';
import { IosVignette } from './vignettes/Ios';
import { PreferencesVignette } from './vignettes/Preferences';
import { ScheduleVignette } from './vignettes/Schedule';
import { SegmentVignette } from './vignettes/Segment';
import { SendVignette } from './vignettes/Send';
import { SourcesVignette } from './vignettes/Sources';
import { TenantsVignette } from './vignettes/Tenants';
import { WorkflowShowcase } from './vignettes/Workflow';

const WIDE: VignetteKind[] = ['send', 'ios', 'workflow'];

function Centered({ children }: { children: React.ReactNode }) {
  return <div className='flex justify-center'>{children}</div>;
}

const VIGNETTES: Record<VignetteKind, (code?: string) => React.ReactNode> = {
  workflow: () => <WorkflowShowcase />,
  segment: () => <SegmentVignette />,
  schedule: () => <ScheduleVignette />,
  preferences: () => (
    <Centered>
      <PreferencesVignette />
    </Centered>
  ),
  sources: () => (
    <Centered>
      <SourcesVignette />
    </Centered>
  ),
  activity: () => (
    <Centered>
      <ActivityVignette />
    </Centered>
  ),
  delivery: () => <DeliveryLedger />,
  send: (code) => {
    if (!code) return null;
    return <SendVignette html={code} />;
  },
  ios: (code) => {
    if (!code) return null;
    return <IosVignette html={code} />;
  },
  tenants: () => <TenantsVignette />,
};

export function FeatureVignette({ kind, code }: { kind: VignetteKind; code?: string }) {
  const wide = WIDE.includes(kind);
  return <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-xl'}>{VIGNETTES[kind](code)}</div>;
}
