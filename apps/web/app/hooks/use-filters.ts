import { useEffect, useState } from 'react';
import { useNavigate, useNavigation, useSearchParams } from 'react-router';

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

export function useFilters<K extends string>(keys: readonly K[]) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const query = params.get('q') ?? '';
  const [search, setSearch] = useState(query);
  const settled = search.trim() === query;

  const build = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const key of PAGE_PARAMS) next.delete(key);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    const encoded = next.toString();
    return encoded ? `?${encoded}` : '.';
  };

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => navigate(build({ q: search.trim() }), { replace: true }), 300);
    return () => clearTimeout(timer);
  });

  const values = Object.fromEntries(keys.map((key) => [key, params.get(key)])) as Record<K, string | null>;
  const active = keys.some((key) => params.get(key)) || query.length > 0;

  return {
    values,
    query,
    search,
    setSearch,
    searching: !settled || navigation.state === 'loading',
    active,
    set: (key: K, value: string | null) => navigate(build({ [key]: value })),
    clear: () => {
      setSearch('');
      void navigate(build(Object.fromEntries([...keys, 'q'].map((key) => [key, null]))));
    },
  };
}
