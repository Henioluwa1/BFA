import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to attach active Property ID if selected
api.interceptors.request.use((config) => {
  const activePropertyId = localStorage.getItem('bfa_active_property_id');
  if (activePropertyId && activePropertyId !== 'all') {
    config.headers['X-Property-Id'] = activePropertyId;
  }
  return config;
});

// Response interceptor for standardized error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorResponse = error.response?.data?.error || {
      code: 'NETWORK_ERROR',
      message: error.message || 'Unable to connect to BFA API server.',
    };
    return Promise.reject(errorResponse);
  }
);

export const systemService = {
  checkHealth: () => api.get('/health'),
  ping: () => api.get('/health/ping'),
  getSystemInfo: () => api.get('/system/info'),
};

export default api;
