import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createHookContext } from './createHookContext';
import { fetchJson } from './fetchJson';
import { jwtDecode } from 'jwt-decode';

const ACCESS_TOKEN_KEY = 'accessToken';
const SESSION_TOKEN_KEY = 'sessionToken';

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  sessionToken: string;
  accessToken: string;
  user: User;
}

type Value = [
  {
    expired: boolean;
    authToken?: string | null;
    user?: User | null;
    loading: boolean;
    error: Error | null;
  },
  {
    login: (username: string, password: string) => void;
    logout: () => void;
    signup: (name: string, email: string, password: string) => void;
  },
];

export function useAuth(): Value {
  console.log('useAuth')
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [accessToken, setAccessToken] = useState<string>(null)
  const [sessionToken, setSessionToken] = useState<string>(null)
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const decoded = useMemo(() => (accessToken ? jwtDecode<JwtPayload>(accessToken) : null), [accessToken]);
  const isExpired = useCallback(() => (decoded ? Date.now() >= decoded.exp * 1000 : true), [decoded]);
  const sessionDecoded = useMemo(() => (sessionToken ? jwtDecode<JwtPayload>(sessionToken) : null), [sessionToken]);
  const isSessionExpired = useCallback(() => (sessionDecoded ? Date.now() >= sessionDecoded.exp * 1000 : true), [sessionDecoded]);

  browser.storage.local.get().then(storage => {
    setAccessToken(storage.accessToken)
    setSessionToken(storage.sessionToken)
  })

  const getSelfProfile = useCallback(async () => {
    if (accessToken == null || isExpired() || (decoded && decoded.sub === user?.id)) {
      setLoading(false);

      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const data: User = await fetchJson('https://dev.companionintelligence.com/api/users/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setUser(data);
    } catch (error: unknown) {
      setUser(null);
      setError(error as Error);
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading, setError, isExpired, decoded, user, loading]);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const data: AuthResponse = await fetchJson('https://dev.companionintelligence.com/api/authenticate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: email,
            password,
          }),
        });

        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
        setUser(data.user);

        // navigate('/dashboard');
      } catch (error: unknown) {
        setUser(null);
        setError(error as Error);
      } finally {
        setLoading(false);
      }
    },
    [setUser, setError, setLoading],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    // TODO: This isn't good enough, we need to POST to the API to destroy the session.
    localStorage.removeItem(SESSION_TOKEN_KEY);

    setUser(null);
    setLoading(false);
    setError(null);

    // navigate('/');
  }, [setUser, setLoading, setError]);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const data: AuthResponse = await fetchJson('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        });

        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
        setUser(data.user);

        // navigate('/dashboard');
      } catch (error: unknown) {
        setUser(null);
        setError(error as Error);
      } finally {
        setLoading(false);
      }
    },
    [setUser, setError, setLoading],
  );

  // useAutoRefreshToken(accessToken, sessionToken, refresh);

  // useEffect(() => {
  //   getSelfProfile();
  // }, [decoded]);

  return [
    {
      expired: isExpired(),
      authToken: accessToken,
      sessionToken: sessionToken,
      user,
      loading,
      error,
    },
    {
      login,
      logout,
      signup,
    },
  ];
}

function useAutoRefreshToken(
  accessToken: string | null | undefined,
  refreshToken: string | null | undefined,
  onRefresh: (refreshToken: string) => Promise<void>,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!accessToken || !refreshToken) {
      return;
    }

    const decoded = jwtDecode(accessToken);
    const exp = (decoded.exp || 0) * 1000;
    const now = Date.now();
    const refreshAt = exp - 60 * 1000;
    const delay = Math.max(refreshAt - now, 0);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onRefresh(refreshToken);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [accessToken, refreshToken, onRefresh]);
}

// const { Provider, useHookContext } = createHookContext(useAuth);

// export { Provider as AuthProvider, useHookContext as useAuth };
