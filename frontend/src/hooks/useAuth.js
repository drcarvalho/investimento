import React from 'react';
import { apiFetch } from '../api';

const TOKEN_KEY = 'investanalytics_auth_token';

export function getStoredAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('auth-updated'));
  } catch {}
}

export function useAuth() {
  const [status, setStatus] = React.useState({
    multiUserEnabled: false,
    enforced: false,
    authenticated: false,
    user: null,
    loading: true,
  });

  const refresh = React.useCallback(() => {
    const token = getStoredAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    apiFetch('/api/auth/status', headers ? { headers } : {})
      .then((res) => setStatus({ ...res, loading: false }))
      .catch(() => setStatus((prev) => ({ ...prev, loading: false })));
  }, []);

  React.useEffect(() => {
    refresh();
    window.addEventListener('auth-updated', refresh);
    return () => window.removeEventListener('auth-updated', refresh);
  }, [refresh]);

  return {
    ...status,
    refresh,
    signOut: () => setStoredAuthToken(''),
  };
}
