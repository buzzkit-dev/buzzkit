import { PillTabs } from '@buzzkit/ui/components/pill-tabs';
import { Link, useLocation } from 'react-router';

const TABS = [
  { value: 'overview', label: 'Overview', path: '' },
  { value: 'settings', label: 'Settings', path: '/settings' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function NavTabs({ slug }: { slug: string }) {
  const { pathname } = useLocation();
  const base = `/${slug}`;

  const active: TabValue =
    [...TABS].reverse().find((tab) => tab.path !== '' && pathname.startsWith(`${base}${tab.path}`))?.value ??
    'overview';

  return (
    <nav aria-label='Primary'>
      <PillTabs
        variant='soft'
        gapClassName='gap-1'
        itemClassName='h-7.5 px-3 text-sm'
        items={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        value={active}
        renderItem={(item, { onClick: _onClick, ...props }) => (
          <Link to={`${base}${TABS.find((tab) => tab.value === item.value)?.path ?? ''}`} {...props} />
        )}
      />
    </nav>
  );
}
