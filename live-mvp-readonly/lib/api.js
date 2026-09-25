import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ct_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

        // Clear tokens but avoid loop if already on /auth
        localStorage.removeItem('ct_token');
        localStorage.removeItem('ct_user');
        
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
