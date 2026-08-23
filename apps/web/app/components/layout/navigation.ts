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
      { label: 'Campaigns', path: '/campaigns', icon: 'IconMegaphoneFilled', planned: 'Phase 8' },
      { label: 'Workflows', path: '/workflows', icon: 'IconAgentsFilled', planned: 'Phase 9' },
    ],
  },
  {
    label: 'Audience',
    pages: [
      { label: 'Subscribers', path: '/subscribers', icon: 'IconTeamFilled' },
      { label: 'Segments', path: '/segments', icon: 'IconTargetFilled', planned: 'Phase 8' },
      { label: 'Topics', path: '/topics', icon: 'IconTagFilled' },
    ],
  },
  {
    label: 'Activity',
    pages: [
      { label: 'Messages', path: '/messages', icon: 'IconSendFilled', planned: 'Phase 4' },
      { label: 'Events', path: '/events', icon: 'IconHistoryFilled', planned: 'Phase 5' },
    ],
  },
  {
    label: 'Developers',
    pages: [
      { label: 'API keys', path: '/keys', icon: 'IconKeyholeFilled' },
      { label: 'Webhooks', path: '/webhooks', icon: 'IconWebhooksFilled', planned: 'Phase 10' },
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
          { label: 'Channels', path: '/settings/channels', planned: 'Phase 5' },
          { label: 'Tenants', path: '/settings/tenants', planned: 'Phase 5' },
          { label: 'Members', path: '/settings/members', planned: 'Phase 5' },
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
