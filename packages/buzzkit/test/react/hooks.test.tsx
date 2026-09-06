import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../src/core/errors';
import { BuzzKitProvider, useBuzzKit, useIdentity } from '../../src/react/context';
import { useIdentify, usePreferences, useTrack } from '../../src/react/hooks';
import { envelope, failure, page, type Stub, stub } from '../utils/stub';

const identity = { externalId: 'user_123', identityHash: 'deadbeef' };

const preference = {
  id: 'tpc_1',
  slug: 'product-updates',
  name: 'Product updates',
  description: null,
  category: null,
  channels: { push: { optedIn: true, isDefault: false } },
};

afterEach(cleanup);

function wrapperFor(source: Stub) {
  return ({ children }: { children: ReactNode }) => (
    <BuzzKitProvider
      publishableKey='bk_pk_public'
      baseUrl='https://api.test'
      identity={identity}
      fetch={source.fetch}
    >
      {children}
    </BuzzKitProvider>
  );
}

describe('useBuzzKit', () => {
  it('refuses to run outside a provider', () => {
    expect(() => renderHook(() => useBuzzKit())).toThrow(ConfigurationError);
  });

  it('hands out the client and its identity inside a provider', () => {
    const source = stub([]);
    const { result } = renderHook(() => ({ client: useBuzzKit(), identity: useIdentity() }), {
      wrapper: wrapperFor(source),
    });

    expect(result.current.client.identity).toEqual(identity);
    expect(result.current.identity).toEqual(identity);
  });

  it('keeps the same client across re-renders', () => {
    const source = stub([]);
    const { result, rerender } = renderHook(() => useBuzzKit(), { wrapper: wrapperFor(source) });

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});

describe('usePreferences', () => {
  it('loads on mount', async () => {
    const source = stub([page([preference])]);
    const { result } = renderHook(() => usePreferences(), { wrapper: wrapperFor(source) });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([preference]);
    expect(result.current.error).toBeNull();
    expect(source.calls).toHaveLength(1);
  });

  it('surfaces a load failure without throwing', async () => {
    const source = stub([failure(401, { code: 'invalid_identity_hash' })]);
    const { result } = renderHook(() => usePreferences(), { wrapper: wrapperFor(source) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });

  it('replaces the list from the update response', async () => {
    const muted = { ...preference, channels: { push: { optedIn: false, isDefault: false } } };
    const source = stub([page([preference]), page([muted])]);
    const { result } = renderHook(() => usePreferences(), { wrapper: wrapperFor(source) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.update({ 'product-updates': { push: false } });
    });

    expect(result.current.data).toEqual([muted]);
    expect(source.calls[1]?.method).toBe('PATCH');
  });

  it('refetches on refresh', async () => {
    const source = stub([page([preference]), page([preference])]);
    const { result } = renderHook(() => usePreferences(), { wrapper: wrapperFor(source) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.refresh();
    });

    expect(source.calls).toHaveLength(2);
  });
});

describe('useIdentify', () => {
  it('does not call the API until asked', () => {
    const source = stub([]);
    const { result } = renderHook(() => useIdentify({ email: 'ada@acme.com' }), {
      wrapper: wrapperFor(source),
    });

    expect(source.calls).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('identifies with the hook params', async () => {
    const source = stub([envelope({ id: 'sbr_1', externalId: 'user_123' })]);
    const { result } = renderHook(() => useIdentify({ email: 'ada@acme.com' }), {
      wrapper: wrapperFor(source),
    });

    await act(async () => {
      await result.current.identify();
    });

    expect(source.calls[0]?.body).toMatchObject({ email: 'ada@acme.com', externalId: 'user_123' });
    expect(result.current.data).toEqual({ id: 'sbr_1', externalId: 'user_123' });
  });

  it('lets a call override the hook params', async () => {
    const source = stub([envelope({ id: 'sbr_1' })]);
    const { result } = renderHook(() => useIdentify({ email: 'ada@acme.com' }), {
      wrapper: wrapperFor(source),
    });

    await act(async () => {
      await result.current.identify({ attributes: { plan: 'pro' } });
    });

    expect(source.calls[0]?.body).toMatchObject({ attributes: { plan: 'pro' } });
    expect(source.calls[0]?.body).not.toMatchObject({ email: 'ada@acme.com' });
  });

  it('records the error and still rejects so the caller can react', async () => {
    const source = stub([failure(401, { code: 'identity_required' })]);
    const { result } = renderHook(() => useIdentify(), { wrapper: wrapperFor(source) });

    await act(async () => {
      await expect(result.current.identify()).rejects.toBeInstanceOf(Error);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useTrack', () => {
  it('returns a stable function that posts one event', async () => {
    const source = stub([page([{ id: 'evt_1' }])]);
    const { result, rerender } = renderHook(() => useTrack(), { wrapper: wrapperFor(source) });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    await act(async () => {
      await result.current('pricing.viewed', { plan: 'pro' });
    });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/client/events');
    expect(source.calls[0]?.body).toMatchObject({
      source: 'web',
      events: [{ name: 'pricing.viewed', data: { plan: 'pro' } }],
    });
  });
});

describe('BuzzKitProvider', () => {
  it('works with only a publishable key', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BuzzKitProvider publishableKey='bk_pk_public'>{children}</BuzzKitProvider>
    );
    const { result } = renderHook(() => useIdentity(), { wrapper });

    expect(result.current).toBeNull();
  });

  it('rebuilds the client when the identity changes', () => {
    const CurrentSubscriber = () => <span>{useIdentity()?.externalId ?? 'none'}</span>;
    const tree = (externalId: string) => (
      <BuzzKitProvider publishableKey='bk_pk_public' identity={{ externalId }}>
        <CurrentSubscriber />
      </BuzzKitProvider>
    );

    const { container, rerender } = render(tree('user_1'));
    expect(container.textContent).toBe('user_1');

    rerender(tree('user_2'));
    expect(container.textContent).toBe('user_2');
  });

  it('keeps one client when the identity object is rebuilt with the same values', () => {
    const source = stub([]);
    const seen = new Set<unknown>();
    function Probe() {
      seen.add(useBuzzKit());
      return null;
    }
    const tree = () => (
      <BuzzKitProvider
        publishableKey='bk_pk_public'
        baseUrl='https://api.test'
        identity={{ externalId: 'user_123', identityHash: 'deadbeef' }}
        fetch={source.fetch}
      >
        <Probe />
      </BuzzKitProvider>
    );

    const { rerender } = render(tree());
    rerender(tree());

    expect(seen.size).toBe(1);
  });

  it('never lets an older refresh overwrite a newer one', async () => {
    const slow = { ...preference, slug: 'slow' };
    const fast = { ...preference, slug: 'fast' };
    let releaseSlow = () => {};
    const source = stub([
      () =>
        new Promise<Response>((resolve) => {
          releaseSlow = () => resolve(page([slow]));
        }),
      page([fast]),
    ]);

    const { result } = renderHook(() => usePreferences(), { wrapper: wrapperFor(source) });

    await act(async () => {
      await result.current.refresh();
      releaseSlow();
    });
    await waitFor(() => expect(result.current.data?.[0]?.slug).toBe('fast'));

    expect(result.current.data?.[0]?.slug).toBe('fast');
  });
});
