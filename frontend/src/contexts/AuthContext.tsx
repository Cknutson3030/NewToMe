import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setApiAccessToken, API_BASE_URL } from '../api/listings';
import { setChatAccessToken } from '../api/chat';
import { setTransactionsAccessToken } from '../api/transactions';

const SESSION_STORAGE_KEY = 'newtome.auth.session';
const SESSION_TTL_MS = 30 * 60 * 1000;

type StoredSession = {
  accessToken: string;
  refreshToken: string | null;
  startedAt: number;
};

function getWebStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  const storage = (globalThis as any).localStorage;
  return storage ?? null;
}

function readStoredSession(): StoredSession | null {
  const storage = getWebStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed?.accessToken || !parsed?.startedAt) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? null,
      startedAt: Number(parsed.startedAt),
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession) {
  const storage = getWebStorage();
  if (!storage) return;

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // best-effort
  }
}

function clearStoredSession() {
  const storage = getWebStorage();
  if (!storage) return;

  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

function isSessionExpired(startedAt: number) {
  return Date.now() - startedAt >= SESSION_TTL_MS;
}

interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  ghg_balance: number;
  wallet_balance: number;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<{ error: Error | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the API layer's token in sync
  useEffect(() => {
    setApiAccessToken(accessToken);
    setChatAccessToken(accessToken);
    setTransactionsAccessToken(accessToken);
  }, [accessToken]);

  // ---- helpers ----

  // Fetch full user profile (including display_name) using a token
  const fetchMe = useCallback(async (token: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load profile');
    return json.data.user as AuthUser;
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setSessionStartedAt(null);
    clearStoredSession();
  }, []);

  // Restore web session after a refresh (until 30 minutes from login).
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (mounted) setLoading(false);
        return;
      }

      if (isSessionExpired(stored.startedAt)) {
        if (mounted) clearSession();
        if (mounted) setLoading(false);
        return;
      }

      try {
        const fullUser = await fetchMe(stored.accessToken);
        if (!mounted) return;

        setUser(fullUser);
        setAccessToken(stored.accessToken);
        setRefreshToken(stored.refreshToken);
        setSessionStartedAt(stored.startedAt);
      } catch {
        if (!stored.refreshToken) {
          if (mounted) clearSession();
          if (mounted) setLoading(false);
          return;
        }

        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: stored.refreshToken }),
          });
          const refreshJson = await refreshRes.json().catch(() => ({}));

          if (!refreshRes.ok || !refreshJson?.data?.session?.access_token) {
            throw new Error(refreshJson?.error || `Session refresh failed: ${refreshRes.status}`);
          }

          const nextAccessToken = refreshJson.data.session.access_token as string;
          const nextRefreshToken = (refreshJson.data.session.refresh_token ?? stored.refreshToken) as string | null;
          const fullUser = await fetchMe(nextAccessToken);

          if (!mounted) return;

          setUser(fullUser);
          setAccessToken(nextAccessToken);
          setRefreshToken(nextRefreshToken);
          setSessionStartedAt(stored.startedAt);
          writeStoredSession({
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            startedAt: stored.startedAt,
          });
        } catch {
          if (mounted) clearSession();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, [clearSession, fetchMe]);

  // Hard timeout: force re-login 30 minutes after sign-in.
  useEffect(() => {
    if (!accessToken || !sessionStartedAt) return;

    const checkExpiry = () => {
      if (isSessionExpired(sessionStartedAt)) {
        clearSession();
      }
    };

    checkExpiry();
    const timer = setInterval(checkExpiry, 15000);
    return () => clearInterval(timer);
  }, [accessToken, clearSession, sessionStartedAt]);

  // ---- public API ----

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        return { error: new Error(json.error || `Sign up failed: ${res.status}`) };
      }

      clearSession();
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [clearSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        return { error: new Error(json.error || `Login failed: ${res.status}`) };
      }

      if (!json?.data?.session?.access_token) {
        return { error: new Error('Login failed — no session returned') };
      }

      const startedAt = Date.now();
      const fullUser = await fetchMe(json.data.session.access_token);

      setUser(fullUser);
      setAccessToken(json.data.session.access_token);
      setRefreshToken(json.data.session.refresh_token ?? null);
      setSessionStartedAt(startedAt);
      writeStoredSession({
        accessToken: json.data.session.access_token,
        refreshToken: json.data.session.refresh_token ?? null,
        startedAt,
      });

      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [fetchMe]);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch {
      // best-effort
    }
    clearSession();
  }, [accessToken, clearSession]);

  const refreshUser = useCallback(async () => {
    if (!accessToken) return;
    try {
      const fullUser = await fetchMe(accessToken);
      setUser(fullUser);
    } catch {
      // best-effort
    }
  }, [accessToken]);

  const updateProfile = useCallback(async (displayName: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ display_name: displayName }),
      });

      const json = await res.json();

      if (!res.ok) {
        return { error: new Error(json.error || `Failed to update profile: ${res.status}`) };
      }

      setUser((prev) => (prev ? { ...prev, display_name: json.data.display_name } : null));
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, signUp, signIn, signOut, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
