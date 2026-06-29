import { useEffect, useState } from 'react';

const cache = new Map();

function useServerResource(key, loader, { enabled = true } = {}) {
  const cacheKey = Array.isArray(key) ? JSON.stringify(key) : String(key || '');
  const [state, setState] = useState(() => ({
    data: cache.get(cacheKey),
    error: null,
    loading: enabled && !cache.has(cacheKey),
  }));

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !cacheKey) {
      setState({ data: undefined, error: null, loading: false });
      return () => {
        cancelled = true;
      };
    }

    if (cache.has(cacheKey)) {
      setState({ data: cache.get(cacheKey), error: null, loading: false });
    } else {
      setState((current) => ({ ...current, loading: true }));
    }

    Promise.resolve()
      .then(loader)
      .then((data) => {
        cache.set(cacheKey, data);
        if (!cancelled) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ data: cache.get(cacheKey), error, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, loader]);

  return state;
}

function invalidateServerResource(key) {
  cache.delete(Array.isArray(key) ? JSON.stringify(key) : String(key || ''));
}

export { invalidateServerResource, useServerResource };
