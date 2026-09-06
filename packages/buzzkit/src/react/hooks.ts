import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IdentifyParams, PreferenceChanges } from '../client/buzzkit';
import type { Subscriber } from '../resources/subscribers';
import type { SubscriberPreference } from '../resources/topics';
import { useBuzzKit } from './context';

export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
};

export type PreferencesResult = AsyncState<SubscriberPreference[]> & {
  refresh: () => Promise<void>;
  update: (changes: PreferenceChanges) => Promise<SubscriberPreference[]>;
};

export type IdentifyResult = AsyncState<Subscriber> & {
  identify: (params?: IdentifyParams) => Promise<Subscriber>;
};

function useMounted() {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
}

function useLatestRequest() {
  const issued = useRef(0);

  return useMemo(() => {
    return {
      open: () => {
        issued.current += 1;
        return issued.current;
      },
      isLatest: (token: number) => issued.current === token,
    };
  }, []);
}

function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

export function usePreferences(): PreferencesResult {
  const client = useBuzzKit();
  const mounted = useMounted();
  const request = useLatestRequest();

  const [state, setState] = useState<AsyncState<SubscriberPreference[]>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    const token = request.open();
    setState((current) => ({ ...current, isLoading: true }));

    try {
      const preferences = await client.preferences();
      if (mounted.current && request.isLatest(token)) {
        setState({ data: preferences, error: null, isLoading: false });
      }
    } catch (caught) {
      if (mounted.current && request.isLatest(token)) {
        setState({ data: null, error: toError(caught), isLoading: false });
      }
    }
  }, [client, mounted, request]);

  const update = useCallback(
    async (changes: PreferenceChanges) => {
      const token = request.open();
      setState((current) => ({ ...current, isLoading: true }));

      try {
        const preferences = await client.updatePreferences(changes);
        if (mounted.current && request.isLatest(token)) {
          setState({ data: preferences, error: null, isLoading: false });
        }
        return preferences;
      } catch (caught) {
        if (mounted.current && request.isLatest(token)) {
          setState((current) => ({ ...current, error: toError(caught), isLoading: false }));
        }
        throw caught;
      }
    },
    [client, mounted, request]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh, update };
}

export function useIdentify(params?: IdentifyParams): IdentifyResult {
  const client = useBuzzKit();
  const mounted = useMounted();
  const request = useLatestRequest();
  const [state, setState] = useState<AsyncState<Subscriber>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const identify = useCallback(
    async (overrides?: IdentifyParams) => {
      const token = request.open();
      setState((current) => ({ ...current, isLoading: true }));

      try {
        const subscriber = await client.identify(overrides ?? params);
        if (mounted.current && request.isLatest(token)) {
          setState({ data: subscriber, error: null, isLoading: false });
        }
        return subscriber;
      } catch (caught) {
        if (mounted.current && request.isLatest(token)) {
          setState({ data: null, error: toError(caught), isLoading: false });
        }
        throw caught;
      }
    },
    [client, mounted, params, request]
  );

  return { ...state, identify };
}

export function useTrack(): (name: string, data?: Record<string, unknown>) => Promise<void> {
  const client = useBuzzKit();

  return useCallback(
    async (name: string, data?: Record<string, unknown>) => {
      await client.track(name, data);
    },
    [client]
  );
}
