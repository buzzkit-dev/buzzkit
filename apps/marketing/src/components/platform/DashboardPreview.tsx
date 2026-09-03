import { useAnimatedIndicator } from '@buzzkit/ui/components/highlight-list';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { PastelAvatar } from '@buzzkit/ui/components/pastel-avatar';
import { cn } from '@buzzkit/ui/lib/utils';
import { useRef } from 'react';
import { MessageScreen } from './MessageScreen';
import { OverviewScreen } from './OverviewScreen';
import { SegmentScreen } from './SegmentScreen';
import { WorkflowScreen } from './WorkflowScreen';

export type Screen = 'overview' | 'workflows' | 'segments' | 'messages';

const PAGES: Record<Screen, string> = {
  overview: 'Overview',
  workflows: 'Workflows',
  segments: 'Segments',
  messages: 'Messages',
};

const SCREENS: Record<Screen, () => React.ReactNode> = {
  overview: OverviewScreen,
  workflows: WorkflowScreen,
  segments: SegmentScreen,
  messages: MessageScreen,
};

const NAVIGATION: { label?: string; pages: { label: string; icon: IconName }[] }[] = [
  { pages: [{ label: 'Overview', icon: 'IconHomeRoundDoorFilled' }] },
  {
    label: 'Messaging',
    pages: [
      { label: 'Messages', icon: 'IconPaperPlaneTopRightFilled' },
      { label: 'Workflows', icon: 'IconAgentsFilled' },
      { label: 'Events', icon: 'IconZapFilled' },
    ],
  },
  {
    label: 'Audience',
    pages: [
      { label: 'Subscribers', icon: 'IconTeamFilled' },
      { label: 'Segments', icon: 'IconTargetFilled' },
      { label: 'Topics', icon: 'IconTagFilled' },
    ],
  },
  {
    label: 'Developers',
    pages: [
      { label: 'API keys', icon: 'IconKeyholeFilled' },
      { label: 'Webhooks', icon: 'IconWebhooksFilled' },
      { label: 'Sources', icon: 'IconMailboxFilled' },
    ],
  },
];

function Sidebar({ active }: { active: string }) {
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useAnimatedIndicator(navRef, { press: false });

  return (
    <aside className='hidden w-56 shrink-0 flex-col gap-3 px-3 pt-3 pb-2 md:flex'>
      <span className='flex h-8 items-center gap-2 rounded-xl pr-2.5 pl-1.25 font-medium text-fg-4 text-sm'>
        <PastelAvatar seed='gymly' size={24} className='rounded-lg corner-superellipse/1.125' />
        Gymly
        <Icon name='IconChevronGrabberVertical' className='ml-auto size-4 text-fg-2' />
      </span>
      <nav ref={navRef} className='relative isolate flex flex-col gap-5' aria-hidden='true'>
        <div
          ref={indicatorRef}
          className='corner-superellipse/1.125 pointer-events-none absolute top-0 left-0 -z-10 rounded-xl bg-bg-a2/70 opacity-0'
          style={{ willChange: 'transform, opacity', contain: 'layout paint', transformOrigin: 'center' }}
        />
        {NAVIGATION.map((section) => (
          <div key={section.label ?? 'top'} className='flex flex-col gap-0.5'>
            {section.label && (
              <span className='px-2.5 pb-1 font-medium text-fg-2 text-xs'>{section.label}</span>
            )}
            {section.pages.map((page) => {
              const current = page.label === active;
              return (
                <span
                  key={page.label}
                  data-highlighted={current ? '' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-xl pr-2.5 pl-2 font-medium text-sm transition-colors duration-200 corner-superellipse/1.125',
                    '[&>svg:first-child]:transition-opacity [&>svg:first-child]:duration-200 [&[data-indicator-here]>svg:first-child]:opacity-85',
                    current ? 'text-fg-4' : 'text-fg-2'
                  )}
                >
                  <Icon name={page.icon} className='size-4.5' />
                  {page.label}
                </span>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function DashboardPreview({ screen }: { screen: Screen }) {
  const Content = SCREENS[screen];
  return (
    <div inert aria-hidden='true' className='flex w-full select-none bg-background text-fg-3'>
      <Sidebar active={PAGES[screen]} />
      <div className='flex min-w-0 flex-1 flex-col gap-6 px-8 py-6'>
        <Content />
      </div>
    </div>
  );
}
