import { createContext, createElement, type ReactNode, useContext, useMemo } from 'react';
import { BuzzKitClient } from '../client/buzzkit';
import type { BrowserOptions, Identity } from '../client/options';
import { ConfigurationError } from '../core/errors';

export type BuzzKitProviderProps = BrowserOptions & {
  children: ReactNode;
};

const BuzzKitContext = createContext<BuzzKitClient | null>(null);

export function BuzzKitProvider(props: BuzzKitProviderProps) {
  const { children, publishableKey, identity, baseUrl, timeoutMs, maxRetries, headers, fetch } = props;

  const externalId = identity?.externalId ?? null;
  const identityHash = identity?.identityHash ?? null;
  const headerSignature = headers === undefined ? null : JSON.stringify(headers);

  const client = useMemo(() => {
    const restored =
      externalId === null ? undefined : { externalId, identityHash: identityHash ?? undefined };
    return new BuzzKitClient({
      publishableKey,
      identity: restored,
      baseUrl,
      timeoutMs,
      maxRetries,
      headers: headerSignature === null ? undefined : (JSON.parse(headerSignature) as typeof headers),
      fetch,
    });
  }, [publishableKey, externalId, identityHash, baseUrl, timeoutMs, maxRetries, headerSignature, fetch]);

  return createElement(BuzzKitContext.Provider, { value: client }, children);
}

export function useBuzzKit(): BuzzKitClient {
  const client = useContext(BuzzKitContext);
  if (!client) {
    throw new ConfigurationError('useBuzzKit must be called inside a <BuzzKitProvider>');
  }

  return client;
}

export function useIdentity(): Identity | null {
  return useBuzzKit().identity;
}
