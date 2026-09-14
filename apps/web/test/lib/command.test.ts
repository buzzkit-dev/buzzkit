import { describe, expect, test } from 'vitest';
import {
  describePath,
  listDestinations,
  listSections,
  parseJump,
  resolveChord,
  scoreCommand,
} from '@/app/lib/command';

describe('listDestinations', () => {
  test('flattens the navigation into one destination per real page', () => {
    const paths = listDestinations(false).map((entry) => entry.path);
    expect(paths).toContain('');
    expect(paths).toContain('/runs');
    expect(paths).toContain('/settings/audit-log');
    expect(paths).not.toContain('/settings/billing');
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('an expandable page becomes its own section and children keep their labels', () => {
    const destinations = listDestinations(false);
    expect(destinations.find((entry) => entry.path === '/workflows')).toMatchObject({
      section: 'Workflows',
      label: 'Catalog',
    });
    expect(destinations.find((entry) => entry.path === '/runs')).toMatchObject({
      section: 'Workflows',
      label: 'Runs',
    });
    expect(destinations.find((entry) => entry.path === '/settings')).toMatchObject({
      section: 'Settings',
      label: 'General',
    });
  });

  test('sections come in sidebar order', () => {
    expect(listSections(false).map((section) => section.label)).toEqual([
      'Workspace',
      'Messaging',
      'Workflows',
      'Events',
      'Audience',
      'Developers',
      'Settings',
    ]);
  });

  test('the overview reads Quickstart until the first message', () => {
    expect(listDestinations(true).find((entry) => entry.path === '')?.label).toBe('Quickstart');
    expect(listDestinations(false).find((entry) => entry.path === '')?.label).toBe('Overview');
  });
});

describe('resolveChord', () => {
  test('maps a chord key to its page and nothing else', () => {
    expect(resolveChord('m')).toBe('/messages');
    expect(resolveChord('o')).toBe('');
    expect(resolveChord('z')).toBeNull();
  });
});

describe('parseJump', () => {
  test('opens a prefixed id at its page with the bare id', () => {
    expect(parseJump('msg_Ab12Cd')).toMatchObject({ path: '/messages/msg_Ab12Cd', hint: 'Message' });
    expect(parseJump(' run_x9 ')).toMatchObject({ path: '/runs/run_x9', hint: 'Run' });
    expect(parseJump('whk_k1')).toMatchObject({ path: '/webhooks/whk_k1' });
    expect(parseJump('src_s1')).toMatchObject({ path: '/sources/src_s1' });
  });

  test('recognises event names and leaves plain words alone', () => {
    expect(parseJump('$app_open')).toMatchObject({ path: '/events/%24app_open', hint: 'Event' });
    expect(parseJump('order.paid')).toMatchObject({ path: '/events/order.paid' });
    expect(parseJump('sub_x')).toBeNull();
    expect(parseJump('messages')).toBeNull();
    expect(parseJump('')).toBeNull();
  });
});

describe('describePath', () => {
  test('names static pages from the navigation', () => {
    expect(describePath('/settings/members')).toMatchObject({ label: 'Members', hint: 'Settings' });
  });

  test('names entity pages by their id or slug', () => {
    expect(describePath('/subscribers/user_42')).toMatchObject({ label: 'user_42', hint: 'Subscriber' });
    expect(describePath('/messages/msg_Ab12')).toMatchObject({ label: 'msg_Ab12', hint: 'Message' });
    expect(describePath('/workflows/onboarding/test')).toMatchObject({ hint: 'Workflow test' });
    expect(describePath('/events/%24app_open')).toMatchObject({ label: '$app_open', hint: 'Event' });
  });

  test('ignores editors and unknown paths', () => {
    expect(describePath('/segments/new')).toBeNull();
    expect(describePath('/nothing/here/at/all')).toBeNull();
  });
});

describe('scoreCommand', () => {
  test('matches whole words and prefixes, never scattered letters', () => {
    expect(scoreCommand('Tenants', 'tenant')).toBeGreaterThan(0);
    expect(scoreCommand('Switch tenant', 'tenant')).toBeGreaterThan(0);
    expect(scoreCommand('Topics', 'tenant')).toBe(0);
    expect(scoreCommand('Segments', 'tenant')).toBe(0);
    expect(scoreCommand('Audit log', 'tenant')).toBe(0);
  });

  test('ranks an exact label above a prefix, a prefix above a keyword', () => {
    const exact = scoreCommand('Tenants', 'tenants');
    const prefix = scoreCommand('Tenants', 'ten');
    const keyword = scoreCommand('Messages', 'push', ['push', 'send']);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(keyword);
  });

  test('requires every typed word to match somewhere', () => {
    expect(scoreCommand('Switch tenant', 'switch ten')).toBeGreaterThan(0);
    expect(scoreCommand('Switch tenant', 'switch nope')).toBe(0);
    expect(scoreCommand('Anything', '')).toBe(1);
  });
});
