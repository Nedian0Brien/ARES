import { useEffect, useMemo, useState } from 'react';
import { appUrl } from './api.js';

function useEventSource(path, handlers = {}, { enabled = true } = {}) {
  const [status, setStatus] = useState(enabled && path ? 'connecting' : 'idle');

  useEffect(() => {
    if (!enabled || !path) {
      setStatus('idle');
      return undefined;
    }

    if (typeof window.EventSource !== 'function') {
      setStatus('unsupported');
      return undefined;
    }

    const source = new EventSource(appUrl(path).href);
    setStatus('connecting');
    source.onopen = () => setStatus('open');
    source.onerror = () => setStatus('error');

    const listeners = Object.entries(handlers).map(([eventName, handler]) => {
      const listener = (event) => handler(JSON.parse(event.data || '{}'), event);
      source.addEventListener(eventName, listener);
      return [eventName, listener];
    });

    return () => {
      for (const [eventName, listener] of listeners) {
        source.removeEventListener(eventName, listener);
      }
      source.close();
    };
  }, [enabled, handlers, path]);

  return status;
}

function useAgentRunEvents(runId, { enabled = true, onError, onProgress, onRun } = {}) {
  const [progressEvents, setProgressEvents] = useState([]);
  const [latestRun, setLatestRun] = useState(null);
  const [lastError, setLastError] = useState(null);
  const path = useMemo(
    () => (runId ? `api/agent-runs/${encodeURIComponent(runId)}/events` : ''),
    [runId],
  );
  const handlers = useMemo(
    () => ({
      error(payload, event) {
        setLastError(payload);
        onError?.(payload, event);
      },
      progress(payload, event) {
        setProgressEvents((events) => [...events, payload]);
        onProgress?.(payload, event);
      },
      run(payload, event) {
        setLatestRun(payload);
        onRun?.(payload, event);
      },
    }),
    [onError, onProgress, onRun],
  );
  const status = useEventSource(path, handlers, { enabled: enabled && Boolean(runId) });

  return {
    lastError,
    latestRun,
    progressEvents,
    status,
  };
}

export { useAgentRunEvents, useEventSource };
