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
  getReservations: (params) => api.get('/reports/reservations', { params }),
  getFinancial: (params) => api.get('/reports/financial', { params }),
  getPayments: (params) => api.get('/reports/payments', { params }),
  getExpenses: (params) => api.get('/reports/expenses', { params }),
  getAgents: (params) => api.get('/reports/agents', { params }),
  getCommissions: (params) => api.get('/reports/commissions', { params }),
  getMaintenance: (params) => api.get('/reports/maintenance', { params }),
  getInspections: (params) => api.get('/reports/inspections', { params }),
  downloadCSV: (type, filename = 'report.csv', params = {}) => {
    return api.get(`/reports/${type}`, { params: { ...params, format: 'csv' }, responseType: 'blob' }).then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });
  },
  downloadPDF: (type = 'financial', filename = 'report.pdf', params = {}) => {
    // If first argument looks like a filename (ends in .pdf) and second arg is absent, handle gracefully
    let actualType = type;
    let actualFilename = filename;
    if (typeof type === 'string' && type.endsWith('.pdf')) {
      actualType = 'financial';
      actualFilename = type;
    }
    return api.get(`/reports/${actualType}`, { params: { ...params, format: 'pdf' }, responseType: 'blob' }).then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
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
  refund: (id, data) => api.post(`/payments/${id}/refund`, data),
  getGateways: () => api.get('/payments/gateways'),
};

export const maintenanceService = {
  getAll: (params) => api.get('/maintenance', { params }),
  getStats: (params) => api.get('/maintenance/stats', { params }),
  getById: (id) => api.get(`/maintenance/${id}`),
  create: (data) => api.post('/maintenance', data),
  assign: (id, data) => api.post(`/maintenance/${id}/assign`, data),
  start: (id) => api.post(`/maintenance/${id}/start`),
  resolve: (id, data) => api.post(`/maintenance/${id}/resolve`, data),
  cancel: (id, data) => api.post(`/maintenance/${id}/cancel`, data),
};

export const expenseService = {
  getAll: (params) => api.get('/expenses', { params }),
  getStats: (params) => api.get('/expenses/stats', { params }),
  getById: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  approve: (id) => api.post(`/expenses/${id}/approve`),
  void: (id, data) => api.post(`/expenses/${id}/void`, data),
};

export const financialService = {
  getOverview: (params) => api.get('/financial/overview', { params }),
  getLedger: (params) => api.get('/financial/ledger', { params }),
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

export const agentService = {
  getAll: (params) => api.get('/agents', { params }),
  getById: (id) => api.get(`/agents/${id}`),
  getClients: (id) => api.get(`/agents/${id}/clients`),
  getPerformance: (id) => api.get(`/agents/${id}/performance`),
  create: (data) => api.post('/agents', data),
  update: (id, data) => api.put(`/agents/${id}`, data),
  updateStatus: (id, status) => api.patch(`/agents/${id}/status`, { status }),
  delete: (id) => api.delete(`/agents/${id}`),
};

export const commissionService = {
  getAll: (params) => api.get('/commissions', { params }),
  getSummary: (params) => api.get('/commissions/summary', { params }),
  getById: (id) => api.get(`/commissions/${id}`),
  calculate: (data) => api.post('/commissions/calculate', data),
  approve: (id) => api.patch(`/commissions/${id}/approve`),
  payout: (id, data) => api.post(`/commissions/${id}/payout`, data),
  void: (id, data) => api.patch(`/commissions/${id}/void`, data),
};

export const analyticsService = {
  getOverview: (params) => api.get('/analytics/overview', { params }),
  getReservations: (params) => api.get('/analytics/reservations', { params }),
  getApartments: (params) => api.get('/analytics/apartments', { params }),
  getAgents: (params) => api.get('/analytics/agents', { params }),
  getOperations: (params) => api.get('/analytics/operations', { params }),
};



export const employeeService = {
  getAll: (params) => api.get('/employees', { params }),
  getEmployees: (params) => api.get('/employees', { params }),
  getStats: (params) => api.get('/employees/stats', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  updateStatus: (id, statusOrData) => {
    const payload = typeof statusOrData === 'string' ? { employment_status: statusOrData } : statusOrData;
    return api.put(`/employees/${id}/status`, payload);
  },
  uploadPhoto: (id, data) => api.post(`/employees/${id}/photo`, data),
  getPerformance: (id, params) => api.get(`/employees/${id}/performance`, { params }),
  getEmployeePerformance: (id, params) => api.get(`/employees/${id}/performance`, { params }),
  getEvaluations: (arg1, arg2) => {
    if (typeof arg1 === 'object' || arg1 === undefined) {
      return api.get('/employees/evaluations', { params: arg1 });
    }
    return api.get(`/employees/${arg1}/evaluations`, { params: arg2 });
  },
  getEvaluationById: (id) => api.get(`/employees/evaluations/${id}`),
  getEvaluationCriteria: () => api.get('/employees/evaluation-criteria'),
  createEvaluation: (data) => api.post('/employees/evaluations', data),
  updateEvaluation: (evalId, data) => api.put(`/employees/evaluations/${evalId}`, data),
  submitEvaluation: (evalId) => api.put(`/employees/evaluations/${evalId}/submit`),
  finalizeEvaluation: (evalId) => api.put(`/employees/evaluations/${evalId}/finalize`),
  getIdCards: (params) => api.get('/employees/id-cards', { params }),
  getEmployeeIdCard: (id) => api.get(`/employees/${id}/id-card`),
  generateIdCard: (empIdOrData, payload = {}) => {
    if (typeof empIdOrData === 'object' && empIdOrData !== null) {
      return api.post('/employees/id-cards/generate', empIdOrData);
    }
    return api.post(`/employees/${empIdOrData}/id-card`, payload);
  },
  reissueIdCard: (id, data = {}) => api.post(`/employees/${id}/id-card/reissue`, data),
  revokeIdCard: (arg1, arg2, arg3 = {}) => {
    if (arg3 && typeof arg3 === 'object' && Object.keys(arg3).length > 0) {
      // Called as revokeIdCard(empId, cardId, data)
      return api.put(`/employees/${arg1}/id-card/${arg2}/revoke`, arg3);
    }
    if (typeof arg2 === 'object') {
      // Called as revokeIdCard(cardId, data)
      return api.put(`/employees/id-cards/${arg1}/revoke`, arg2);
    }
    return api.put(`/employees/id-cards/${arg1}/revoke`, {});
  },
  downloadIdCardPdf: (id) => api.get(`/employees/${id}/id-card/pdf`, { responseType: 'blob' }),
  downloadIdCardPDF: (id) => api.get(`/employees/${id}/id-card/pdf`, { responseType: 'blob' }),
  verifyIdCardToken: (token) => api.get(`/employees/verify-id-card/${token}`),
  getMyProfile: () => api.get('/employees/me/profile'),
  updateMyProfile: (data) => api.put('/employees/me/profile', data),
  getMyPerformance: (params) => api.get('/employees/me/performance', { params }),
  getMyActivities: (params) => api.get('/employees/me/activities', { params }),
  getMyEvaluations: (params) => api.get('/employees/me/evaluations', { params }),
  getMyIdCard: () => api.get('/employees/me/id-card'),
};

export { api };
export default api;
