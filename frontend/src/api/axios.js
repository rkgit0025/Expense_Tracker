import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  // NOTE: Do NOT set Accept-Encoding manually — browsers manage this automatically
  // and will block it as an "unsafe header" if you try to set it via JS.
  // The compression middleware on the backend handles gzip automatically.
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handler
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
