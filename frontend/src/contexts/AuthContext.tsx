import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setApiAccessToken, API_BASE_URL } from '../api/listings';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // no initial session to restore

  // Keep the API layer's token in sync
  useEffect(() => {
    setApiAccessToken(accessToken);
  }, [accessToken]);

  // ---- helpers ----

  const applySession = (data: { user: AuthUser; session: { access_token: string; refresh_token: string } | null }) => {
    setUser(data.user);
    if (data.session) {
      setAccessToken(data.session.access_token);
      setRefreshToken(data.session.refresh_token);
    }
  };

  const clearSession = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  };

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

      applySession(json.data);
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

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

      applySession(json.data);
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

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
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, signUp, signIn, signOut }}>
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
