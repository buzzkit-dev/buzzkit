import type { IconName } from '@buzzkit/ui/components/icon';
import { NAVIGATION, type NavigationPage } from '@/app/components/layout/navigation';

export type Destination = {
  section: string;
  path: string;
  label: string;
  hint?: string;
  icon?: IconName;
  keywords: string[];
  chord?: string;
};

export type Jump = { path: string; label: string; hint: string; icon: IconName };

export type Recent = { path: string; at: number };

export type SearchKind =
  | 'workspace'
  | 'subscriber'
  | 'event'
  | 'workflow'
  | 'segment'
  | 'message'
  | 'run'
  | 'webhook'
  | 'source';

export type SearchResult = { kind: SearchKind; path: string; label: string; hint: string; icon: IconName };

export const SEARCH_HEADINGS: Record<SearchKind, string> = {
  workspace: 'Workspaces',
  subscriber: 'Subscribers',
  event: 'Events',
  workflow: 'Workflows',
  segment: 'Segments',
  message: 'Messages',
  run: 'Runs',
  webhook: 'Webhooks',
  source: 'Sources',
};

export function resolveResultPath(base: string, result: SearchResult): string {
  return result.kind === 'workspace' ? result.path : `${base}${result.path}`;
}

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 200;

const KEYWORDS: Record<string, string[]> = {
  '': ['home', 'dashboard', 'stats', 'start', 'quick start'],
  '/messages': ['push', 'send', 'notifications', 'deliveries', 'scheduled'],
  '/workflows': ['automation', 'journeys', 'drip', 'flows'],
  '/runs': ['executions', 'history', 'workflow runs'],
  '/workflows/secrets': ['env', 'credentials', 'fetch'],
  '/events': ['track', 'analytics', 'catalog'],
  '/events/stream': ['live', 'feed', 'realtime', 'log'],
  '/subscribers': ['users', 'people', 'devices', 'tokens', 'audience'],
  '/segments': ['audience', 'cohorts', 'filters', 'conditions'],
  '/topics': ['categories', 'preferences', 'opt in', 'channels'],
  '/keys': ['api', 'tokens', 'secret', 'client key', 'publishable'],
  '/webhooks': ['endpoints', 'callbacks', 'signing secret'],
  '/sources': ['inbound', 'ingest', 'stripe', 'revenuecat', 'superwall', 'integrations'],
  '/settings': ['general', 'workspace', 'name', 'slug', 'delete workspace'],
  '/settings/channels': ['providers', 'apns', 'fcm', 'apple', 'android', 'credentials', 'send policy'],
  '/settings/tenants': ['apps', 'environments', 'isolation'],
  '/settings/members': ['team', 'invite', 'roles', 'people'],
  '/settings/audit-log': ['history', 'changes', 'who', 'security'],
};

const CHORDS: Record<string, string> = {
  '': 'o',
  '/messages': 'm',
  '/workflows': 'w',
  '/runs': 'r',
  '/events': 'e',
  '/events/stream': 'l',
  '/subscribers': 's',
  '/segments': 'g',
  '/topics': 't',
  '/keys': 'k',
  '/webhooks': 'h',
  '/sources': 'i',
  '/settings': ',',
  '/settings/channels': 'c',
  '/settings/members': 'p',
  '/settings/audit-log': 'a',
};

const RECENT_LIMIT = 8;

const HOME_SECTION = 'Workspace';

function pageDestination(section: string, page: NavigationPage, quickstart: boolean): Destination {
  const home = page.path === '' && quickstart;
  return {
    section,
    path: page.path,
    label: home ? 'Quickstart' : page.label,
    icon: home ? 'IconRocketFilled' : page.icon,
    keywords: [...(KEYWORDS[page.path] ?? []), page.label],
    chord: CHORDS[page.path],
  };
}

function childDestination(page: NavigationPage, child: NavigationPage): Destination {
  return {
    section: page.label,
    path: child.path,
    label: child.label,
    icon: page.icon,
    keywords: [...(KEYWORDS[child.path] ?? []), page.label, child.label],
    chord: CHORDS[child.path],
  };
}

export function listDestinations(quickstart: boolean): Destination[] {
  const destinations: Destination[] = [];
  for (const section of NAVIGATION) {
    for (const page of section.pages) {
      const children = page.children ?? [page];
      for (const child of children) {
        if (child.soon) continue;
        destinations.push(
          page.children
            ? childDestination(page, child)
            : pageDestination(section.label ?? HOME_SECTION, page, quickstart)
        );
      }
    }
  }
  return destinations;
}

export type Section = { label: string; entries: Destination[] };

export function listSections(quickstart: boolean): Section[] {
  const sections: Section[] = [];
  for (const destination of listDestinations(quickstart)) {
    const section = sections.find((entry) => entry.label === destination.section);
    if (section) section.entries.push(destination);
    else sections.push({ label: destination.section, entries: [destination] });
  }
  return sections;
}

