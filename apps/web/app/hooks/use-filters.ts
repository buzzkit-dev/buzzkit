import { useEffect, useState, useSyncExternalStore } from 'react';
import { type NavigateOptions, useLocation, useNavigate, useNavigation, useSearchParams } from 'react-router';

const PAGE_PARAMS = ['cursor', 'trail'];

export const RANGES: Record<string, { label: string; hours: number }> = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
  '90d': { label: 'Last 90 days', hours: 24 * 90 },
  '12m': { label: 'Last 12 months', hours: 24 * 365 },
};

export function resolveRange(value: string | null): { from?: string; to?: string } {
  const preset = RANGES[value ?? ''];
  if (preset) return { from: new Date(Date.now() - preset.hours * 3_600_000).toISOString() };
  const custom = value?.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (!custom) return {};
  const from = new Date(`${custom[1]}T00:00:00.000Z`);
  const to = new Date(`${custom[2]}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return {};
  return { from: from.toISOString(), to: to.toISOString() };
}

export function resolveInterval(window: { from?: string; to?: string }): 'hour' | 'day' | 'week' | 'month' {
  const to = window.to ? new Date(window.to).getTime() : Date.now();
  const from = window.from ? new Date(window.from).getTime() : to - 7 * 24 * 3_600_000;
  const days = (to - from) / (24 * 3_600_000);
  if (days <= 2) return 'hour';
  if (days <= 120) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

type Heading = { search: string; anchor: string };

const headings = new Map<string, Heading>();
const listeners = new Set<() => void>();

function subscribeHeadings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setHeading(pathname: string, heading: Heading | null) {
  if (heading) headings.set(pathname, heading);
  else headings.delete(pathname);
  for (const listener of listeners) listener();
}

function useHeading() {
  const location = useLocation();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = location;
  const stored = useSyncExternalStore(
    subscribeHeadings,
    () => headings.get(pathname),
    () => undefined
  );
  const inflight =
    navigation.location && navigation.location.pathname === pathname
      ? new URLSearchParams(navigation.location.search)
      : null;
  const heading = stored && (stored.anchor === location.key || inflight !== null) ? stored : undefined;
  const selected = heading ? new URLSearchParams(heading.search) : (inflight ?? params);
  const outgoing = heading !== undefined || inflight !== null;

  useEffect(() => {
    if (stored && !heading) setHeading(pathname, null);
  }, [stored, heading, pathname]);

  return {
    params,
    selected,
    outgoing,
    differs: (key: string) => outgoing && selected.get(key) !== params.get(key),
    go: (next: URLSearchParams, options?: NavigateOptions) => {
      const search = next.toString();
      setHeading(pathname, { search, anchor: location.key });
      void navigate(search ? `?${search}` : '.', options);
    },
  };
}

export function useSelectedParams() {
  return useHeading().selected;
}

export function usePendingParam(key: string) {
  return useHeading().differs(key);
}

export function useFilters<K extends string>(keys: readonly K[]) {
  const { params, selected, outgoing, differs, go } = useHeading();
  const query = selected.get('q') ?? '';
  const [search, setSearch] = useState(query);
  const settled = search.trim() === query;
  const all = [...keys, 'q'];

  const build = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(selected);
    for (const key of PAGE_PARAMS) next.delete(key);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    return next;
  };

  const values = Object.fromEntries(keys.map((key) => [key, selected.get(key)])) as Record<K, string | null>;
  const clearing = outgoing && all.every((key) => !selected.get(key)) && all.some((key) => params.get(key));
  const pending = Object.fromEntries(keys.map((key) => [key, !clearing && differs(key)])) as Record<
    K,
    boolean
  >;
  const active = keys.some((key) => selected.get(key)) || query.length > 0 || clearing;
  const searching = !clearing && (!settled || differs('q'));

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => go(build({ q: search.trim() }), { replace: true }), 300);
    return () => clearTimeout(timer);
  });

  return {
    values,
    query,
    search,
    setSearch,
    searching,
    active,
    pending,
    clearing,
    set: (key: K, value: string | null) => go(build({ [key]: value })),
    clear: () => {
      setSearch('');
      go(build(Object.fromEntries(all.map((key) => [key, null]))));
    },
  };
}
