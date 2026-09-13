import {
  Command,
  CommandDialog,
  CommandFooter,
  CommandGroup,
  CommandHint,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@buzzkit/ui/components/command';
import type { FilterFacet } from '@buzzkit/ui/components/filter-bar';
import { Icon } from '@buzzkit/ui/components/icon';
import { Kbd } from '@buzzkit/ui/components/kbd';
import { toast } from '@buzzkit/ui/components/sonner';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useLocation, useNavigate, useSubmit } from 'react-router';
import { WorkspaceAvatar } from '@/app/components/layout/workspace-switcher';
import {
  type Command as RegisteredCommand,
  useCommandHotkeys,
  useRegisteredCommands,
  useRegisteredFacets,
} from '@/app/hooks/use-commands';
import type { Tenant, Workspace } from '@/app/lib/api.server';
import {
  describePath,
  type Jump,
  listDestinations,
  type Recent,
  readRecent,
  relativePath,
  rememberRecent,
  SEARCH_DEBOUNCE_MS,
  SEARCH_HEADINGS,
  SEARCH_MIN_LENGTH,
  SECTION_ORDER,
  type SearchKind,
  scoreCommand,
} from '@/app/lib/command';
import type { loader as searchLoader } from '@/app/routes/[slug]/search/index';

type Page = 'root' | 'workspaces' | 'tenants' | `facet:${string}`;

const DOCS_URL = 'https://docs.buzzkit.dev';
const RECENT_SHOWN = 6;
const SEARCH_KINDS = Object.keys(SEARCH_HEADINGS) as SearchKind[];

const PLACEHOLDERS: Record<string, string> = {
  root: 'Search pages, actions, or paste an id…',
  workspaces: 'Switch to a workspace…',
  tenants: 'Switch to a tenant…',
};

const PAGE_LABELS: Record<string, string> = {
  workspaces: 'Workspaces',
  tenants: 'Tenants',
};

function isJump(entry: Jump | null): entry is Jump {
  return entry !== null;
}

function runCommand(command: RegisteredCommand, go: (to: string) => void) {
  if ('run' in command) {
    setTimeout(command.run, 0);
    return;
  }
  if (command.external) {
    window.open(command.to, '_blank', 'noopener');
    return;
  }
  go(command.to);
}

function Crumb({ children }: { children: React.ReactNode }) {
  return (
    <span className='inline-flex h-[22px] shrink-0 items-center rounded-md bg-bg-2 px-2 font-medium text-fg-3 text-xs'>
      {children}
    </span>
  );
}

function Current() {
  return <Icon name='IconCheckmark1' className='ml-auto size-4 rotate-[4deg] opacity-100' />;
}

type Target = (value: string, to: string | null) => string;

function facetPage(facet: FilterFacet): Page {
  return `facet:${facet.id}`;
}

function currentOption(facet: FilterFacet): string {
  return (
    facet.options.find((option) => option.value === facet.value)?.label ?? `Any ${facet.label.toLowerCase()}`
  );
}

