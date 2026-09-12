import { useEffect } from 'react';
import { useFetchers, useNavigation, useRevalidator } from 'react-router';

const LIVE_INTERVAL_MS = 5_000;

export function useLive(enabled = true) {
  const { revalidate, state } = useRevalidator();
  const navigation = useNavigation();
  const fetchers = useFetchers();

  const idle =
    state === 'idle' && navigation.state === 'idle' && fetchers.every((fetcher) => fetcher.state === 'idle');

  useEffect(() => {
    if (!enabled || !idle) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const timer = setInterval(refresh, LIVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, idle, revalidate]);
}