function scoreText(text: string, word: string): number {
  const lowered = text.toLowerCase();
  if (lowered === word) return 1;
  if (lowered.startsWith(word)) return 0.9;
  if (lowered.split(/[\s/._-]+/).some((part) => part.startsWith(word))) return 0.8;
  if (lowered.includes(word)) return 0.5;
  return 0;
}

export function scoreCommand(value: string, search: string, keywords: string[] = []): number {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let total = 0;
  for (const word of words) {
    const own = scoreText(value, word);
    const borrowed = keywords.reduce((top, keyword) => Math.max(top, scoreText(keyword, word) * 0.7), 0);
    const best = Math.max(own, borrowed);
    if (best === 0) return 0;
    total += best;
  }
  return total / words.length;
}

export function resolveChord(key: string): string | null {
  const entry = Object.entries(CHORDS).find(([, chord]) => chord === key);
  return entry ? entry[0] : null;
}

export function parseJump(query: string): Jump | null {
  const trimmed = query.trim();
  const prefixed = /^(msg|run|whk|src)_[A-Za-z0-9]+$/.exec(trimmed);
  if (prefixed) {
    const prefix = prefixed[1] as 'msg' | 'run' | 'whk' | 'src';
    const routes = {
      msg: { path: `/messages/${trimmed}`, hint: 'Message', icon: 'IconPaperPlaneTopRightFilled' },
      run: { path: `/runs/${trimmed}`, hint: 'Run', icon: 'IconAgentsFilled' },
      whk: { path: `/webhooks/${trimmed}`, hint: 'Webhook', icon: 'IconWebhooksFilled' },
      src: { path: `/sources/${trimmed}`, hint: 'Source', icon: 'IconMailboxFilled' },
    } satisfies Record<string, { path: string; hint: string; icon: IconName }>;
    return { label: trimmed, ...routes[prefix] };
  }
  if (/^\$[a-z][a-z0-9_]*$/.test(trimmed) || /^[a-z][a-z0-9_]*(?:[.:][a-z0-9_]+)+$/.test(trimmed)) {
    return {
      path: `/events/${encodeURIComponent(trimmed)}`,
      label: trimmed,
      hint: 'Event',
      icon: 'IconZapFilled',
    };
  }
  return null;
}

export function describePath(path: string): Jump | null {
  const destination = listDestinations(false).find((entry) => entry.path === path);
  if (destination) {
    return {
      path,
      label: destination.label,
      hint: destination.section,
      icon: destination.icon ?? 'IconArrowRight',
    };
  }
  const segments = path.split('/').filter(Boolean);
  const [root, second, third] = segments;
  if (!root || !second || second === 'new') return null;
  const name = decodeURIComponent(second);
  if (segments.length === 2) {
    if (root === 'subscribers') return { path, label: name, hint: 'Subscriber', icon: 'IconTeamFilled' };
    if (root === 'messages')
      return { path, label: name, hint: 'Message', icon: 'IconPaperPlaneTopRightFilled' };
    if (root === 'runs') return { path, label: name, hint: 'Run', icon: 'IconAgentsFilled' };
    if (root === 'workflows') return { path, label: name, hint: 'Workflow', icon: 'IconAgentsFilled' };
    if (root === 'segments') return { path, label: name, hint: 'Segment', icon: 'IconTargetFilled' };
    if (root === 'events') return { path, label: name, hint: 'Event', icon: 'IconZapFilled' };
    if (root === 'webhooks') return { path, label: name, hint: 'Webhook', icon: 'IconWebhooksFilled' };
    if (root === 'sources') return { path, label: name, hint: 'Source', icon: 'IconMailboxFilled' };
    return null;
  }
  if (segments.length === 3 && root === 'workflows' && third === 'test') {
    return { path, label: name, hint: 'Workflow test', icon: 'IconPlayFilled' };
  }
  return null;
}

function recentKey(slug: string): string {
  return `buzzkit.recent:${slug}`;
}

export function readRecent(slug: string): Recent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(recentKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Recent =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Recent).path === 'string' &&
        typeof (entry as Recent).at === 'number'
    );
  } catch {
    return [];
  }
}

export function rememberRecent(slug: string, path: string): void {
  if (typeof window === 'undefined') return;
  const next = [{ path, at: Date.now() }, ...readRecent(slug).filter((entry) => entry.path !== path)].slice(
    0,
    RECENT_LIMIT
  );
  try {
    window.localStorage.setItem(recentKey(slug), JSON.stringify(next));
  } catch {
    return;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function relativePath(pathname: string, base: string): string | null {
  if (pathname === base) return '';
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return null;
}
