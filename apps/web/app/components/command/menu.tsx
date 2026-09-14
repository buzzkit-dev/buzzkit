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
import type { FilterFacet, FilterSearchField } from '@buzzkit/ui/components/filter-registry';
import { Icon, type IconName } from '@buzzkit/ui/components/icon';
import { Kbd } from '@buzzkit/ui/components/kbd';
import { toast } from '@buzzkit/ui/components/sonner';
import { Spinner } from '@buzzkit/ui/components/spinner';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useLocation, useNavigate, useSubmit } from 'react-router';
import { WorkspaceAvatar } from '@/app/components/layout/workspace-switcher';
import {
  type Command as RegisteredCommand,
  useCommandHotkeys,
  useRegisteredActions,
  useRegisteredCommands,
  useRegisteredFacets,
  useRegisteredSearchFields,
} from '@/app/hooks/use-commands';
import type { Tenant, Workspace } from '@/app/lib/api.server';
import {
  type Destination,
  describePath,
  type Jump,
  listSections,
  type Recent,
  readRecent,
  relativePath,
  rememberRecent,
  resolveResultPath,
  SEARCH_DEBOUNCE_MS,
  SEARCH_HEADINGS,
  SEARCH_MIN_LENGTH,
  type SearchKind,
  type SearchResult,
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

const values = {
  workspace: (entry: Workspace, scope: 'root' | 'page') =>
    scope === 'root' ? `${entry.name} ${entry.slug} workspace` : `${entry.name} ${entry.slug}`,
  tenant: (entry: Tenant, scope: 'root' | 'page') =>
    scope === 'root' ? `${entry.name} ${entry.slug} tenant` : `${entry.name} ${entry.slug}`,
  destination: (entry: Destination) => `${entry.section} ${entry.label}`,
  recent: (entry: Jump) => `${entry.label} recent ${entry.path}`,
  result: (entry: SearchResult) => `${entry.kind} ${entry.path}`,
  field: (field: FilterSearchField, query: string) => `${field.label} ${query}`,
  lookup: (query: string) => `look up subscriber ${query}`,
  audit: (query: string) => `search audit log ${query}`,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

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

function facetPage(facet: FilterFacet): Page {
  return `facet:${facet.id}`;
}

function currentOption(facet: FilterFacet): string {
  return (
    facet.options.find((option) => option.value === facet.value)?.label ?? `Any ${facet.label.toLowerCase()}`
  );
}

function anyValue(facet: FilterFacet): string {
  return `any ${facet.label}`;
}

function firstOption(facet: FilterFacet): string {
  const option = facet.options[0];
  return facet.clearable || !option ? anyValue(facet) : `${option.label} ${option.value}`;
}

function filterByValue(facet: FilterFacet): string {
  return `filter by ${facet.label} ${facet.scope ?? ''}`.trim();
}

function FacetPage({ facet, pick }: { facet: FilterFacet; pick: (value: string | null) => void }) {
  return (
    <CommandGroup heading={facet.label}>
      {facet.clearable && (
        <CommandItem value={anyValue(facet)} onSelect={() => pick(null)}>
          Any {facet.label.toLowerCase()}
          {facet.value === null && <Current />}
        </CommandItem>
      )}
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

function ClearFilters({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <CommandItem
      value={label}
      keywords={['reset', 'remove filters', 'any']}
      icon='IconCrossMedium'
      onSelect={onSelect}
    >
      {label}
    </CommandItem>
  );
}

type FacetScope = { scope: string | null; heading: string; facets: FilterFacet[] };

function groupFacets(facets: FilterFacet[]): FacetScope[] {
  const scopes: FacetScope[] = [];
  for (const facet of facets) {
    const existing = scopes.find((entry) => entry.scope === facet.scope);
    if (existing) existing.facets.push(facet);
    else {
      scopes.push({
        scope: facet.scope,
        heading: facet.scope ? `${facet.scope} filters` : 'Filters',
        facets: [facet],
      });
    }
  }
  return scopes;
}

function facetHeading(group: FacetScope, facet: FilterFacet): string {
  const subject = group.scope ? ` ${group.scope.toLowerCase()}` : '';
  return `Filter${subject} by ${facet.label.toLowerCase()}`;
}

function FacetGroups({
  facets,
  typing,
  enter,
  pick,
  clear,
}: {
  facets: FilterFacet[];
  typing: boolean;
  enter: (page: Page, first: string, from: string) => void;
  pick: (facet: FilterFacet, value: string | null) => void;
  clear: (facets: FilterFacet[]) => void;
}) {
  const groups = groupFacets(facets);
  if (groups.length === 0) return null;
  const clearLabel = (group: FacetScope) =>
    group.scope ? `Clear ${group.scope.toLowerCase()} filters` : 'Clear filters';
  const clearable = (group: FacetScope) =>
    group.facets.filter((facet) => facet.clearable && facet.value !== null);
  if (!typing) {
    return groups.map((group) => (
      <CommandGroup key={group.scope ?? ''} heading={group.heading}>
        {clearable(group).length > 0 && (
          <ClearFilters label={clearLabel(group)} onSelect={() => clear(clearable(group))} />
        )}
        {group.facets.map((facet) => (
          <CommandItem
            key={facet.id}
            value={filterByValue(facet)}
            icon='IconSettingsSliderHorFilled'
            onSelect={() => enter(facetPage(facet), firstOption(facet), filterByValue(facet))}
          >
            {facetHeading(group, facet)}
            <CommandHint>{currentOption(facet)}</CommandHint>
            <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
          </CommandItem>
        ))}
      </CommandGroup>
    ));
  }
  return groups.map((group) => (
    <Fragment key={group.scope ?? ''}>
      {clearable(group).length > 0 && (
        <CommandGroup heading={group.heading}>
          <ClearFilters label={clearLabel(group)} onSelect={() => clear(clearable(group))} />
        </CommandGroup>
      )}
      {group.facets.map((facet) => (
        <CommandGroup key={facet.id} heading={facetHeading(group, facet)}>
          {facet.options.map((option) => (
            <CommandItem
              key={option.value}
              value={`${option.label} ${facet.label} ${group.scope ?? ''} filter`}
              keywords={['filter', facet.label, ...(group.scope ? [group.scope] : [])]}
              icon='IconSettingsSliderHorFilled'
              onSelect={() => pick(facet, option.value)}
            >
              {option.label}
              <CommandHint>{group.scope ? `${group.scope} · ${facet.label}` : facet.label}</CommandHint>
              {facet.value === option.value && <Current />}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </Fragment>
  ));
}

function WorkspacesPage({
  workspaces,
  current,
  go,
}: {
  workspaces: Workspace[];
  current: Workspace | null;
  go: (to: string) => void;
}) {
  return (
    <CommandGroup heading='Workspaces'>
      {workspaces.map((entry) => (
        <CommandItem
          key={entry.id}
          value={values.workspace(entry, 'page')}
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
  link,
  go,
}: {
  tenants: Tenant[];
  current: Tenant | null;
  base: string;
  link: (entry: Tenant) => string;
  go: (to: string) => void;
}) {
  return (
    <CommandGroup heading='Tenants'>
      {tenants.map((entry) => (
        <CommandItem
          key={entry.id}
          value={values.tenant(entry, 'page')}
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
  admin,
  workspace,
  tenants,
  tenant,
  quickstart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  workspaces: Workspace[];
  admin: boolean;
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
  const headerActions = useRegisteredActions();
  const facets = useRegisteredFacets();
  const searchFields = useRegisteredSearchFields();
  const base = `/${slug}`;
  const current = relativePath(pathname, base);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<Page>('root');
  const [selected, setSelected] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const restoreFocus = useRef(true);
  const openedFrom = useRef<HTMLElement | null>(null);
  const cameFrom = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const searching = page === 'root' && trimmed.length >= SEARCH_MIN_LENGTH;
  const results = searching && search.data?.q === trimmed ? search.data.results : [];
  const looking = searching && (search.state !== 'idle' || search.data?.q !== trimmed);
  const grouped = SEARCH_KINDS.map((kind) => ({
    kind,
    entries: results.filter((result) => result.kind === kind),
  })).filter((group) => group.entries.length > 0);
  const sections = listSections(quickstart);
  const switchableWorkspaces = workspaces.length > 1;
  const switchableTenants = tenants.length > 1;
  const recentEntries = recent
    .map((entry) => describePath(entry.path))
    .filter(isJump)
    .filter((entry) => entry.path !== current)
    .slice(0, RECENT_SHOWN);
  const tenantLink = (entry: Tenant) => {
    return entry.slug === tenant?.slug ? pathname : `${pathname}?tenant=${entry.slug}`;
  };
  const targets = new Map<string, string>([
    ...sections.flatMap((section) =>
      section.entries.map((entry): [string, string] => [
        normalize(values.destination(entry)),
        `${base}${entry.path}`,
      ])
    ),
    ...recentEntries.map((entry): [string, string] => [
      normalize(values.recent(entry)),
      `${base}${entry.path}`,
    ]),
    ...results.map((entry): [string, string] => [
      normalize(values.result(entry)),
      resolveResultPath(base, entry),
    ]),
    ...workspaces.flatMap((entry): [string, string][] => [
      [normalize(values.workspace(entry, 'root')), `/${entry.slug}`],
      [normalize(values.workspace(entry, 'page')), `/${entry.slug}`],
    ]),
    ...tenants.flatMap((entry): [string, string][] => [
      [normalize(values.tenant(entry, 'root')), tenantLink(entry)],
      [normalize(values.tenant(entry, 'page')), tenantLink(entry)],
    ]),
    ...registered.flatMap((command): [string, string][] =>
      'to' in command && !command.external ? [[normalize(command.label), command.to]] : []
    ),
    [normalize(values.lookup(trimmed)), `${base}/subscribers?q=${encodeURIComponent(trimmed)}`],
    [normalize(values.audit(trimmed)), `${base}/settings/audit-log?q=${encodeURIComponent(trimmed)}`],
  ]);
  const prefetch = targets.get(normalize(selected));

  const close = () => onOpenChange(false);

  const finalFocus = () => {
    if (!restoreFocus.current) return false;
    const origin = openedFrom.current;
    if (origin?.isConnected && origin !== document.body) return origin;
    return false;
  };

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

  const enter = (next: Page, first: string, from: string) => {
    cameFrom.current = from;
    setPage(next);
    setQuery('');
    setSelected(first);
  };

  const type = (value: string) => {
    setQuery(value);
    setSelected('');
  };

  const back = () => {
    setPage('root');
    setSelected(cameFrom.current);
  };

  const clearFilters = (entries: FilterFacet[]) => {
    close();
    for (const facet of entries) facet.onValueChange(null);
  };

  const openFacet = facets.find((facet) => facetPage(facet) === page) ?? null;
  const crumb = openFacet ? openFacet.label : (PAGE_LABELS[page] ?? null);

  const pick = (facet: FilterFacet, value: string | null) => {
    close();
    facet.onValueChange(value);
  };

  useEffect(() => {
    if (current === null || describePath(current) === null) return;
    rememberRecent(slug, current);
  }, [slug, current]);

  useEffect(() => {
    if (!searching) return;
    const timer = window.setTimeout(() => {
      void search.load(`${base}/search?q=${encodeURIComponent(trimmed)}${admin ? '&all=true' : ''}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searching, trimmed, base, admin, search.load]);

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

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, page]);

  useCommandHotkeys({ open, onOpenChange, base });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} finalFocus={finalFocus}>
      <Command value={selected} onValueChange={setSelected} filter={scoreCommand}>
        <CommandInput
          ref={inputRef}
          autoFocus
          value={query}
          onValueChange={type}
          placeholder={openFacet ? `Filter by ${openFacet.label.toLowerCase()}…` : PLACEHOLDERS[page]}
          start={crumb !== null && <Crumb>{crumb}</Crumb>}
          end={looking ? <Spinner className='size-4 text-fg-2' /> : <Kbd>esc</Kbd>}
          onKeyDown={(event) => {
            if (event.key !== 'Backspace' || query !== '' || page === 'root') return;
            event.preventDefault();
            back();
          }}
        />
        <CommandList>
          {page === 'root' && (
            <>
              {(headerActions.length > 0 || registered.length > 0) && (
                <CommandGroup heading='On this page'>
                  {headerActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={action.label}
                      icon={action.icon as IconName | undefined}
                      onSelect={() => {
                        restoreFocus.current = false;
                        close();
                        setTimeout(action.activate, 0);
                      }}
                    >
                      {action.label}
                    </CommandItem>
                  ))}
                  {registered.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={command.label}
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
                      value={values.result(result)}
                      keywords={[trimmed, result.label, result.hint]}
                      icon={result.icon}
                      onSelect={() => go(resolveResultPath(base, result))}
                    >
                      <span className='truncate'>{result.label}</span>
                      <CommandHint>{result.hint}</CommandHint>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              <FacetGroups
                facets={facets}
                typing={trimmed !== ''}
                enter={enter}
                pick={pick}
                clear={clearFilters}
              />

              {trimmed === '' && recentEntries.length > 0 && (
                <CommandGroup heading='Recent'>
                  {recentEntries.map((entry) => (
                    <CommandItem
                      key={entry.path}
                      value={values.recent(entry)}
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
                <Fragment key={section.label}>
                  {section.label === 'Workspace' && (switchableWorkspaces || switchableTenants) && (
                    <CommandGroup heading='Switch'>
                      {switchableWorkspaces && (
                        <CommandItem
                          value='switch workspace'
                          keywords={['change', 'account', 'organization', 'workspaces']}
                          icon='IconLayersTwoFilled'
                          onSelect={() =>
                            enter('workspaces', values.workspace(workspaces[0]!, 'page'), 'switch workspace')
                          }
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
                          onSelect={() =>
                            enter('tenants', values.tenant(tenants[0]!, 'page'), 'switch tenant')
                          }
                        >
                          Switch tenant
                          {tenant && <CommandHint>{tenant.name}</CommandHint>}
                          <Icon name='IconChevronRightMedium' className='ml-auto size-4' />
                        </CommandItem>
                      )}
                    </CommandGroup>
                  )}
                  <CommandGroup heading={section.label}>
                    {section.entries.map((destination) => (
                      <CommandItem
                        key={destination.path}
                        value={values.destination(destination)}
                        keywords={destination.keywords}
                        icon={destination.icon}
                        onSelect={() => go(`${base}${destination.path}`)}
                      >
                        {destination.label}
                        {destination.chord && (
                          <CommandShortcut keys={['G', destination.chord.toUpperCase()]} />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Fragment>
              ))}

              {trimmed !== '' && switchableWorkspaces && (
                <CommandGroup heading='Workspaces'>
                  {workspaces.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={values.workspace(entry, 'root')}
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
                      value={values.tenant(entry, 'root')}
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
                  {searchFields.map((field) => (
                    <CommandItem
                      key={field.id}
                      forceMount
                      value={values.field(field, trimmed)}
                      keywords={[trimmed]}
                      icon='IconMagnifyingGlass'
                      onSelect={() => {
                        close();
                        field.onValueChange(trimmed);
                      }}
                    >
                      {field.label} for “{trimmed}”
                    </CommandItem>
                  ))}
                  <CommandItem
                    forceMount
                    value={values.lookup(trimmed)}
                    keywords={[trimmed]}
                    icon='IconTeamFilled'
                    onSelect={() => go(`${base}/subscribers?q=${encodeURIComponent(trimmed)}`)}
                  >
                    Look up subscriber “{trimmed}”
                  </CommandItem>
                  {current !== '/settings/audit-log' && (
                    <CommandItem
                      forceMount
                      value={values.audit(trimmed)}
                      keywords={[trimmed]}
                      icon='IconHistoryFilled'
                      onSelect={() => go(`${base}/settings/audit-log?q=${encodeURIComponent(trimmed)}`)}
                    >
                      Search the audit log for “{trimmed}”
                    </CommandItem>
                  )}
                </CommandGroup>
              )}

              <CommandGroup heading='Help'>
                <CommandItem
                  value='documentation docs'
                  keywords={['guide', 'help', 'manual']}
                  icon='IconBookFilled'
                  onSelect={() => openExternal(DOCS_URL)}
                >
                  Documentation
                  <CommandHint>docs.buzzkit.dev</CommandHint>
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
                <CommandItem
                  value='api reference'
                  keywords={['endpoints', 'openapi', 'rest']}
                  icon='IconCodeLargeFilled'
                  onSelect={() => openExternal(`${DOCS_URL}/api-reference/introduction`)}
                >
                  API reference
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
                <CommandItem
                  value='quickstart guide'
                  keywords={['setup', 'install', 'sdk', 'getting started']}
                  icon='IconRocketFilled'
                  onSelect={() => openExternal(`${DOCS_URL}/quickstart`)}
                >
                  Quickstart guide
                  <Icon name='IconArrowUpRight' className='ml-auto size-4' />
                </CommandItem>
              </CommandGroup>

              <CommandGroup heading='Account'>
                <CommandItem
                  value='copy link to this page'
                  keywords={['url', 'share', 'clipboard']}
                  icon='IconChainLink3Filled'
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

          {page === 'workspaces' && <WorkspacesPage workspaces={workspaces} current={workspace} go={go} />}

          {page === 'tenants' && (
            <TenantsPage tenants={tenants} current={tenant} base={base} link={tenantLink} go={go} />
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