function FacetPage({ facet, pick }: { facet: FilterFacet; pick: (value: string | null) => void }) {
  return (
    <CommandGroup heading={facet.label}>
      <CommandItem value={`any ${facet.label}`} onSelect={() => pick(null)}>
        Any {facet.label.toLowerCase()}
        {facet.value === null && <Current />}
      </CommandItem>
      {facet.options.map((option) => (
        <CommandItem
          key={option.value}
          value={`${option.label} ${option.value}`}
          onSelect={() => pick(option.value)}
        >
          {option.label}
          {facet.value === option.value && <Current />}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function FacetGroups({
  facets,
  typing,
  enter,
  pick,
}: {
  facets: FilterFacet[];
  typing: boolean;
  enter: (page: Page) => void;
  pick: (facet: FilterFacet, value: string | null) => void;
}) {
  if (facets.length === 0) return null;
  if (!typing) {
    return (
      <CommandGroup heading='Filters'>
        {facets.map((facet) => (
          <CommandItem
            key={facet.id}
            value={`filter by ${facet.label}`}
            icon='IconSettingsSliderHorFilled'
            onSelect={() => enter(facetPage(facet))}
          >
            Filter by {facet.label.toLowerCase()}
            <CommandHint>{currentOption(facet)}</CommandHint>
            <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }
  return facets.map((facet) => (
    <CommandGroup key={facet.id} heading={`Filter by ${facet.label.toLowerCase()}`}>
      {facet.options.map((option) => (
        <CommandItem
          key={option.value}
          value={`${option.label} ${facet.label} filter`}
          keywords={['filter', facet.label]}
          icon='IconSettingsSliderHorFilled'
          onSelect={() => pick(facet, option.value)}
        >
          {option.label}
          <CommandHint>{facet.label}</CommandHint>
          {facet.value === option.value && <Current />}
        </CommandItem>
      ))}
    </CommandGroup>
  ));
}

function WorkspacesPage({
  workspaces,
  current,
  target,
  go,
}: {
  workspaces: Workspace[];
  current: Workspace | null;
  target: Target;
  go: (to: string) => void;
}) {
  return (
    <CommandGroup heading='Workspaces'>
      {workspaces.map((entry) => (
        <CommandItem
          key={entry.id}
          value={target(`${entry.name} ${entry.slug}`, `/${entry.slug}`)}
          onSelect={() => go(`/${entry.slug}`)}
        >
          <WorkspaceAvatar slug={entry.slug} avatarUrl={entry.avatarUrl} size={18} />
          {entry.name}
          {entry.slug === current?.slug && <Current />}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function TenantsPage({
  tenants,
  current,
  base,
  target,
  link,
  go,
}: {
  tenants: Tenant[];
  current: Tenant | null;
  base: string;
  target: Target;
  link: (entry: Tenant) => string;
  go: (to: string) => void;
}) {
  return (
    <CommandGroup heading='Tenants'>
      {tenants.map((entry) => (
        <CommandItem
          key={entry.id}
          value={target(`${entry.name} ${entry.slug}`, link(entry))}
          icon='IconBuildingsFilled'
          onSelect={() => go(link(entry))}
        >
          {entry.name}
          {entry.slug === current?.slug && <Current />}
        </CommandItem>
      ))}
      <CommandItem
        value='manage tenants'
        icon='IconSettingsGear4Filled'
        onSelect={() => go(`${base}/settings/tenants`)}
      >
        Manage tenants
      </CommandItem>
    </CommandGroup>
  );
}

export function CommandMenu({
  open,
  onOpenChange,
  slug,
  workspaces,
  workspace,
  tenants,
  tenant,
  quickstart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  workspaces: Workspace[];
  workspace: Workspace | null;
  tenants: Tenant[];
  tenant: Tenant | null;
  quickstart: boolean;
}) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const { pathname } = useLocation();
  const search = useFetcher<typeof searchLoader>();
  const registered = useRegisteredCommands();
  const facets = useRegisteredFacets();
  const base = `/${slug}`;
  const current = relativePath(pathname, base);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<Page>('root');
  const [selected, setSelected] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const restoreFocus = useRef(true);
  const openedFrom = useRef<HTMLElement | null>(null);
  const trimmed = query.trim();
  const searching = page === 'root' && trimmed.length >= SEARCH_MIN_LENGTH;
  const results = searching && search.data?.q === trimmed ? search.data.results : [];
  const looking = searching && (search.state !== 'idle' || search.data?.q !== trimmed);
  const grouped = SEARCH_KINDS.map((kind) => ({
    kind,
    entries: results.filter((result) => result.kind === kind),
  })).filter((group) => group.entries.length > 0);
  const destinations = listDestinations(quickstart);
  const sections = SECTION_ORDER.map((label) => ({
    label,
    entries: destinations.filter((destination) => destination.section === label),
  }));
  const switchableWorkspaces = workspaces.length > 1;
  const switchableTenants = tenants.length > 1;
  const recentEntries = recent
    .map((entry) => describePath(entry.path))
    .filter(isJump)
    .filter((entry) => entry.path !== current)
    .slice(0, RECENT_SHOWN);

  const close = () => onOpenChange(false);

  const finalFocus = () => {
    if (!restoreFocus.current) return false;
    const origin = openedFrom.current;
    if (origin?.isConnected && origin !== document.body) return origin;
    return false;
  };

  const targets = new Map<string, string>();
  const target = (value: string, to: string | null) => {
    if (to !== null) targets.set(value.trim().toLowerCase(), to);
    return value;
  };
  const prefetch = targets.get(selected.trim().toLowerCase());

  const go = (to: string) => {
    close();
    void navigate(to);
  };

  const perform = (command: RegisteredCommand) => {
    restoreFocus.current = !('run' in command);
    close();
    runCommand(command, (to) => void navigate(to));
  };

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener');
    close();
  };

  const copyLink = () => {
    close();
    void navigator.clipboard.writeText(window.location.href).then(() => toast.success('Link copied.'));
  };

  const signOut = () => {
    close();
    void submit({ intent: 'sign-out' }, { method: 'post', action: base });
  };

  const enter = (next: Page) => {
    setPage(next);
    setQuery('');
  };

  const openFacet = facets.find((facet) => facetPage(facet) === page) ?? null;
  const crumb = openFacet ? openFacet.label : (PAGE_LABELS[page] ?? null);

  const pick = (facet: FilterFacet, value: string | null) => {
    close();
    facet.onValueChange(value);
  };

  const tenantLink = (entry: Tenant) => {
    return entry.slug === tenant?.slug ? pathname : `${pathname}?tenant=${entry.slug}`;
  };

  useEffect(() => {
    if (current === null || describePath(current) === null) return;
    rememberRecent(slug, current);
  }, [slug, current]);

  useEffect(() => {
    if (!searching) return;
    const timer = window.setTimeout(() => {
      void search.load(`${base}/search?q=${encodeURIComponent(trimmed)}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searching, trimmed, base, search.load]);

  useEffect(() => {
    if (search.data?.q !== trimmed) return;
    const first = search.data.results[0];
    if (first) setSelected(`${first.kind} ${first.path}`);
  }, [search.data, trimmed]);

  useEffect(() => {
    if (open) {
      restoreFocus.current = true;
      openedFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRecent(readRecent(slug));
      return;
    }
    setQuery('');
    setPage('root');
    setSelected('');
  }, [open, slug]);

  useCommandHotkeys({ open, onOpenChange, base });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} finalFocus={finalFocus}>
      <Command value={selected} onValueChange={setSelected} filter={scoreCommand}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={openFacet ? `Filter by ${openFacet.label.toLowerCase()}…` : PLACEHOLDERS[page]}
          start={crumb !== null && <Crumb>{crumb}</Crumb>}
          end={looking ? <Spinner className='size-4 text-fg-2' /> : <Kbd>esc</Kbd>}
          onKeyDown={(event) => {
            if (event.key !== 'Backspace' || query !== '' || page === 'root') return;
            event.preventDefault();
            setPage('root');
          }}
        />
        <CommandList>
          {page === 'root' && (
            <>
              {registered.length > 0 && (
                <CommandGroup heading='On this page'>
                  {registered.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={target(command.label, 'to' in command && !command.external ? command.to : null)}
                      keywords={command.keywords}
                      icon={command.icon}
                      onSelect={() => perform(command)}
                    >
                      {command.label}
                      {command.hint && <CommandHint>{command.hint}</CommandHint>}
                      {command.shortcut && <CommandShortcut keys={command.shortcut} />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {grouped.map((group) => (
                <CommandGroup key={group.kind} heading={SEARCH_HEADINGS[group.kind]} forceMount>
                  {group.entries.map((result) => (
                    <CommandItem
                      key={result.path}
                      forceMount
                      value={target(`${result.kind} ${result.path}`, `${base}${result.path}`)}
                      icon={result.icon}
                      onSelect={() => go(`${base}${result.path}`)}
                    >
                      <span className='truncate'>{result.label}</span>
                      <CommandHint>{result.hint}</CommandHint>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              <FacetGroups facets={facets} typing={trimmed !== ''} enter={enter} pick={pick} />

              {trimmed === '' && recentEntries.length > 0 && (
                <CommandGroup heading='Recent'>
                  {recentEntries.map((entry) => (
                    <CommandItem
                      key={entry.path}
                      value={target(`${entry.label} recent ${entry.path}`, `${base}${entry.path}`)}
                      icon={entry.icon}
                      onSelect={() => go(`${base}${entry.path}`)}
                    >
                      {entry.label}
                      {entry.hint && <CommandHint>{entry.hint}</CommandHint>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {sections.map((section) => (
                <CommandGroup key={section.label} heading={section.label}>
                  {section.entries.map((destination, index) => (
                    <Fragment key={destination.path}>
                      <CommandItem
                        value={target(destination.label, `${base}${destination.path}`)}
                        keywords={destination.keywords}
                        icon={destination.icon}
                        onSelect={() => go(`${base}${destination.path}`)}
                      >
                        {destination.label}
                        {destination.hint && <CommandHint>{destination.hint}</CommandHint>}
                        {destination.chord && (
                          <CommandShortcut keys={['G', destination.chord.toUpperCase()]} />
                        )}
                      </CommandItem>
                      {section.label === 'Workspace' && index === 0 && (
                        <>
                          {switchableWorkspaces && (
                            <CommandItem
                              value='switch workspace'
                              keywords={['change', 'account', 'organization', 'workspaces']}
                              icon='IconLayersTwoFilled'
                              onSelect={() => enter('workspaces')}
                            >
                              Switch workspace
                              {workspace && <CommandHint>{workspace.name}</CommandHint>}
                              <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
                            </CommandItem>
                          )}
                          {switchableTenants && (
                            <CommandItem
                              value='switch tenant'
                              keywords={['change', 'app', 'environment', 'tenants']}
                              icon='IconBuildingsFilled'
                              onSelect={() => enter('tenants')}
                            >
                              Switch tenant
                              {tenant && <CommandHint>{tenant.name}</CommandHint>}
                              <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
                            </CommandItem>
                          )}
                        </>
                      )}
                    </Fragment>
                  ))}
                </CommandGroup>
              ))}

              {trimmed !== '' && switchableWorkspaces && (
                <CommandGroup heading='Workspaces'>
                  {workspaces.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={target(`${entry.name} ${entry.slug} workspace`, `/${entry.slug}`)}
                      onSelect={() => go(`/${entry.slug}`)}
                    >
                      <WorkspaceAvatar slug={entry.slug} avatarUrl={entry.avatarUrl} size={18} />
                      {entry.name}
                      {entry.slug === workspace?.slug && <Current />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {trimmed !== '' && switchableTenants && (
                <CommandGroup heading='Tenants'>
                  {tenants.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={target(`${entry.name} ${entry.slug} tenant`, tenantLink(entry))}
                      icon='IconBuildingsFilled'
                      onSelect={() => go(tenantLink(entry))}
                    >
                      {entry.name}
                      {entry.slug === tenant?.slug && <Current />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {trimmed !== '' && (
                <CommandGroup heading='Search' forceMount>
                  <CommandItem
                    forceMount
                    value={target(
                      `look up subscriber ${trimmed}`,
                      `${base}/subscribers?q=${encodeURIComponent(trimmed)}`
                    )}
                    icon='IconTeamFilled'
                    onSelect={() => go(`${base}/subscribers?q=${encodeURIComponent(trimmed)}`)}
                  >
                    Look up subscriber “{trimmed}”
                  </CommandItem>
                  <CommandItem
                    forceMount
                    value={target(
                      `search audit log ${trimmed}`,
                      `${base}/settings/audit-log?q=${encodeURIComponent(trimmed)}`
                    )}
                    icon='IconHistoryFilled'
                    onSelect={() => go(`${base}/settings/audit-log?q=${encodeURIComponent(trimmed)}`)}
                  >
                    Search the audit log for “{trimmed}”
                  </CommandItem>
                </CommandGroup>
              )}

              <CommandGroup heading='Help'>
                <CommandItem
                  value='documentation docs'
                  keywords={['guide', 'help', 'manual']}
                  icon='IconBook'
                  onSelect={() => openExternal(DOCS_URL)}
                >
                  Documentation
                  <CommandHint>docs.buzzkit.dev</CommandHint>
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
                <CommandItem
                  value='api reference'
                  keywords={['endpoints', 'openapi', 'rest']}
                  icon='IconCode'
                  onSelect={() => openExternal(`${DOCS_URL}/api-reference/introduction`)}
                >
                  API reference
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
                <CommandItem
                  value='quick start guide'
                  keywords={['setup', 'install', 'sdk', 'getting started']}
                  icon='IconRocket'
                  onSelect={() => openExternal(`${DOCS_URL}/quickstart`)}
                >
                  Quick start guide
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
              </CommandGroup>

              <CommandGroup heading='Account'>
                <CommandItem
                  value='copy link to this page'
                  keywords={['url', 'share', 'clipboard']}
                  icon='IconChainLink1'
                  onSelect={copyLink}
                >
                  Copy link to this page
                </CommandItem>
                <CommandItem
                  value='sign out'
                  keywords={['log out', 'logout', 'leave']}
                  icon='IconArrowBoxRight'
                  onSelect={signOut}
                >
                  Sign out
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {openFacet && <FacetPage facet={openFacet} pick={(value) => pick(openFacet, value)} />}

          {page === 'workspaces' && (
            <WorkspacesPage workspaces={workspaces} current={workspace} target={target} go={go} />
          )}

          {page === 'tenants' && (
            <TenantsPage
              tenants={tenants}
              current={tenant}
              base={base}
              target={target}
              link={tenantLink}
              go={go}
            />
          )}
        </CommandList>
        <CommandFooter>
          <span className='flex items-center gap-1'>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className='ml-0.5'>Move</span>
          </span>
          <span className='flex items-center gap-1'>
            <Kbd>↵</Kbd>
            <span className='ml-0.5'>Open</span>
          </span>
          {page === 'root' ? (
            <span className='ml-auto hidden items-center gap-1 sm:flex'>
              <Kbd>G</Kbd>
              <span className='ml-0.5'>then a key jumps to a page</span>
            </span>
          ) : (
            <span className='ml-auto flex items-center gap-1'>
              <Kbd>⌫</Kbd>
              <span className='ml-0.5'>Back</span>
            </span>
          )}
        </CommandFooter>
      </Command>
      {prefetch !== undefined && (
        <Link to={prefetch} prefetch='render' tabIndex={-1} aria-hidden className='hidden' />
      )}
    </CommandDialog>
  );
}
