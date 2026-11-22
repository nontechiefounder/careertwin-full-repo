'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to sync token to cookie for server-side access
  const syncTokenToCookie = useCallback((token) => {
    if (typeof document === 'undefined') return;
    const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
    const cookieName = `sb-${projectHost}-auth-token`;
    
    if (token) {
      const cookieValue = JSON.stringify({ access_token: token });
      // Use a simple cookie string for localhost compatibility
      document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)}; path=/; SameSite=Lax`;
      console.log(`[Auth] Synced token to cookie: ${cookieName}`);
    } else {
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      console.log(`[Auth] Cleared auth cookie`);
    }
  }, []);

  // Internal helper to clear all local client auth state
  const clearClientAuthState = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ct_token');
      localStorage.removeItem('ct_user');
    }
    syncTokenToCookie(null);
    setUser(null);
  }, [syncTokenToCookie]);

  // Sync Supabase session with local state
  useEffect(() => {
    const getInitialSession = async () => {
      if (typeof window === 'undefined') return;

      const storedUser = localStorage.getItem('ct_user');
      const storedToken = localStorage.getItem('ct_token');
      
      let isStaleMock = false;
      if (storedToken === 'mock-token') {
        isStaleMock = true;
      }
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed?.is_mock) isStaleMock = true;
        } catch (_) {}
      }

      // Check cookie for stale mock token
      if (typeof document !== 'undefined') {
        const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
        const cookieName = `sb-${projectHost}-auth-token`;
        const match = document.cookie.match(new RegExp('(?:^|; )' + cookieName.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        if (match) {
          try {
            const decoded = JSON.parse(decodeURIComponent(match[1]));
            if (decoded?.access_token === 'mock-token') {
              isStaleMock = true;
            }
          } catch (_) {}
        }
      }

      if (isStaleMock) {
        clearClientAuthState();
        setLoading(false);
        return;
      }

      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          localStorage.setItem('ct_token', session.access_token);
          syncTokenToCookie(session.access_token);
          // Try to fetch profile from backend
          try {
            const res = await api.get('/auth/me');
            const profile = res.data;
            setUser(profile);
            localStorage.setItem('ct_user', JSON.stringify(profile));
          } catch (err) {
            if (err.response?.status === 401) {
              // Server rejected authentication: clear stale local credentials
              clearClientAuthState();
            } else {
              console.error("Profile sync error on init:", err);
              clearClientAuthState();
            }
          }
        }
      } catch (err) {
        console.error("Initial session error:", err);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (typeof window === 'undefined') return;

        if (session) {
          localStorage.setItem('ct_token', session.access_token);
          syncTokenToCookie(session.access_token);
          try {
            const res = await api.get('/auth/me');
            const profile = res.data;
            setUser(profile);
            localStorage.setItem('ct_user', JSON.stringify(profile));
          } catch (err) {
            if (err.response?.status === 401) {
              clearClientAuthState();
            } else {
              console.error("Auth state change profile sync error:", err);
              clearClientAuthState();
            }
          }
        } else if (event === 'SIGNED_OUT') {
          clearClientAuthState();
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [syncTokenToCookie, clearClientAuthState]);

  const login = useCallback(async (email, password) => {
    try {
      const res = await api.post('/auth/signin', { email, password });
      const { user, session } = res.data;

      if (session) {
        if (session.access_token === 'mock-token') {
          clearClientAuthState();
          throw new Error("Invalid or deprecated session token");
        }

        if (supabase) {
          // Sync the real session to the local Supabase client
          const { error: setSessionError } = await supabase.auth.setSession(session);
          if (setSessionError) console.error("[Auth] Error setting session:", setSessionError);
        }
        
        localStorage.setItem('ct_token', session.access_token);
        syncTokenToCookie(session.access_token);
      }

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isFreshSignUp');
      }

      // The onAuthStateChange listener will eventually update the user state,
      // but we return the user object immediately for the UI.
      const loginUser = {
        id: user.id,
        email: user.email,
        role: user.role || null,
        name: user.name || user.user_metadata?.name || 'User',
        company: user.company || user.user_metadata?.company || null
      };
      
      return loginUser;
    } catch (err) {
      console.error("[Auth] Login error:", err);
      const errorMessage = err.response?.data?.error || err.message || "Failed to sign in";
      throw new Error(errorMessage);
    }
  }, [syncTokenToCookie, clearClientAuthState]);

  const loginWithProvider = useCallback(async (provider) => {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    });
    if (error) throw error;
    return data;
  }, []);

  const register = useCallback(async (email, password, name, role, company = null) => {
    try {
      const res = await api.post('/auth/signup', {
        email,
        password,
        data: {
          name,
          role,
          company
        }
      });
      
      const { user, session, account_created, delivery_status, email_sent, retry_supported, message } = res.data;

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isFreshSignUp', 'true');
        if (session) {
          localStorage.setItem('ct_token', session.access_token);
          syncTokenToCookie(session.access_token);
        }
      }
      
      return { user, account_created, delivery_status, email_sent, retry_supported, message };
    } catch (err) {
      console.error("Registration error:", err);
      const data = err.response?.data || {};
      const errorMessage = data.message || data.error || err.message || "Failed to register";
      const wrapped = new Error(errorMessage);
      wrapped.accountCreated = Boolean(data.account_created);
      wrapped.deliveryStatus = data.delivery_status || null;
      wrapped.retrySupported = Boolean(data.retry_supported);
      throw wrapped;
    }
  }, [syncTokenToCookie]);

  const logout = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signout error:", err);
    }
    
    clearClientAuthState();
    if (typeof window !== 'undefined') {
      window.location.href = '/auth';
    }
  }, [clearClientAuthState]);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithProvider, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
