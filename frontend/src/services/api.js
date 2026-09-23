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
  getAnnouncements: (params) => api.get('/public/announcements', { params }),
  verifyBooking: (data) => api.post('/public/booking-lookup', data),
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

export const propertyService = {
  getAll: (params) => api.get('/properties', { params }),
  getById: (id) => api.get(`/properties/${id}`),
  create: (data) => api.post('/properties', data),
  update: (id, data) => api.put(`/properties/${id}`, data),
  updateStatus: (id, data) => api.patch(`/properties/${id}/status`, data),
  getApartments: (id) => api.get(`/properties/${id}/apartments`),
};

export const apartmentService = {
  getAll: (params) => api.get('/apartments', { params }),
  getById: (id) => api.get(`/apartments/${id}`),
  create: (data) => api.post('/apartments', data),
  update: (id, data) => api.put(`/apartments/${id}`, data),
  updateStatus: (id, data) => api.patch(`/apartments/${id}/status`, data),
  checkAvailability: (id, params) => api.get(`/apartments/${id}/availability`, { params }),
  getBlockedPeriods: (id) => api.get(`/apartments/${id}/blocked-periods`),
  addBlockedPeriod: (id, data) => api.post(`/apartments/${id}/blocked-periods`, data),
  deleteBlockedPeriod: (id, blockId) => api.delete(`/apartments/${id}/blocked-periods/${blockId}`),
};

export const reservationService = {
  getAll: (params) => api.get('/reservations', { params }),
  getById: (id) => api.get(`/reservations/${id}`),
  create: (data) => api.post('/reservations', data),
  update: (id, data) => api.put(`/reservations/${id}`, data),
  confirm: (id) => api.post(`/reservations/${id}/confirm`),
  cancel: (id, data) => api.post(`/reservations/${id}/cancel`, data),
  checkIn: (id) => api.post(`/reservations/${id}/check-in`),
  checkOut: (id) => api.post(`/reservations/${id}/check-out`),
  noShow: (id, data) => api.post(`/reservations/${id}/no-show`, data),
  getHistory: (id) => api.get(`/reservations/${id}/history`),
};

export const calendarService = {
  getEvents: (params) => api.get('/calendar', { params }),
  getAvailability: (params) => api.get('/calendar/availability', { params }),
};

export const frontOfficeService = {
  getArrivals: (params) => api.get('/front-office/arrivals', { params }),
  getDepartures: (params) => api.get('/front-office/departures', { params }),
  getCurrentGuests: (params) => api.get('/front-office/current-guests', { params }),
  getStats: (params) => api.get('/front-office/stats', { params }),
  checkIn: (id) => api.post(`/front-office/reservations/${id}/check-in`),
  checkOut: (id) => api.post(`/front-office/reservations/${id}/check-out`),
  noShow: (id, data) => api.post(`/front-office/reservations/${id}/no-show`, data),
};

export const guestService = {
  getAll: (params) => api.get('/guests', { params }),
  getById: (id) => api.get(`/guests/${id}`),
  getReservations: (id) => api.get(`/guests/${id}/reservations`),
  create: (data) => api.post('/guests', data),
  update: (id, data) => api.put(`/guests/${id}`, data),
  getDuplicates: () => api.get('/guests/duplicates'),
  merge: (data) => api.post('/guests/merge', data),
};

export const tenantService = guestService; // Backward-compatible alias

export const inspectionService = {
  getAll: (params) => api.get('/inspections', { params }),
  getById: (id) => api.get(`/inspections/${id}`),
  create: (data) => api.post('/inspections', data),
  update: (id, data) => api.put(`/inspections/${id}`, data),
  complete: (id, data) => api.post(`/inspections/${id}/complete`, data),
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

export const accessService = {
  getCapabilities: (params) => api.get('/access/capabilities', { params }),
  updateCapability: (key, data) => api.put(`/access/capabilities/${key}`, data),
  getApprovalRequests: (params) => api.get('/access/approval-requests', { params }),
  respondApprovalRequest: (id, data) => api.post(`/access/approval-requests/${id}/respond`, data),
  forceOverride: (data) => api.post('/access/force-override', data),
  getOverrides: (params) => api.get('/access/overrides', { params }),
};

export const paymentService = {
  getTransactions: (params) => api.get('/payments', { params }),
  getById: (id) => api.get(`/payments/${id}`),
  processPayment: (data) => api.post('/payments/process', data),
  getGateways: () => api.get('/payments/gateways'),
};

export const bookingAuthService = {
  verifyBooking: (data) => api.post('/booking-authentication/verify', data),
  lookupByQuery: (params) => api.get('/booking-authentication/lookup', { params }),
};

export const communicationService = {
  getAll: (params) => api.get('/communications', { params }),
  getById: (id) => api.get(`/communications/${id}`),
  create: (data) => api.post('/communications', data),
  update: (id, data) => api.put(`/communications/${id}`, data),
  submit: (id) => api.post(`/communications/${id}/submit`),
  approve: (id, data) => api.post(`/communications/${id}/approve`, data),
  reject: (id, data) => api.post(`/communications/${id}/reject`, data),
  send: (id) => api.post(`/communications/${id}/send`),
  getTemplates: () => api.get('/communications/templates'),
};

export const notificationService = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
};

export const announcementService = {
  getAll: (params) => api.get('/announcements', { params }),
  getActive: (params) => api.get('/announcements/active', { params }),
  create: (data) => api.post('/announcements', data),
  toggle: (id, isActive) => api.patch(`/announcements/${id}/toggle`, { isActive }),
};

export const publicBookingService = {
  getLandingAnnouncements: (params) => api.get('/public/announcements', { params }),
  lookupBooking: (data) => api.post('/public/booking-lookup', data),
};

export { api };
export default api;
