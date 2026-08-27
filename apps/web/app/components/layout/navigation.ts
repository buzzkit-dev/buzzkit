import type { IconName } from '@buzzkit/ui/components/icon';

export type NavigationPage = {
  label: string;
  path: string;
  icon?: IconName;
  soon?: boolean;
  planned?: string;
  children?: NavigationPage[];
};

export type NavigationSection = { label?: string; pages: NavigationPage[] };

export const NAVIGATION: NavigationSection[] = [
  {
    pages: [{ label: 'Overview', path: '', icon: 'IconHomeRoundDoorFilled' }],
  },
  {
    label: 'Engage',
    pages: [
      { label: 'Campaigns', path: '/campaigns', icon: 'IconMegaphoneFilled', planned: 'engine phase E4' },
      { label: 'Workflows', path: '/workflows', icon: 'IconAgentsFilled', planned: 'engine phase E5' },
    ],
  },
  {
    label: 'Audience',
    pages: [
      { label: 'Subscribers', path: '/subscribers', icon: 'IconTeamFilled' },
      { label: 'Segments', path: '/segments', icon: 'IconTargetFilled', planned: 'engine phase E3' },
      { label: 'Topics', path: '/topics', icon: 'IconTagFilled' },
    ],
  },
  {
    label: 'Activity',
    pages: [
      { label: 'Messages', path: '/messages', icon: 'IconPaperPlaneTopRightFilled' },
      {
        label: 'Events',
        path: '/events',
        icon: 'IconZapFilled',
        children: [
          { label: 'Catalog', path: '/events' },
          { label: 'Stream', path: '/events/stream' },
        ],
      },
    ],
  },
  {
    label: 'Developers',
    pages: [
      { label: 'API keys', path: '/keys', icon: 'IconKeyholeFilled' },
      { label: 'Webhooks', path: '/webhooks', icon: 'IconWebhooksFilled', planned: 'engine phase E2' },
    ],
  },
  {
    label: 'Workspace',
    pages: [
      {
        label: 'Settings',
        path: '/settings',
        icon: 'IconSettingsGear4Filled',
        children: [
          { label: 'General', path: '/settings' },
          { label: 'Channels', path: '/settings/channels' },
          { label: 'Tenants', path: '/settings/tenants' },
          { label: 'Members', path: '/settings/members' },
          { label: 'Audit log', path: '/settings/audit-log' },
          { label: 'Billing', path: '/settings/billing', soon: true },
        ],
      },
    ],
  },
];

export function findNavigationPage(path: string): NavigationPage | undefined {
  for (const section of NAVIGATION) {
    for (const page of section.pages) {
      if (page.path === path) return page;
      const child = page.children?.find((entry) => entry.path === path);
      if (child) return child;
    }
  }
  return undefined;
}
