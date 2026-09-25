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

  // Sync Supabase session with local state
  useEffect(() => {
    const getInitialSession = async () => {
      if (typeof window === 'undefined') return;

      // Check for mock user first (for dev testing)
      const storedUser = localStorage.getItem('ct_user');
      const storedToken = localStorage.getItem('ct_token');
      
      if (storedUser && storedToken === 'mock-token') {
        const parsed = JSON.parse(storedUser);
        if (parsed.is_mock) {
            setUser(parsed);
            setLoading(false);
            syncTokenToCookie('mock-token');
            return;
        }
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
            if (err.code === 'ERR_NETWORK') {
              console.warn("Backend API is currently offline. Falling back to Supabase session data.");
            } else {
              console.error("Profile sync error on init:", err);
            }
            // Fallback to Supabase user if backend profile fails
            const sbUser = session.user;
            const fallbackProfile = {
                id: sbUser.id,
                email: sbUser.email,
                role: sbUser.user_metadata?.role || 'employer',
                name: sbUser.user_metadata?.name || 'User',
                company: sbUser.user_metadata?.company || null
            };
            setUser(fallbackProfile);
            localStorage.setItem('ct_user', JSON.stringify(fallbackProfile));
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

        // If we're using a mock token, let Supabase handle its own state but don't clear mock
        const storedToken = localStorage.getItem('ct_token');
        if (storedToken === 'mock-token' && event !== 'SIGNED_OUT') return;

        if (session) {
          localStorage.setItem('ct_token', session.access_token);
          syncTokenToCookie(session.access_token);
          try {
            const res = await api.get('/auth/me');
            const profile = res.data;
            setUser(profile);
            localStorage.setItem('ct_user', JSON.stringify(profile));
          } catch (err) {
            if (err.code === 'ERR_NETWORK') {
              console.warn("Auth state change profile sync error: API offline.");
            } else {
              console.error("Auth state change profile sync error:", err);
            }
            // Fallback to Supabase user
            const sbUser = session.user;
            const fallbackProfile = {
                id: sbUser.id,
                email: sbUser.email,
                role: sbUser.user_metadata?.role || 'employer',
                name: sbUser.user_metadata?.name || 'User',
                company: sbUser.user_metadata?.company || null
            };
            setUser(fallbackProfile);
            localStorage.setItem('ct_user', JSON.stringify(fallbackProfile));
          }
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem('ct_token');
          localStorage.removeItem('ct_user');
          syncTokenToCookie(null);
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const res = await api.post('/auth/signin', { email, password });
      const { user, session } = res.data;

      if (session) {
        if (session.access_token === 'mock-token') {
          // Handle mock session
          localStorage.setItem('ct_token', 'mock-token');
          syncTokenToCookie('mock-token');
          
          const mockUser = {
            id: user.id,
            email: user.email,
            role: user.user_metadata?.role || 'employer',
            name: user.user_metadata?.name || 'Admin Tester',
            company: user.user_metadata?.company || 'CareerTWiN Dev',
            is_mock: true
          };
          
          setUser(mockUser);
          localStorage.setItem('ct_user', JSON.stringify(mockUser));
          return mockUser;
        }

        if (supabase) {
          // Sync the real session to the local Supabase client
          const { error: setSessionError } = await supabase.auth.setSession(session);
          if (setSessionError) console.error("[Auth] Error setting session:", setSessionError);
        }
        
        localStorage.setItem('ct_token', session.access_token);
        syncTokenToCookie(session.access_token);
      }

      // The onAuthStateChange listener will eventually update the user state,
      // but we return the user object immediately for the UI.
      const loginUser = {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'employer',
        name: user.user_metadata?.name || 'User',
        company: user.user_metadata?.company || null
      };
      
      return loginUser;
    } catch (err) {
      console.error("[Auth] Login error:", err);
      const errorMessage = err.response?.data?.error || err.message || "Failed to sign in";
      throw new Error(errorMessage);
    }
  }, [syncTokenToCookie]);

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
      
      const { user, session } = res.data;

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isFreshSignUp', 'true');
        if (session) {
          localStorage.setItem('ct_token', session.access_token);
          syncTokenToCookie(session.access_token);
        }
      }
      
      return user;
    } catch (err) {
      console.error("Registration error:", err);
      const errorMessage = err.response?.data?.error || err.message || "Failed to register";
      throw new Error(errorMessage);
    }
  }, [syncTokenToCookie]);

  const logout = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signout error:", err);
    }
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ct_token');
      localStorage.removeItem('ct_user');
      syncTokenToCookie(null);
      setUser(null);
      window.location.href = '/auth';
    }
  }, []);

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
