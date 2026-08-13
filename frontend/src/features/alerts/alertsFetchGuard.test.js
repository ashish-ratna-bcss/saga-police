import {
  abortAlertsListFetchOnUnmount,
  shouldFetchAlertsForKey
} from './alertsFetchGuard';

describe('alertsFetchGuard', () => {
  const fetchKey = 'active|all|all||all|all|all|2026-08-07|2026-08-13';

  test('same key after a started fetch skips refetch (dedupe)', () => {
    let lastKey = '';
    expect(shouldFetchAlertsForKey(lastKey, fetchKey)).toBe(true);
    lastKey = fetchKey;
    expect(shouldFetchAlertsForKey(lastKey, fetchKey)).toBe(false);
  });

  test('tab change to a new key refetches', () => {
    const ackKey = fetchKey.replace('active|', 'acknowledged|');
    expect(shouldFetchAlertsForKey(fetchKey, ackKey)).toBe(true);
    expect(shouldFetchAlertsForKey(ackKey, fetchKey)).toBe(true);
  });

  test('StrictMode abort without clearing lastFetchKey leaves Active empty', () => {
    let lastKey = '';
    lastKey = fetchKey; // first mount started GET /alerts?status=active
    // old unmount cleanup: abort only
    const abort = jest.fn();
    abort();
    expect(shouldFetchAlertsForKey(lastKey, fetchKey)).toBe(false);
  });

  test('unmount abort clears lastFetchKey so remount refetches Active', () => {
    const abort = jest.fn();
    const fetchAbortRef = { current: { abort } };
    const lastFetchKeyRef = { current: fetchKey };
    const isFetchingRef = { current: true };

    abortAlertsListFetchOnUnmount({ fetchAbortRef, lastFetchKeyRef, isFetchingRef });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(fetchAbortRef.current).toBeNull();
    expect(lastFetchKeyRef.current).toBe('');
    expect(isFetchingRef.current).toBe(false);
    expect(shouldFetchAlertsForKey(lastFetchKeyRef.current, fetchKey)).toBe(true);
  });

  test('unmount cleanup is safe when no request is in flight', () => {
    const fetchAbortRef = { current: null };
    const lastFetchKeyRef = { current: '' };
    const isFetchingRef = { current: false };

    expect(() => abortAlertsListFetchOnUnmount({
      fetchAbortRef,
      lastFetchKeyRef,
      isFetchingRef
    })).not.toThrow();
    expect(lastFetchKeyRef.current).toBe('');
  });
});
