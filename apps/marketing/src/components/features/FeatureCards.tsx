import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { IconTile } from '@buzzkit/ui/components/icon-tile';
import { ActivityVignette } from './vignettes/Activity';
import { PreferencesVignette } from './vignettes/Preferences';
import { ScheduleVignette } from './vignettes/Schedule';
import { SegmentVignette } from './vignettes/Segment';
import { SourcesVignette } from './vignettes/Sources';
import { WorkflowVignette } from './vignettes/Workflow';

interface Copy {
  title: string;
  text: string;
  href: string;
}

function Shell({
  icon,
  copy,
  children,
  crop = true,
}: {
  icon: IconName;
  copy: Copy;
  children: React.ReactNode;
  crop?: boolean;
}) {
  return (
    <div className='flex flex-col overflow-hidden rounded-3xl bg-background-subtle p-7 ring-1 ring-bg-3/60 corner-superellipse/1.125'>
      <IconTile icon={icon} size='sm' className='text-fg-2' />
      <h3 className='mt-4 font-medium text-fg-4 text-lg leading-tighter'>{copy.title}</h3>
      <p className='mt-1 max-w-sm text-fg-2 text-sm leading-normal text-pretty'>{copy.text}</p>
      <a
        href={copy.href}
        className='mt-3 flex w-fit items-center gap-1 font-medium text-fg-4 text-sm transition-opacity duration-150 hover:opacity-70 active:opacity-70'
      >
        Explore {copy.title.toLowerCase()}
        <Icon name='IconArrowRight' className='size-4' />
      </a>
      {crop ? (
        <div className='relative -mx-7 -mb-7 mt-5 h-72 overflow-hidden'>
          <div className='absolute top-1 left-7 w-[440px]'>{children}</div>
        </div>
      ) : (
        <div className='mt-6 flex flex-1 items-center justify-center'>{children}</div>
      )}
    </div>
  );
}

export function FeatureCards({
  workflows,
  segments,
  scheduling,
  preferences,
  sources,
  liveActivities,
}: {
  workflows: Copy;
  segments: Copy;
  scheduling: Copy;
  preferences: Copy;
  sources: Copy;
  liveActivities: Copy;
}) {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <Shell icon='IconAgentsFilled' copy={workflows}>
        <WorkflowVignette />
      </Shell>
      <Shell icon='IconTargetFilled' copy={segments}>
        <SegmentVignette />
      </Shell>
      <Shell icon='IconCalendarClockFilled' copy={scheduling}>
        <ScheduleVignette />
      </Shell>
      <Shell icon='IconTagFilled' copy={preferences}>
        <div className='flex w-[440px] justify-center'>
          <PreferencesVignette />
        </div>
      </Shell>
      <Shell icon='IconMailboxFilled' copy={sources}>
        <SourcesVignette />
      </Shell>
      <Shell icon='IconLiveFullFilled' copy={liveActivities}>
        <div className='flex w-[440px] justify-center'>
          <ActivityVignette />
        </div>
      </Shell>
    </div>
  );
}
