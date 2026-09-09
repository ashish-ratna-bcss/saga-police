/**
 * Alerts list-fetch lifecycle guards.
 *
 * The page dedupes fetches with lastFetchKeyRef so RBAC/callback identity
 * changes do not re-hit GET /alerts. That key MUST be cleared whenever the
 * in-flight request is aborted on unmount — React 18 StrictMode simulates
 * unmount+remount while preserving refs. Otherwise:
 *
 *   mount → fetch Active (key set) → StrictMode abort → remount
 *   → key unchanged → no refetch → empty Active until a tab change.
 */

export function abortAlertsListFetchOnUnmount({
  fetchAbortRef,
  lastFetchKeyRef,
  isFetchingRef
} = {}) {
  if (fetchAbortRef?.current) {
    fetchAbortRef.current.abort();
    fetchAbortRef.current = null;
  }
  if (lastFetchKeyRef) lastFetchKeyRef.current = '';
  if (isFetchingRef) isFetchingRef.current = false;
}

export function shouldFetchAlertsForKey(lastFetchKey, nextKey) {
  return lastFetchKey !== nextKey;
}
