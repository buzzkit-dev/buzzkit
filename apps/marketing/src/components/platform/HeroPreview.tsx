import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { useEffect, useRef, useState } from 'react';
import { DashboardPreview, type Screen } from './DashboardPreview';

const SCREENS: { value: Screen; label: string; icon: IconName }[] = [
  { value: 'overview', label: 'Overview', icon: 'IconHomeRoundDoorFilled' },
  { value: 'workflows', label: 'Workflows', icon: 'IconAgentsFilled' },
  { value: 'segments', label: 'Segments', icon: 'IconTargetFilled' },
  { value: 'messages', label: 'Deliveries', icon: 'IconPaperPlaneTopRightFilled' },
];

const DWELL_MS = 6000;
const DWELL_AFTER_PICK_MS = 6000;

const items = SCREENS.map((screen) => ({
  value: screen.value,
  label: (
    <>
      <Icon name={screen.icon} className='size-4' />
      {screen.label}
    </>
  ),
}));

function nextScreen(current: Screen): Screen {
  const index = SCREENS.findIndex((screen) => screen.value === current);
  return SCREENS[(index + 1) % SCREENS.length]!.value;
}

export function HeroPreview() {
  const [screen, setScreen] = useState<Screen>('overview');
  const [visible, setVisible] = useState(false);
  const [pick, setPick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const choose = (value: Screen) => {
    setScreen(value);
    setPick((current) => current + 1);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.4,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dwell = pick > 0 ? DWELL_AFTER_PICK_MS : DWELL_MS;
    const timer = setTimeout(() => {
      setScreen(nextScreen);
      setPick(0);
    }, dwell);
    return () => clearTimeout(timer);
  }, [visible, pick, screen]);

  return (
    <div ref={rootRef} className='absolute inset-0'>
      <div className='absolute inset-x-6 top-10 bottom-0 overflow-hidden rounded-t-2xl bg-background shadow-4 ring-1 ring-bg-3 lg:inset-x-14 lg:top-14'>
        <DashboardPreview screen={screen} />
      </div>
      <div className='absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-bg-1 p-1 shadow-4 ring-1 ring-bg-3'>
        <PillTabs
          items={items}
          value={screen}
          variant='primary'
          itemClassName='h-8 gap-1.5 px-3.5 text-sm'
          onValueChange={choose}
        />
      </div>
    </div>
  );
}
