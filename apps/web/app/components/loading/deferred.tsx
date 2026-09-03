import { Suspense, useEffect } from 'react';
import { Await, useLocation } from 'react-router';
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
  const cached = recallPage<T>(pathname);

  return (
    <Suspense fallback={children(cached, true)}>
      <Await resolve={resolve}>
        {(data: T) => (
          <Resolved cacheKey={pathname} data={data}>
            {children(data, false)}
          </Resolved>
        )}
      </Await>
    </Suspense>
  );
}
