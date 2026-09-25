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
        
        if (isAuthRequest) {
          return Promise.reject(error);
        }

        const currentPath = window.location.pathname;
        if (currentPath !== '/auth' && currentPath !== '/') {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
