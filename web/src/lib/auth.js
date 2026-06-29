import { useCallback } from 'react';
import { api, setCsrfToken } from './api.js';
import { useServerResource } from './serverState.js';

function useAuthSession() {
  const loadSession = useCallback(async () => {
    const session = await api('api/auth/me');
    setCsrfToken(session.csrfToken || '');
    return session;
  }, []);

  return useServerResource('auth/me', loadSession);
}

export { useAuthSession };
