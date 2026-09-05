import { Suspense, useEffect } from 'react';
import { Await, useLocation, useOutletContext } from 'react-router';
import { recallPage, rememberPage } from '@/app/lib/utils/stale';

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
  const { pathname } = useLocation();
  const context = useOutletContext<{ tenantSlug?: string } | undefined>();
  const cacheKey = `${context?.tenantSlug ?? ''}:${pathname}`;
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
