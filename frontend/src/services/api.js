import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor to attach active Property ID and Bearer Token
api.interceptors.request.use((config) => {
  const activePropertyId = localStorage.getItem('bfa_active_property_id');
  if (activePropertyId && activePropertyId !== 'all') {
    config.headers['X-Property-Id'] = activePropertyId;
  }

  // Attach authoritative Bearer token from login
  const token = localStorage.getItem('bfa_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor for standardized error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorResponse = error.response?.data?.error || {
      code: error.response?.status === 401 ? 'UNAUTHORIZED' : 'NETWORK_ERROR',
      message: error.response?.data?.error?.message || error.message || 'Unable to connect to BFA API server.',
    };

    // If 401 UNAUTHORIZED on a protected route, trigger session cleanup
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
      localStorage.removeItem('bfa_auth_token');
      localStorage.removeItem('bfa_auth_user');
      window.location.href = '/login?expired=1';
    }

    return Promise.reject(errorResponse);
  }
);

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const publicService = {
  getProperties: () => api.get('/public/properties'),
  getApartments: (propertyId) => api.get('/public/apartments', { params: { propertyId } }),
  checkAvailability: (data) => api.post('/public/check-availability', data),
  createBooking: (data) => api.post('/public/booking', data),
};

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
    const token = localStorage.getItem('bfa_auth_token');
    const activePropertyId = localStorage.getItem('bfa_active_property_id');
    const url = `/api/v1/reports/${endpoint}?format=csv${
      activePropertyId && activePropertyId !== 'all' ? `&propertyId=${activePropertyId}` : ''
    }`;

    // Trigger browser file download with auth token in URL or fetch
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  },
  downloadPDF: (filename) => {
    const token = localStorage.getItem('bfa_auth_token');
    const activePropertyId = localStorage.getItem('bfa_active_property_id');
    const url = `/api/v1/reports/financial?format=pdf${
      activePropertyId && activePropertyId !== 'all' ? `&propertyId=${activePropertyId}` : ''
    }`;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const fileUrl = window.URL.createObjectURL(blob);
        window.open(fileUrl, '_blank');
      });
  },
};

export const auditService = {
  getLogs: (params) => api.get('/audit', { params }),
};

export { api };
export default api;
