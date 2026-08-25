import { useEffect, useState } from 'react';
import { useNavigate, useNavigation, useSearchParams } from 'react-router';

const PAGE_PARAMS = ['cursor', 'trail'];

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
      navigate(build(Object.fromEntries([...keys, 'q'].map((key) => [key, null]))));
    },
  };
}
