import { useCallback, useEffect, useState } from 'react';

/**
 * Fetches on mount and whenever `deps` change.
 *
 * `loading` means "there is nothing to show yet" and `refreshing` means "the
 * data on screen is being replaced". Keeping those apart matters: a page that
 * blanks itself back to a skeleton every time a filter changes loses the
 * reader's place, and the flash is worse than briefly stale numbers.
 */
export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      setData(await fn());
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setPending(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);

  return {
    data,
    error,
    // Only true before anything has ever arrived.
    loading: pending && data === null,
    // True while replacing data that is already on screen.
    refreshing: pending && data !== null,
    reload: load,
    mutate: load,
  };
}
