import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor to attach active Property ID and User Role
api.interceptors.request.use((config) => {
  const activePropertyId = localStorage.getItem('bfa_active_property_id');
  if (activePropertyId && activePropertyId !== 'all') {
    config.headers['X-Property-Id'] = activePropertyId;
  }

  const activeRole = localStorage.getItem('bfa_active_role') || 'admin';
  config.headers['X-User-Role'] = activeRole;

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

export const searchService = {
  search: (query, propertyId, type) =>
    api.get('/search', { params: { q: query, propertyId, type } }),
};

export const reservationService = {
  getAll: (params) => api.get('/reservations', { params }),
  getById: (id) => api.get(`/reservations/${id}`),
  create: (data) => api.post('/reservations', data),
};

export const reportService = {
  getFinancial: (params) => api.get('/reports/financial', { params }),
  getReservations: (params) => api.get('/reports/reservations', { params }),
  downloadCSV: (endpoint, filename) => {
    const activeRole = localStorage.getItem('bfa_active_role') || 'admin';
    const activePropertyId = localStorage.getItem('bfa_active_property_id');
    const url = `/api/v1/reports/${endpoint}?format=csv${
      activePropertyId && activePropertyId !== 'all' ? `&propertyId=${activePropertyId}` : ''
    }`;

    // Trigger browser file download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  downloadPDF: (filename) => {
    const activePropertyId = localStorage.getItem('bfa_active_property_id');
    const url = `/api/v1/reports/financial?format=pdf${
      activePropertyId && activePropertyId !== 'all' ? `&propertyId=${activePropertyId}` : ''
    }`;
    window.open(url, '_blank');
  },
};

export const auditService = {
  getLogs: (params) => api.get('/audit', { params }),
};

export { api };
export default api;
