import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setApiAccessToken, API_BASE_URL } from '../api/listings';
import { setChatAccessToken } from '../api/chat';
import { setTransactionsAccessToken } from '../api/transactions';

interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  ghg_balance: number;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<{ error: Error | null }>;
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
    setChatAccessToken(accessToken);
    setTransactionsAccessToken(accessToken);
  }, [accessToken]);

  // ---- helpers ----

  // Fetch full user profile (including display_name) using a token
  const fetchMe = async (token: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load profile');
    return json.data.user as AuthUser;
  };

  const applySession = async (data: {
    user: { id: string; email: string };
    session: { access_token: string; refresh_token: string } | null;
  }) => {
    if (data.session) {
      setAccessToken(data.session.access_token);
      setRefreshToken(data.session.refresh_token);
      // Fetch full user with display_name
      const fullUser = await fetchMe(data.session.access_token);
      setUser(fullUser);
    } else {
      setUser({ id: data.user.id, email: data.user.email ?? '', display_name: null });
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

      await applySession(json.data);
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

      await applySession(json.data);
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
    <AuthContext.Provider value={{ user, accessToken, loading, signUp, signIn, signOut, updateProfile }}>
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
