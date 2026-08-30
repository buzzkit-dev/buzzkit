import type { IconName } from '@buzzkit/ui/components/icon';

export type NavigationPage = {
  label: string;
  path: string;
  icon?: IconName;
  soon?: boolean;
  planned?: string;
  children?: NavigationPage[];
};

type NavigationSection = { label?: string; pages: NavigationPage[] };

export const NAVIGATION: NavigationSection[] = [
  {
    pages: [{ label: 'Overview', path: '', icon: 'IconHomeRoundDoorFilled' }],
  },
  {
    label: 'Messaging',
    pages: [
      { label: 'Messages', path: '/messages', icon: 'IconPaperPlaneTopRightFilled' },
      {
        label: 'Workflows',
        path: '/workflows',
        icon: 'IconAgentsFilled',
        children: [
          { label: 'Catalog', path: '/workflows' },
          { label: 'Runs', path: '/runs' },
          { label: 'Secrets', path: '/workflows/secrets' },
        ],
      },
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
    label: 'Audience',
    pages: [
      { label: 'Subscribers', path: '/subscribers', icon: 'IconTeamFilled' },
      { label: 'Segments', path: '/segments', icon: 'IconTargetFilled' },
      { label: 'Topics', path: '/topics', icon: 'IconTagFilled' },
    ],
  },
  {
    label: 'Developers',
    pages: [
      { label: 'API keys', path: '/keys', icon: 'IconKeyholeFilled' },
      { label: 'Webhooks', path: '/webhooks', icon: 'IconWebhooksFilled' },
      { label: 'Sources', path: '/sources', icon: 'IconMailboxFilled' },
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
