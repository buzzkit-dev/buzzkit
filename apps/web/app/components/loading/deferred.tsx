import { Suspense, useEffect, useSyncExternalStore } from 'react';
import { Await, useLocation, useOutletContext } from 'react-router';
import { recallPage, rememberPage, subscribePages } from '@/app/lib/utils/stale';

function usePageCacheKey() {
  const { pathname } = useLocation();
  const context = useOutletContext<{ tenantSlug?: string } | undefined>();
  return `${context?.tenantSlug ?? ''}:${pathname}`;
}

export function usePageCold() {
  const cacheKey = usePageCacheKey();
  return useSyncExternalStore(
    subscribePages,
    () => recallPage(cacheKey) === undefined,
    () => true
  );
}

function Resolved({
  cacheKey,
  data,
  children,
}: {
  cacheKey: string;
  data: unknown;
  children: React.ReactNode;
}) {
  useEffect(() => {
    rememberPage(cacheKey, data);
  }, [cacheKey, data]);

  return children;
}

export function Deferred<T>({
  resolve,
  children,
}: {
  resolve: Promise<T>;
  children: (data: T | undefined, pending: boolean) => React.ReactNode;
}) {
  const cacheKey = usePageCacheKey();
  const cached = recallPage<T>(cacheKey);

  return (
    <Suspense key={cacheKey} fallback={children(cached, true)}>
      <Await resolve={resolve}>
        {(data: T) => (
          <Resolved cacheKey={cacheKey} data={data}>
            {children(data, false)}
          </Resolved>
        )}
      </Await>
    </Suspense>
  );
}
