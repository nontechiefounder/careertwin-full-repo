import axios from 'axios';
import { supabase } from './supabase';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined' && supabase && !config.url?.includes('/auth/')) {
    try {
      // Canonical Active API Authentication Authority: Supabase Session Access Token
      const { data } = await supabase.auth.getSession();
      const sessionToken = data?.session?.access_token;
      if (sessionToken) {
        config.headers.Authorization = `Bearer ${sessionToken}`;
      }
    } catch (err) {
      console.warn("[API Interceptor] Supabase session retrieval warning:", err);
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        const url = error.config?.url || '';
        const isAuthRequest = url.includes('/auth/');
        
        // Clear cached credentials on 401 so client never loops
        try {
          localStorage.removeItem('ct_token');
          localStorage.removeItem('ct_user');
          const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
          document.cookie = 'ct_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          if (projectHost) {
            document.cookie = `sb-${projectHost}-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          }
        } catch (_) {}

        if (isAuthRequest) {
          return Promise.reject(error);
        }

        const currentPath = window.location.pathname;
        if (currentPath !== '/auth' && currentPath !== '/' && !window.__workbyline_redirecting_to_auth) {
          window.__workbyline_redirecting_to_auth = true;
          const redirectParam = encodeURIComponent(currentPath + window.location.search);
          window.location.href = `/auth?redirect_to=${redirectParam}`;
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
